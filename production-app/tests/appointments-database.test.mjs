import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('professional appointment scheduling and isolation',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw new Error('Requires disposable local database.');
 const admin=new pg.Client({connectionString:url}),db=new pg.Client({connectionString:url});await admin.connect();await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const a=crypto.randomUUID(),b=crypto.randomUUID();await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 const data={};const windows=Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020}));
 for(const actor of [a,b]){
 const setup=(await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5) as r',[actor,'qa@test.invalid',crypto.randomUUID(),'Appointment Salon '+actor,'QA Professional'])).rows[0].r;
 const client=(await db.query("select aesthenda_private.save_client_v1($1,$2,null,0,'Client','Tester','qa@example.invalid','','') as id",[actor,crypto.randomUUID()])).rows[0].id;
 const service=(await db.query("select aesthenda_private.create_service_v1($1,$2,'Haircut','',45,6500) as id",[actor,crypto.randomUUID()])).rows[0].id;
 await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[actor,crypto.randomUUID(),'America/New_York',JSON.stringify(windows)]);
 data[actor]={...setup,client,service};
 }
 const slots=async(actor,date='2030-01-07',service=data[actor].service)=>(await db.query('select aesthenda_private.appointment_slots_v1($1,$2,$3) as r',[actor,service,date])).rows[0].r;
 const read=async(actor,date='2030-01-07',id=null)=>(await db.query('select aesthenda_private.read_appointments_v1($1,$2,$3) as r',[actor,date,id])).rows[0].r;
 const sql='select aesthenda_private.create_appointment_v1($1,$2,$3,$4,$5,$6) as id';
 const args=(actor,start,token,key=crypto.randomUUID(),client=data[actor].client,service=data[actor].service)=>[actor,key,client,service,start,token];
 const create=async(...x)=>(await db.query(sql,args(...x))).rows[0].id;
 let preview,aid,bid;const key=crypto.randomUUID();
 await t.test('server offers full-duration times within hours, and adjacent starts fit',async()=>{
 preview=await slots(a);assert.equal(preview.timezone,'America/New_York');assert.equal(preview.slots[0].minute,540);assert.equal(preview.slots.at(-1).minute,975);
 aid=await create(a,'2030-01-07T14:00:00Z',preview.service.token,key);bid=await create(b,'2030-01-07T14:00:00Z',(await slots(b)).service.token);
 const after=await slots(a);assert.ok(!after.slots.some(s=>s.minute===540));assert.ok(after.slots.some(s=>s.minute===585));
 const booked=(await read(a)).appointments[0];assert.equal(booked.id,aid);assert.equal(booked.status,'pending');assert.equal(booked.priceCents,6500);assert.equal(new Date(booked.endAt)-new Date(booked.startAt),45*60000);
 });
 await t.test('two salons cannot read or mutate each other or use foreign clients/services',async()=>{
 assert.deepEqual((await read(a,'2030-01-07',bid)).appointments,[]);assert.equal((await read(b)).appointments.length,1);
 await assert.rejects(db.query(sql,args(a,'2030-01-07T15:00:00Z',preview.service.token,crypto.randomUUID(),data[b].client)),/CLIENT_UNAVAILABLE/);
 await assert.rejects(slots(a,'2030-01-07',data[b].service),/SERVICE_UNAVAILABLE/);
 await assert.rejects(db.query('select aesthenda_private.cancel_appointment_v1($1,$2,1)',[a,bid]),/APPOINTMENT_UNAVAILABLE/);
 });
 await t.test('replay preserves the original reservation; changed request and occupied time fail',async()=>{
 assert.equal(await create(a,'2030-01-07T14:00:00Z',preview.service.token,key),aid);
 await assert.rejects(create(a,'2030-01-07T15:00:00Z',preview.service.token,key),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(create(a,'2030-01-07T14:15:00Z',preview.service.token),/SLOT_UNAVAILABLE/);
 assert.equal(Number((await admin.query('select count(*) from public.appointment_segments where appointment_id=$1',[aid])).rows[0].count),1);
 });
 await t.test('two concurrent requests for the same time allow exactly one',async()=>{
 const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');try{
 const result=await Promise.allSettled([db.query(sql,args(a,'2030-01-07T16:00:00Z',preview.service.token)),other.query(sql,args(a,'2030-01-07T16:00:00Z',preview.service.token))]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.match(result.find(x=>x.status==='rejected').reason.message,/SLOT_UNAVAILABLE/);
 }finally{await other.end();}
 });
 await t.test('closed/custom date hours, split shifts and stale previews are rechecked',async()=>{
 await db.query("select aesthenda_private.save_date_hours_v1($1,$2,'2030-01-08',0,1,'closed','[]')",[a,crypto.randomUUID()]);assert.equal((await slots(a,'2030-01-08')).slots.length,0);
 await assert.rejects(create(a,'2030-01-08T14:00:00Z',preview.service.token),/SLOT_UNAVAILABLE/);
 await db.query("select aesthenda_private.save_date_hours_v1($1,$2,'2030-01-09',0,1,'custom',$3)",[a,crypto.randomUUID(),JSON.stringify([{startMinute:600,endMinute:660},{startMinute:720,endMinute:780}])]);
 const custom=await slots(a,'2030-01-09');assert.equal(custom.slots[0].minute,600);assert.ok(!custom.slots.some(x=>x.minute===650));assert.ok(custom.slots.some(x=>x.minute===720));
 const old=await slots(a,'2030-01-10');await db.query("select aesthenda_private.save_date_hours_v1($1,$2,'2030-01-10',0,1,'closed','[]')",[a,crypto.randomUUID()]);await assert.rejects(create(a,old.slots[0].startAt,old.service.token),/SLOT_UNAVAILABLE/);
 });
 await t.test('calendar blocks and active server holds reserve time; expired holds do not',async()=>{
 const row=(await admin.query('select id from public.professionals where business_id=$1',[data[a].businessAccountId])).rows[0];
 await admin.query("insert into public.calendar_blocks(business_id,professional_id,start_at,end_at,block_type) values($1,$2,'2030-01-11T14:00Z','2030-01-11T15:00Z','time_off')",[data[a].businessAccountId,row.id]);
 await admin.query("insert into public.booking_holds(business_id,professional_id,client_id,service_id,start_at,end_at,expires_at) values($1,$2,$3,$4,'2030-01-11T16:00Z','2030-01-11T17:00Z',now()+interval '10 minutes')",[data[a].businessAccountId,row.id,data[a].client,data[a].service]);
 const held=await slots(a,'2030-01-11');assert.ok(!held.slots.some(x=>[540,660].includes(x.minute)));
 await assert.rejects(create(a,'2030-01-11T16:00:00Z',preview.service.token),/SLOT_UNAVAILABLE/);
 await admin.query('update public.booking_holds set expires_at=now()-interval \'1 second\' where business_id=$1',[data[a].businessAccountId]);assert.ok((await slots(a,'2030-01-11')).slots.some(x=>x.minute===660));
 });
 await t.test('service changes reject stale price/duration; snapshots remain immutable',async()=>{
 await admin.query('update public.services set price_cents=9900,price=99 where id=$1',[data[a].service]);
 await assert.rejects(create(a,'2030-01-07T18:00:00Z',preview.service.token),/SERVICE_CHANGED/);
 assert.equal((await read(a,'2030-01-07',aid)).appointments[0].priceCents,6500);
 });
 await t.test('nonexistent/ambiguous DST times and transitions cannot book silently',async()=>{
 for(const [date,windows]of [['2030-03-10',[{startMinute:0,endMinute:300}]],['2030-11-03',[{startMinute:0,endMinute:300}]]])await db.query("select aesthenda_private.save_date_hours_v1($1,$2,$3,0,1,'custom',$4)",[a,crypto.randomUUID(),date,JSON.stringify(windows)]);
 const spring=await slots(a,'2030-03-10'),fall=await slots(a,'2030-11-03');assert.ok(!spring.slots.some(x=>x.minute>=120&&x.minute<180));assert.ok(!fall.slots.some(x=>x.minute>=60&&x.minute<120));assert.ok(spring.slots.some(x=>x.minute===180));
 await assert.rejects(create(a,'2030-11-03T05:30:00Z',fall.service.token),/SLOT_UNAVAILABLE/);await assert.rejects(create(a,'2030-11-03T06:30:00Z',fall.service.token),/SLOT_UNAVAILABLE/);
 });
 await t.test('injected segment failure rolls back appointment, journal and audit',async()=>{
 await admin.query("create function public.test_fail_appointment_segment() returns trigger language plpgsql as $$ begin raise exception 'injected appointment segment failure'; end $$;create trigger test_fail_appointment_segment before insert on public.appointment_segments for each row execute function public.test_fail_appointment_segment()");
 const current=await slots(a,'2030-01-12');const rollbackKey=crypto.randomUUID();try{await assert.rejects(create(a,current.slots[0].startAt,current.service.token,rollbackKey),/injected appointment segment failure/);}finally{await admin.query('drop trigger test_fail_appointment_segment on public.appointment_segments;drop function public.test_fail_appointment_segment()');}
 assert.equal((await read(a,'2030-01-12')).appointments.length,0);assert.equal(Number((await admin.query('select count(*) from aesthenda_private.appointment_requests where request_key=$1',[rollbackKey])).rows[0].count),0);
 });
 await t.test('cancellation preserves history, releases time and is retry safe',async()=>{
 for(let i=0;i<2;i++)await db.query('select aesthenda_private.cancel_appointment_v1($1,$2,1)',[a,aid]);
 assert.equal((await read(a,'2030-01-07',aid)).appointments[0].status,'cancelled');assert.ok((await slots(a)).slots.some(x=>x.minute===540));assert.equal((await read(b)).appointments[0].status,'pending');
 const fresh=new pg.Client({connectionString:url});await fresh.connect();await fresh.query('set role aesthenda_runtime');try{assert.equal((await fresh.query('select aesthenda_private.read_appointments_v1($1,null,$2) as r',[a,aid])).rows[0].r.appointments[0].status,'cancelled');}finally{await fresh.end();}
 });
 await t.test('runtime/public cannot access tables or private helper functions',async()=>{
 for(const table of ['appointments','appointment_segments','booking_holds','calendar_blocks'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
 await assert.rejects(db.query('select aesthenda_private.appointment_context($1)',[a]),/permission denied/);
 for(const role of ['anon','authenticated'])assert.equal((await admin.query("select has_function_privilege($1,'aesthenda_private.create_appointment_v1(uuid,uuid,uuid,uuid,timestamptz,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
 await admin.query('begin');await admin.query('set local role aesthenda_appointments_owner');try{await admin.query('select aesthenda_private.appointment_context($1)',[a]);assert.equal((await admin.query('select count(*)::int as n from public.appointments where id=$1',[bid])).rows[0].n,0);}finally{await admin.query('rollback');}
 });
});
