import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('weekly availability isolation, concurrency, validation and atomicity',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw new Error('Requires disposable local database.');
 const admin=new pg.Client({connectionString:url});await admin.connect();const db=new pg.Client({connectionString:url});await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const actor of [a,b])await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@test.invalid',crypto.randomUUID(),'Hours salon','QA Professional']);
 const read=async(actor)=>(await db.query('select aesthenda_private.read_availability_v1($1) as result',[actor])).rows[0].result;
 const save=async(actor,revision,windows,key=crypto.randomUUID(),zone='America/New_York',connection=db)=>(await connection.query('select aesthenda_private.save_availability_v1($1,$2,$3,$4,$5::jsonb) as result',[actor,key,revision,zone,JSON.stringify(windows)])).rows[0].result;
 const hours=[{day:1,startMinute:540,endMinute:720},{day:1,startMinute:780,endMinute:1020}];let request=crypto.randomUUID();
 await t.test('unsaved schedule has no invented hours; split periods and zone persist per salon',async()=>{
  assert.deepEqual(await read(a),{revision:0,timezone:null,windows:[]});assert.deepEqual(await read(b),{revision:0,timezone:null,windows:[]});
  const saved=await save(a,0,hours,request);assert.equal(saved.revision,1);assert.deepEqual(saved.windows,hours);assert.equal(saved.timezone,'America/New_York');assert.equal((await read(b)).revision,0);
  await save(b,0,[{day:6,startMinute:1320,endMinute:1440}],crypto.randomUUID(),'Europe/London');assert.equal((await read(a)).timezone,'America/New_York');assert.equal((await read(b)).windows[0].endMinute,1440);
 });
 await t.test('replays do not advance revision and stale tabs cannot overwrite newer edits',async()=>{
  assert.equal((await save(a,0,hours,request)).revision,1);await assert.rejects(save(a,0,[],request),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(save(a,0,[]),/STALE_SCHEDULE/);assert.deepEqual((await read(a)).windows,hours);
 });
 await t.test('overlap, bad ranges and invalid zones fail without replacing saved hours',async()=>{
  for(const windows of [[{day:1,startMinute:540,endMinute:720},{day:1,startMinute:600,endMinute:800}],[{day:1,startMinute:1320,endMinute:120}],[{day:7,startMinute:0,endMinute:120}],[{day:1,startMinute:0.5,endMinute:120}],[{day:1,startMinute:0}]])await assert.rejects(save(a,1,windows),/INVALID_INPUT|OVERLAPPING_HOURS/);
  await assert.rejects(save(a,1,hours,crypto.randomUUID(),'EST'),/INVALID_INPUT/);assert.deepEqual((await read(a)).windows,hours);
 });
 await t.test('concurrent edits accept one revision and reject the stale writer',async()=>{
  const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
  try{const result=await Promise.allSettled([save(a,1,[],crypto.randomUUID()),save(a,1,[{day:2,startMinute:600,endMinute:900}],crypto.randomUUID(),'America/New_York',other)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.match(result.find(x=>x.status==='rejected').reason.message,/STALE_SCHEDULE/);}finally{await other.end();}
  assert.equal((await read(a)).revision,2);assert.equal((await read(b)).revision,1);
 });
 await t.test('forced window failure restores previous schedule, revision and audit',async()=>{
  const before=await read(a);const count=Number((await admin.query("select count(*) from public.audit_events where actor_id=$1 and action='saveWeeklyAvailability'",[a])).rows[0].count);
  await admin.query("create function public.test_fail_hours() returns trigger language plpgsql as $$ begin raise exception 'injected hours failure'; end $$;create trigger test_fail_hours before insert on public.availability_windows for each row execute function public.test_fail_hours()");
  try{await assert.rejects(save(a,2,hours),/injected hours failure/);}finally{await admin.query('drop trigger test_fail_hours on public.availability_windows;drop function public.test_fail_hours()');}
  assert.deepEqual(await read(a),before);assert.equal(Number((await admin.query("select count(*) from public.audit_events where actor_id=$1 and action='saveWeeklyAvailability'",[a])).rows[0].count),count);
 });
 await t.test('database and public roles cannot bypass private account boundaries',async()=>{
  await assert.rejects(db.query('select * from public.availability_windows'),/permission denied/);await assert.rejects(db.query('select * from aesthenda_private.weekly_schedules'),/permission denied/);await assert.rejects(db.query('select aesthenda_private.availability_context($1)',[a]),/permission denied/);
  for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_function_privilege($1,'aesthenda_private.save_availability_v1(uuid,uuid,integer,text,jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  await admin.query('begin');await admin.query('set local role aesthenda_availability_owner');try{await admin.query('select aesthenda_private.availability_context($1)',[a]);const zones=(await admin.query('select distinct timezone from public.availability_windows')).rows;assert.ok(zones.every(z=>z.timezone==='America/New_York'));}finally{await admin.query('rollback');}
 });
 await t.test('closed week and changed timezone persist without affecting the other salon; audits retain prior hours',async()=>{
  const saved=await save(a,2,[],crypto.randomUUID(),'America/Los_Angeles');assert.deepEqual(saved.windows,[]);assert.equal(saved.revision,3);
  const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');try{assert.equal((await other.query('select aesthenda_private.read_availability_v1($1) as result',[a])).rows[0].result.timezone,'America/Los_Angeles');}finally{await other.end();}
  assert.equal((await read(b)).timezone,'Europe/London');const audit=(await admin.query("select metadata from public.audit_events where actor_id=$1 and action='saveWeeklyAvailability' order by created_at desc limit 1",[a])).rows[0].metadata;assert.equal(audit.new_revision,3);assert.ok(Array.isArray(audit.prior_windows));
 });
 await t.test('timezone changes with future appointments require review and leave hours unchanged',async()=>{
  const identity=(await admin.query('select b.id as bid,p.id as pid from public.businesses b join public.professionals p on p.business_id=b.id where b.owner_user_id=$1',[a])).rows[0];
  const client=(await admin.query('insert into public.clients(business_id) values($1) returning id',[identity.bid])).rows[0].id;
  const service=(await admin.query("insert into public.services(business_id,name,duration_minutes,price_cents) values($1,'Future review fixture',30,0) returning id",[identity.bid])).rows[0].id;
  const appointment=(await admin.query("insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,service_snapshot) values($1,$2,$3,$4,now()+interval '1 day',now()+interval '25 hours','confirmed','{}') returning id",[identity.bid,identity.pid,client,service])).rows[0].id;
  try{await assert.rejects(save(a,3,[],crypto.randomUUID(),'Europe/Paris'),/TIMEZONE_REVIEW_REQUIRED/);assert.equal((await read(a)).revision,3);assert.equal((await read(a)).timezone,'America/Los_Angeles');}
  finally{await admin.query('delete from public.appointments where id=$1',[appointment]);}
 });

});
