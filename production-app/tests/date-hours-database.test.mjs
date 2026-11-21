import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('date overrides isolation, precedence, revisions and review guards',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw new Error('Disposable local database required');
 const admin=new pg.Client({connectionString:url});await admin.connect();const db=new pg.Client({connectionString:url});await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();await admin.query('insert into auth.users values($1),($2)',[a,b]);
 const weekly=[{day:1,startMinute:540,endMinute:1020}];for(const actor of[a,b]){await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@test.invalid',crypto.randomUUID(),'Dates QA','QA Name']);await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[actor,crypto.randomUUID(),'America/New_York',JSON.stringify(weekly)]);}
 const date='2099-01-05'; // Monday; future date independent of fixture run day.
 const save=(actor,revision,mode,windows=[],key=crypto.randomUUID(),week=1)=>db.query('select aesthenda_private.save_date_hours_v1($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,key,date,revision,week,mode,JSON.stringify(windows)]);
 const effective=async(actor)=>(await db.query('select aesthenda_private.effective_date_hours_v1($1,$2) as result',[actor,date])).rows[0].result;
 const list=async(actor)=>(await db.query('select aesthenda_private.read_date_hours_v1($1) as result',[actor])).rows[0].result;
 await t.test('closed date supersedes weekly hours only for its owner, with idempotent replay',async()=>{
  assert.equal((await effective(a)).source,'weekly');const key=crypto.randomUUID();await save(a,0,'closed',[],key);await save(a,0,'closed',[],key);assert.equal((await list(a))[0].revision,1);assert.deepEqual((await effective(a)).windows,[]);assert.equal((await effective(b)).source,'weekly');assert.deepEqual(await list(b),[]);
  await assert.rejects(save(a,0,'weekly',[],key),/IDEMPOTENCY_CONFLICT/);await assert.rejects(save(a,0,'weekly'),/STALE_SCHEDULE/);
 });
 await t.test('custom hours override the date and reverting restores the weekly schedule',async()=>{
  const windows=[{startMinute:600,endMinute:720},{startMinute:780,endMinute:900}];await save(a,1,'custom',windows);assert.deepEqual((await effective(a)).windows,windows);await save(a,2,'weekly');assert.equal((await effective(a)).source,'weekly');assert.deepEqual((await effective(a)).windows,[{startMinute:540,endMinute:1020}]);assert.equal((await list(a))[0].revision,3);
  assert.equal((await db.query('select aesthenda_private.read_availability_v1($1) as r',[a])).rows[0].r.revision,1);
 });
 await t.test('invalid input and overlapping periods leave stored revisions unchanged',async()=>{
  await assert.rejects(save(a,3,'custom',[{startMinute:600,endMinute:780},{startMinute:650,endMinute:900}]),/OVERLAPPING_HOURS/);await assert.rejects(save(a,3,'custom',[]),/INVALID_INPUT/);assert.equal((await list(a))[0].revision,3);
 });
 await t.test('time zone change with future exceptions is blocked until the exception is restored',async()=>{
  await save(a,3,'closed');await assert.rejects(db.query('select aesthenda_private.save_availability_v1($1,$2,1,$3,$4)',[a,crypto.randomUUID(),'Europe/London',JSON.stringify(weekly)]),/TIMEZONE_REVIEW_REQUIRED/);assert.equal((await list(a))[0].revision,4);await save(a,4,'weekly');
 });
 await t.test('audit failure rolls back the exception and retry journal together',async()=>{
  await admin.query("create function public.fail_date_audit() returns trigger language plpgsql as $$ begin if new.action='saveDateAvailability' then raise exception 'injected date audit failure';end if;return new;end $$;create trigger fail_date_audit before insert on public.audit_events for each row execute function public.fail_date_audit()");
  const key=crypto.randomUUID();try{await assert.rejects(save(a,5,'closed',[],key),/injected date audit failure/);}finally{await admin.query('drop trigger fail_date_audit on public.audit_events;drop function public.fail_date_audit()');}
  assert.equal((await list(a))[0].revision,5);await save(a,5,'closed',[],key);assert.equal((await list(a))[0].revision,6);
 });
 await t.test('runtime/public roles cannot directly read date records',async()=>{
  await assert.rejects(db.query('select * from aesthenda_private.date_hours'),/permission denied/);for(const role of['anon','authenticated'])assert.equal((await admin.query("select has_function_privilege($1,'aesthenda_private.save_date_hours_v1(uuid,uuid,date,integer,integer,text,jsonb)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  await admin.query('begin');await admin.query('set local role aesthenda_availability_owner');try{await admin.query('select aesthenda_private.availability_context($1)',[b]);assert.equal((await admin.query('select count(*)::int n from aesthenda_private.date_hours')).rows[0].n,0);}finally{await admin.query('rollback');}
 });
 await t.test('competing date edits and changed weekly revisions are rejected safely',async()=>{
  const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
  try{const results=await Promise.allSettled([save(a,6,'weekly'),other.query('select aesthenda_private.save_date_hours_v1($1,$2,$3,6,1,$4,$5::jsonb)',[a,crypto.randomUUID(),date,'custom',JSON.stringify([{startMinute:600,endMinute:720}])])]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/STALE_SCHEDULE/);}finally{await other.end();}
  await assert.rejects(save(a,7,'closed',[],crypto.randomUUID(),0),/STALE_SCHEDULE/);assert.equal((await list(a))[0].revision,7);
 });
 await t.test('future appointments require review without changing the date or appointment',async()=>{
  const x=(await admin.query('select b.id bid,p.id pid from public.businesses b join public.professionals p on p.business_id=b.id where b.owner_user_id=$1',[a])).rows[0];
  const client=(await admin.query('insert into public.clients(business_id) values($1) returning id',[x.bid])).rows[0].id;
  const service=(await admin.query("insert into public.services(business_id,name,duration_minutes,price_cents) values($1,'Date guard',30,0) returning id",[x.bid])).rows[0].id;
  const appointment=(await admin.query("insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,service_snapshot) values($1,$2,$3,$4,'2099-01-05 15:00Z','2099-01-05 16:00Z','confirmed','{}') returning id",[x.bid,x.pid,client,service])).rows[0].id;
  try{await assert.rejects(save(a,7,'closed'),/APPOINTMENT_REVIEW_REQUIRED/);assert.equal((await list(a))[0].revision,7);assert.equal((await admin.query('select status from public.appointments where id=$1',[appointment])).rows[0].status,'confirmed');}finally{await admin.query('delete from public.appointments where id=$1',[appointment]);}
 });

});
