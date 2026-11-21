import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('private client records, retries, concurrency and isolation',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw new Error('Requires disposable local database.');
 const admin=new pg.Client({connectionString:url});const db=new pg.Client({connectionString:url});await admin.connect();await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const actor of [a,b])await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@test.invalid',crypto.randomUUID(),'Client Salon '+actor,'QA Professional']);
 const sql='select aesthenda_private.save_client_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as id';
 const args=(actor,key=crypto.randomUUID(),id=null,revision=0,first='Shared',notes='Private note')=>[actor,key,id,revision,first,'Name','shared@example.invalid','+1 212 555 0101',notes];
 const save=async(...values)=>(await db.query(sql,args(...values))).rows[0].id;
 const read=async(actor,id=null,q='',page=0)=>(await db.query('select aesthenda_private.read_clients_v1($1,$2,$3,$4) as result',[actor,id,q,page])).rows[0].result;
 const key=crypto.randomUUID();let aid,bid;
 await t.test('each salon has private records even with identical contact details',async()=>{
 aid=await save(a,key);bid=await save(b);assert.notEqual(aid,bid);assert.deepEqual((await read(a)).clients.map(x=>x.id),[aid]);assert.deepEqual((await read(b)).clients.map(x=>x.id),[bid]);
 assert.equal((await read(a)).clients[0].notes,'');assert.equal((await read(a,aid)).clients[0].notes,'Private note');assert.deepEqual((await read(a,bid)).clients,[]);
 await assert.rejects(save(a,crypto.randomUUID(),bid,1,'Forged'),/CLIENT_NOT_FOUND/);assert.equal((await read(b,bid)).clients[0].firstName,'Shared');
 });
 await t.test('repeat and concurrent creates produce one record and audit event',async()=>{
 assert.equal(await save(a,key),aid);await assert.rejects(save(a,key,null,0,'Different'),/IDEMPOTENCY_CONFLICT/);
 const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');const retry=crypto.randomUUID();
 try{const results=await Promise.all([db.query(sql,args(a,retry,null,0,'Concurrent')),other.query(sql,args(a,retry,null,0,'Concurrent'))]);assert.equal(results[0].rows[0].id,results[1].rows[0].id);}finally{await other.end();}
 assert.equal(Number((await admin.query("select count(*) from public.audit_events where entity_id=$1 and action='createClient'",[aid])).rows[0].count),1);
 });
 await t.test('edits are revisioned; retry works and stale overwrite is blocked',async()=>{
 const updateKey=crypto.randomUUID();assert.equal(await save(a,updateKey,aid,1,'Updated'),aid);assert.equal(await save(a,updateKey,aid,1,'Updated'),aid);
 await assert.rejects(save(a,crypto.randomUUID(),aid,1,'Old tab'),/STALE_CLIENT/);
 const current=(await read(a,aid)).clients[0];assert.equal(current.revision,2);assert.equal(current.firstName,'Updated');assert.equal((await read(b,bid)).clients[0].revision,1);
 });
 await t.test('simultaneous different edits accept one revision only',async()=>{
 const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
 try{const results=await Promise.allSettled([db.query(sql,args(a,crypto.randomUUID(),aid,2,'Edit one')),other.query(sql,args(a,crypto.randomUUID(),aid,2,'Edit two'))]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/STALE_CLIENT/);}finally{await other.end();}
 });
 await t.test('audit failure rolls back new records and edits',async()=>{
 await admin.query("create function public.test_fail_client_audit() returns trigger language plpgsql as $$ begin if new.entity_type='Client' then raise exception 'injected client audit failure'; end if; return new; end $$;create trigger test_fail_client_audit before insert on public.audit_events for each row execute function public.test_fail_client_audit()");
 try{await assert.rejects(save(a,crypto.randomUUID(),null,0,'Rollback client'),/injected client audit failure/);await assert.rejects(save(a,crypto.randomUUID(),aid,3,'Rollback edit'),/injected client audit failure/);}finally{await admin.query('drop trigger test_fail_client_audit on public.audit_events;drop function public.test_fail_client_audit()');}
 assert.equal((await read(a,null,'Rollback')).clients.length,0);assert.equal((await read(a,aid)).clients[0].revision,3);
 });
 await t.test('database independently rejects invalid input and unauthenticated actors',async()=>{
 for(const values of [args(a,crypto.randomUUID(),null,0,''),args(a,crypto.randomUUID(),null,0,'Valid','x'.repeat(2001)),[a,crypto.randomUUID(),null,0,'Valid','','invalid','',''],[a,crypto.randomUUID(),null,0,'Valid','','','abc','']])await assert.rejects(db.query(sql,values),/INVALID_INPUT/);
 await assert.rejects(read(null),/UNAUTHENTICATED/);await assert.rejects(read(crypto.randomUUID()),/BUSINESS_UNAVAILABLE/);
 });
 await t.test('RLS and grants block direct or public access',async()=>{
 await assert.rejects(db.query('select * from public.clients'),/permission denied/);await assert.rejects(db.query('select aesthenda_private.client_context($1)',[a]),/permission denied/);
 for(const role of ['anon','authenticated']){assert.equal((await admin.query("select has_function_privilege($1,'aesthenda_private.read_clients_v1(uuid,uuid,text,integer)','EXECUTE') as ok",[role])).rows[0].ok,false);}
 await admin.query('begin');await admin.query('set local role aesthenda_clients_owner');
 try{await admin.query('select aesthenda_private.client_context($1)',[a]);assert.equal((await admin.query('select count(*)::int as n from public.clients where id=$1',[bid])).rows[0].n,0);}finally{await admin.query('rollback');}
 });
 await t.test('bounded search and fresh connections return durable owner data',async()=>{
 const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
 try{assert.equal((await other.query('select aesthenda_private.read_clients_v1($1,$2) as result',[a,aid])).rows[0].result.clients[0].revision,3);}finally{await other.end();}
 assert.ok((await read(a,null,'SHARED@EXAMPLE')).clients.length>0);assert.equal((await read(a,null,'%')).clients.length,0);
 for(let i=0;i<51;i++)await save(b,crypto.randomUUID(),null,0,'Page '+String(i).padStart(2,'0'));
 const first=await read(b),second=await read(b,null,'',1);assert.equal(first.clients.length,50);assert.equal(first.hasMore,true);assert.equal(second.clients.length,2);assert.equal(second.hasMore,false);assert.ok(!first.clients.some(x=>second.clients.some(y=>x.id===y.id)));
 });
});
