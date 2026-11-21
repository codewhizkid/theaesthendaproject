import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('service catalog tenant isolation and atomic persistence',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test')) throw new Error('Requires disposable local database.');
 const admin=new pg.Client({connectionString:url});await admin.connect();
 const db=new pg.Client({connectionString:url});await db.connect();await db.query('set role aesthenda_runtime');
 t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();
 await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const actor of [a,b]) await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@test.invalid',crypto.randomUUID(),'Salon '+actor,'QA Professional']);
 const create=async(actor,name,key=crypto.randomUUID())=>(await db.query("select aesthenda_private.create_service_v1($1,$2,$3,'Details',45,12345) as id",[actor,key,name])).rows[0].id;
 const read=async(actor,id=null)=>(await db.query('select aesthenda_private.read_services_v1($1,$2) as result',[actor,id])).rows[0].result;
 const key=crypto.randomUUID();let aid,bid;
 await t.test('two owners can use the same name with isolated records',async()=>{
  aid=await create(a,'Shared name',key);bid=await create(b,'Shared name');assert.notEqual(aid,bid);
  assert.deepEqual((await read(a)).map(s=>s.id),[aid]);assert.deepEqual((await read(b)).map(s=>s.id),[bid]);
  assert.equal((await read(a))[0].priceCents,12345);
  assert.deepEqual(await read(a,bid),[]);assert.deepEqual(await read(b,aid),[]);
 });
 await t.test('cross-owner archive and unknown ID give the same denial',async()=>{
  await assert.rejects(db.query('select aesthenda_private.archive_service_v1($1,$2)',[a,bid]),/SERVICE_NOT_FOUND/);
  await assert.rejects(db.query('select aesthenda_private.archive_service_v1($1,$2)',[a,crypto.randomUUID()]),/SERVICE_NOT_FOUND/);
  assert.equal((await read(b,bid))[0].status,'draft');
 });
 await t.test('idempotency and concurrency do not duplicate service, segment or audit',async()=>{
  assert.equal(await create(a,'Shared name',key),aid);
  await assert.rejects(create(a,'Changed name',key),/IDEMPOTENCY_CONFLICT/);
  const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
  const retry=crypto.randomUUID();
  try {
   const [x,y]=await Promise.all([create(a,'Concurrent',retry),other.query("select aesthenda_private.create_service_v1($1,$2,'Concurrent','Details',45,12345) as id",[a,retry])]);assert.equal(x,y.rows[0].id);
  }finally{await other.end();}
  assert.equal(Number((await admin.query('select count(*) from public.service_segments where service_id=$1',[aid])).rows[0].count),1);
  assert.equal(Number((await admin.query("select count(*) from public.audit_events where entity_id=$1 and action='createService'",[aid])).rows[0].count),1);
 });
 await t.test('failed segment insert rolls back service and audit',async()=>{
  await admin.query("create function public.test_fail_service_segment() returns trigger language plpgsql as $$ begin raise exception 'injected segment failure'; end $$; create trigger test_fail_service_segment before insert on public.service_segments for each row execute function public.test_fail_service_segment()");
  try{await assert.rejects(create(a,'Rollback marker'),/injected segment failure/);}finally{await admin.query('drop trigger test_fail_service_segment on public.service_segments;drop function public.test_fail_service_segment()');}
  assert.equal(Number((await admin.query("select count(*) from public.services where name='Rollback marker'")).rows[0].count),0);
 });
 await t.test('runtime and public API roles have no direct table or private context access',async()=>{
  await assert.rejects(db.query('select * from public.services'),/permission denied/);
  await assert.rejects(db.query('update public.services set is_public=true where id=$1',[aid]),/permission denied/);
  await assert.rejects(db.query('select aesthenda_private.service_context($1)',[a]),/permission denied/);
  for(const role of ['anon','authenticated']){
   assert.equal((await admin.query("select has_function_privilege($1,'aesthenda_private.read_services_v1(uuid,uuid)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
   const denied=new pg.Client({connectionString:url});await denied.connect();await denied.query('set role '+role);
   try{await assert.rejects(denied.query('select aesthenda_private.read_services_v1($1,null)',[a]),/permission denied/);}finally{await denied.end();}
  }
 });
 await t.test('RLS filters another salon even for the non-bypass function owner',async()=>{
  await admin.query('begin');await admin.query('set local role aesthenda_services_owner');
  try{await admin.query('select aesthenda_private.service_context($1)',[a]);assert.equal((await admin.query('select count(*)::int as n from public.services where id=$1',[bid])).rows[0].n,0);}finally{await admin.query('rollback');}
 });
 await t.test('new connections see durable data and archive is idempotent and preserves history',async()=>{
  const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
  try{assert.equal((await other.query('select aesthenda_private.read_services_v1($1,$2) as result',[a,aid])).rows[0].result[0].name,'Shared name');}finally{await other.end();}
  for(let i=0;i<2;i++)await db.query('select aesthenda_private.archive_service_v1($1,$2)',[a,aid]);
  assert.equal((await read(a,aid))[0].status,'archived');assert.equal((await read(b,bid))[0].status,'draft');
  assert.equal(Number((await admin.query("select count(*) from public.audit_events where entity_id=$1 and action='archiveService'",[aid])).rows[0].count),1);
 });
});
