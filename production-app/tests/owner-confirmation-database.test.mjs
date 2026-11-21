import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('calendar confirmation outbox is atomic, scoped and retry safe',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw Error('Requires disposable local database.');
 const admin=new pg.Client({connectionString:url}),db=new pg.Client({connectionString:url});await admin.connect();await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const actor=crypto.randomUUID(),other=crypto.randomUUID();await admin.query('insert into auth.users values($1),($2)',[actor,other]);
 const data={};for(const who of [actor,other]){
 const business=(await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5) r',[who,'qa@example.invalid',crypto.randomUUID(),'Receipt Salon','Professional'])).rows[0].r;
 const client=(await db.query("select aesthenda_private.save_client_v1($1,$2,null,0,'Receipt','Client','qa@example.invalid','','') id",[who,crypto.randomUUID()])).rows[0].id;
 const service=(await db.query("select aesthenda_private.create_service_v1($1,$2,'Haircut','',30,3500) id",[who,crypto.randomUUID()])).rows[0].id;
 await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[who,crypto.randomUUID(),'America/New_York',JSON.stringify(Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020})))]);
 const token=(await db.query("select aesthenda_private.appointment_slots_v1($1,$2,'2030-01-07') r",[who,service])).rows[0].r.service.token;
 data[who]={business:business.businessAccountId,client,service,token};
 }
 const args=(who=actor,start='2030-01-07T14:00:00Z',key=crypto.randomUUID())=>[who,key,data[who].client,data[who].service,start,data[who].token];
 const create=async a=>(await db.query('select aesthenda_private.create_owner_appointment_v1($1,$2,$3,$4,$5,$6) id',a)).rows[0].id;
 const op=async(id,action,payload={},who=actor)=>(await db.query('select aesthenda_private.owner_booking_message_v1($1,$2,$3,$4) r',[who,id,action,JSON.stringify(payload)])).rows[0].r;
 const rows=async id=>(await admin.query('select * from aesthenda_private.booking_confirmation_messages where appointment_id=$1',[id])).rows;
 let id,request,claim;
 await t.test('new appointment and immutable receipt are saved once, even on replay',async()=>{
 request=args();id=await create(request);assert.equal(await create(request),id);const messages=await rows(id);assert.equal(messages.length,1);assert.equal(messages[0].session_id,null);assert.equal(messages[0].email,'qa@example.invalid');assert.equal(messages[0].payload.status,'pending');assert.equal(messages[0].payload.priceCents,3500);assert.equal(messages[0].payload.timezone,'America/New_York');assert.equal((await op(id,'status')).state,'queued');
 await admin.query('update public.services set price_cents=9999 where id=$1',[data[actor].service]);assert.equal((await rows(id))[0].payload.priceCents,3500);await admin.query('update public.services set price_cents=3500 where id=$1',[data[actor].service]);
 });
 await t.test('tenant mismatch and raw/public access cannot read or claim a receipt',async()=>{
 await assert.rejects(op(id,'claim',{},other),/APPOINTMENT_UNAVAILABLE/);await assert.rejects(db.query('select * from aesthenda_private.booking_confirmation_messages'),/permission denied/);
 for(const role of ['anon','authenticated'])for(const fn of ['create_owner_appointment_v1(uuid,uuid,uuid,uuid,timestamptz,text)','owner_booking_message_v1(uuid,uuid,text,jsonb)'])assert.equal((await admin.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,'aesthenda_private.'+fn])).rows[0].allowed,false);
 });
 await t.test('claims serialize, forged results cannot finish, accepted messages never resend',async()=>{
 claim=await op(id,'claim');assert.equal(claim.state,'claimed');assert.equal((await op(id,'claim')).state,'pending');assert.equal((await op(id,'result',{lease:crypto.randomUUID(),state:'accepted'})).state,'sending');
 assert.equal((await op(id,'result',{lease:claim.lease,state:'accepted',providerId:'synthetic-receipt'})).state,'accepted');assert.equal((await op(id,'claim')).state,'accepted');assert.equal(await create(request),id);assert.equal((await rows(id))[0].attempts,1);
 });
 await t.test('no email still books, and no email is invented or queued',async()=>{
 await admin.query("update public.clients set email='' where id=$1",[data[actor].client]);const next=await create(args(actor,'2030-01-07T15:00:00Z'));assert.equal((await rows(next)).length,0);assert.equal((await op(next,'status')).state,'not_requested');await admin.query("update public.clients set email='qa@example.invalid' where id=$1",[data[actor].client]);
 });
 await t.test('temporary failure retries the same message, capped and bound to original recipient',async()=>{
 const next=await create(args(actor,'2030-01-07T16:00:00Z'));const first=await op(next,'claim');await op(next,'result',{lease:first.lease,state:'pending'});await admin.query("update aesthenda_private.booking_confirmation_messages set last_attempt_at=now()-interval '61 seconds' where appointment_id=$1",[next]);const second=await op(next,'claim');assert.equal(second.id,first.id);assert.notEqual(second.lease,first.lease);await op(next,'result',{lease:second.lease,state:'pending'});
 await admin.query("update public.clients set email='changed@example.invalid' where id=$1",[data[actor].client]);await admin.query("update aesthenda_private.booking_confirmation_messages set last_attempt_at=now()-interval '61 seconds' where appointment_id=$1",[next]);assert.equal((await op(next,'claim')).state,'review_required');await admin.query("update public.clients set email='qa@example.invalid' where id=$1",[data[actor].client]);
 });
 await t.test('cancelled or moved appointments cannot send their old receipt',async()=>{
 for(const [start,change]of [['2030-01-07T17:00:00Z',"status='cancelled'"],['2030-01-07T18:00:00Z','revision=revision+1']]){const next=await create(args(actor,start));await admin.query('update public.appointments set '+change+' where id=$1',[next]);assert.equal((await op(next,'claim')).state,'review_required');}
 });
 await t.test('confirmed bookings describe actual status and exhausted retries need review',async()=>{
 await admin.query('insert into aesthenda_private.booking_preferences(business_id,auto_confirm) values($1,true) on conflict(business_id) do update set auto_confirm=true',[data[actor].business]);
 const next=await create(args(actor,'2030-01-08T14:00:00Z'));assert.equal((await rows(next))[0].payload.status,'confirmed');
 await admin.query('update aesthenda_private.booking_confirmation_messages set attempts=3 where appointment_id=$1',[next]);assert.equal((await op(next,'claim')).state,'review_required');
 await admin.query('update aesthenda_private.booking_preferences set auto_confirm=false where business_id=$1',[data[actor].business]);
 });
 await t.test('outbox failure rolls back the reservation and replay journal',async()=>{
 await admin.query("create function public.fail_owner_receipt() returns trigger language plpgsql as $$begin raise exception 'receipt injection';end$$;create trigger fail_owner_receipt before insert on aesthenda_private.booking_confirmation_messages for each row execute function public.fail_owner_receipt()");const request=args(actor,'2030-01-07T19:00:00Z');try{await assert.rejects(create(request),/receipt injection/);}finally{await admin.query('drop trigger fail_owner_receipt on aesthenda_private.booking_confirmation_messages;drop function public.fail_owner_receipt()');}
 assert.equal((await admin.query('select count(*)::int n from aesthenda_private.appointment_requests where request_key=$1',[request[1]])).rows[0].n,0);assert.equal((await admin.query('select count(*)::int n from public.appointments where business_id=$1 and start_at=$2',[data[actor].business,request[4]])).rows[0].n,0);
 });
 await t.test('legacy request replay does not email historical appointments',async()=>{
 const request=args(actor,'2030-01-07T20:00:00Z');const legacy=(await db.query('select aesthenda_private.create_appointment_v1($1,$2,$3,$4,$5,$6) id',request)).rows[0].id;assert.equal(await create(request),legacy);assert.equal((await rows(legacy)).length,0);
 });
});
