import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('salon visibility saves persist with retry, revision and tenant protections',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw Error('Disposable local database only.');
 const admin=new pg.Client({connectionString:url}),db=new pg.Client({connectionString:url});await admin.connect();await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 const businesses={};for(const actor of [a,b])businesses[actor]=(await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5) r',[actor,'qa@test.invalid',crypto.randomUUID(),'Visibility '+actor,'Professional'])).rows[0].r;
 const read=async(actor=a)=>(await db.query('select aesthenda_private.read_client_booking_visibility_v1($1) r',[actor])).rows[0].r;
 const save=async(revision,percent,actor=a)=>db.query('select aesthenda_private.save_client_booking_visibility_v1($1,$2,$3)',[actor,revision,percent]);
 const preferences=async()=>(await db.query('select aesthenda_private.read_booking_preferences_v2($1) r',[a])).rows[0].r;
 await t.test('default is 100%, all options persist, another salon stays unchanged',async()=>{
  assert.deepEqual(await read(),{showPercent:100,revision:0});
  let revision=0;for(const percent of [20,50,80,100]){await save(revision,percent);revision++;assert.deepEqual(await read(),{showPercent:percent,revision});assert.deepEqual(await read(b),{showPercent:100,revision:0});}
 });
 await t.test('identical immediate retry is idempotent; stale and invalid saves cannot overwrite',async()=>{
  await save(4,20);await save(4,20);assert.equal((await read()).revision,5);
  await assert.rejects(save(4,50),/STALE_PREFERENCES/);await assert.rejects(save(3,20),/STALE_PREFERENCES/);
  for(const percent of [0,30,101,null])await assert.rejects(save(5,percent),/INVALID_INPUT/);
  await assert.rejects(save(-1,20),/INVALID_INPUT/);assert.deepEqual(await read(),{showPercent:20,revision:5});
 });
 await t.test('visibility and existing preference writes preserve each other and reject stale forms',async()=>{
  let p=await preferences();await db.query('select aesthenda_private.save_booking_preferences_v2($1,$2,true,true,3)',[a,p.revision]);
  assert.deepEqual(await read(),{showPercent:20,revision:6});await assert.rejects(save(5,80),/STALE_PREFERENCES/);
  await save(6,80);p=await preferences();assert.equal(p.autoConfirm,true);assert.equal(p.maxConcurrentClients,3);
  await assert.rejects(db.query('select aesthenda_private.save_booking_preferences_v2($1,6,false,true,2)',[a]),/STALE_PREFERENCES/);
  const count=(await admin.query("select count(*) from public.audit_events where business_id=$1 and action='updateClientBookingVisibility'",[businesses[a].businessAccountId])).rows[0].count;assert.equal(count,'6');
 });
 await t.test('independent database connection sees saved percentage',async()=>{const other=new pg.Client({connectionString:url});await other.connect();try{await other.query('set role aesthenda_runtime');assert.equal((await other.query('select aesthenda_private.read_client_booking_visibility_v1($1) r',[a])).rows[0].r.showPercent,80);}finally{await other.end();}});
 await t.test('concurrent saves serialize without losing updates',async()=>{const other=new pg.Client({connectionString:url});await other.connect();try{await other.query('set role aesthenda_runtime');const result=await Promise.allSettled([save(7,20),other.query('select aesthenda_private.save_client_booking_visibility_v1($1,7,50)',[a])]);assert.equal(result.filter(value=>value.status==='fulfilled').length,1);assert.match(result.find(value=>value.status==='rejected').reason.message,/STALE_PREFERENCES/);assert.equal((await read()).revision,8);}finally{await other.end();}});
 await t.test('functions remain private, table inaccessible to runtime, invalid actor denied',async()=>{
  for(const role of ['anon','authenticated'])for(const signature of ['read_client_booking_visibility_v1(uuid)','save_client_booking_visibility_v1(uuid,integer,integer)'])assert.equal((await admin.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,'aesthenda_private.'+signature])).rows[0].ok,false);
  await assert.rejects(db.query('select * from aesthenda_private.booking_preferences'),/permission denied/);await assert.rejects(read(null),/UNAUTHENTICATED/);await assert.rejects(read(crypto.randomUUID()),/BUSINESS_UNAVAILABLE/);
  await admin.query("update public.businesses set status='suspended' where id=$1",[businesses[b].businessAccountId]);await assert.rejects(save(0,50,b),/BUSINESS_UNAVAILABLE/);
 });
});
