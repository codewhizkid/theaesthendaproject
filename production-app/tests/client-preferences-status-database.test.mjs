import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
const url=process.env.AESTHENDA_TEST_DATABASE_URL;
test('client permission records, booking settings and appointment lifecycle',{skip:!url},async t=>{
 if(new URL(url).hostname!=='127.0.0.1'||!new URL(url).pathname.endsWith('/aesthenda_setup_test'))throw Error('Disposable local database only');
 const admin=new pg.Client({connectionString:url}),db=new pg.Client({connectionString:url});await admin.connect();await db.connect();await db.query('set role aesthenda_runtime');t.after(async()=>{await db.end();await admin.end();});
 const [a,b]=[crypto.randomUUID(),crypto.randomUUID()];await admin.query('insert into auth.users(id) values($1),($2)',[a,b]);
 for(const actor of [a,b])await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@example.invalid',crypto.randomUUID(),'Preferences '+actor,'Professional']);
 const empty={updatesEmail:false,updatesText:false,marketingEmail:false,marketingText:false,preferredContact:'none'};
 const sql='select aesthenda_private.save_client_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r';
 const args=(over={})=>{const x={actor:a,key:crypto.randomUUID(),id:null,revision:0,email:'qa@example.invalid',phone:'2125550101',prefs:empty,method:'not_given',...over};return [x.actor,x.key,x.id,x.revision,'Client','Tester',x.email,x.phone,'',JSON.stringify(x.prefs),x.method];};
 const save=async(over={})=>(await db.query(sql,args(over))).rows[0].r;
 const read=async(actor,id)=>(await db.query('select aesthenda_private.read_clients_v1($1,$2) r',[actor,id])).rows[0].r.clients[0];
 let cid;let foreign;
 await t.test('one contact required at the trusted boundary; no implicit opt-in',async()=>{
 await assert.rejects(save({email:'',phone:''}),/CONTACT_REQUIRED/);cid=await save();foreign=await save({actor:b});assert.deepEqual((await read(a,cid)).preferences,empty);assert.equal((await read(a,cid)).preferencesMethod,'not_given');
 await assert.rejects(save({email:'',prefs:{...empty,updatesEmail:true},method:'verbal'}),/CONTACT_CHANNEL_UNAVAILABLE/);
 await assert.rejects(save({prefs:{...empty,updatesText:true}}),/CONSENT_REQUIRED/);
 await assert.rejects(save({prefs:{...empty,extra:true}}),/INVALID_PREFERENCES/);
 await assert.rejects(save({prefs:{...empty,preferredContact:null}}),/INVALID_PREFERENCES/);
 await assert.rejects(save({prefs:{...empty,updatesEmail:'true'}}),/INVALID_PREFERENCES/);
 });
 const key=crypto.randomUUID();const chosen={...empty,updatesEmail:true,marketingText:true,preferredContact:'email'};
 await t.test('explicit independent permissions are durable, timestamped and safely retried',async()=>{
 const input={id:cid,revision:1,key,prefs:chosen,method:'written'};await save(input);await save(input);
 const current=await read(a,cid);assert.equal(current.revision,2);assert.deepEqual(current.preferences,chosen);assert.ok(current.preferencesRecordedAt);assert.equal(current.preferencesMethod,'written');
 assert.equal(Number((await admin.query('select count(*) from aesthenda_private.client_preference_events where client_id=$1',[cid])).rows[0].count),2);
 await assert.rejects(save({...input,prefs:empty}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(save({id:cid,revision:1}),/STALE_CLIENT/);
 });
 await t.test('replacement destination requires fresh permission; withdrawal needs none',async()=>{
 await assert.rejects(save({id:cid,revision:2,email:'replacement@example.invalid',prefs:chosen}),/CONSENT_REQUIRED/);
 await save({id:cid,revision:2,prefs:empty});assert.deepEqual((await read(a,cid)).preferences,empty);
 await save({id:cid,revision:3,email:'replacement@example.invalid',prefs:{...empty,updatesEmail:true},method:'verbal'});
 // Legacy write cannot silently transfer permission to a different destination.
 await db.query("select aesthenda_private.save_client_v1($1,$2,$3,4,'Client','Tester','third@example.invalid','2125550101','')",[a,crypto.randomUUID(),cid]);
 assert.equal((await read(a,cid)).preferences.updatesEmail,false);
 });
 await t.test('foreign client access and edits are denied',async()=>{const matches=(await db.query('select aesthenda_private.client_contact_matches_v1($1,$2,$3) r',[a,'third@example.invalid','2125550101'])).rows[0].r;assert.ok(matches.some(x=>x.id===cid));assert.ok(!matches.some(x=>x.id===foreign));const replayMatches=(await db.query('select aesthenda_private.client_contact_matches_v1($1,$2,$3,$4) r',[a,'third@example.invalid','2125550101',key])).rows[0].r;assert.deepEqual(replayMatches,[]);const newMatches=(await db.query('select aesthenda_private.client_contact_matches_v1($1,$2,$3,$4) r',[a,'third@example.invalid','2125550101',crypto.randomUUID()])).rows[0].r;assert.ok(newMatches.some(x=>x.id===cid));assert.equal(await read(a,foreign),undefined);await assert.rejects(save({id:foreign,revision:1}),/CLIENT_NOT_FOUND/);assert.deepEqual((await read(b,foreign)).preferences,empty);});
 await t.test('failed audit rolls back preferences and evidence',async()=>{
 const before=await read(a,cid);await admin.query("create function public.fail_preference_audit() returns trigger language plpgsql as $$begin if new.entity_type='Client' then raise exception 'injected preference failure';end if;return new;end$$;create trigger fail_preference_audit before insert on public.audit_events for each row execute function public.fail_preference_audit()");
 try{await assert.rejects(save({id:cid,revision:before.revision,prefs:{...empty,updatesText:true},method:'verbal'}),/injected preference failure/);}finally{await admin.query('drop trigger fail_preference_audit on public.audit_events;drop function public.fail_preference_audit()');}
 assert.equal((await read(a,cid)).revision,before.revision);assert.deepEqual((await read(a,cid)).preferences,before.preferences);
 });
 const pref=async(actor=a)=>(await db.query('select aesthenda_private.read_booking_preferences_v1($1) r',[actor])).rows[0].r;
 await t.test('booking preferences default off, isolate salons and reject stale edits',async()=>{
 assert.deepEqual(await pref(),{autoConfirm:false,revision:0});await db.query('select aesthenda_private.save_booking_preferences_v1($1,0,true)',[a]);await db.query('select aesthenda_private.save_booking_preferences_v1($1,0,true)',[a]);assert.deepEqual(await pref(),{autoConfirm:true,revision:1});assert.deepEqual(await pref(b),{autoConfirm:false,revision:0});await assert.rejects(db.query('select aesthenda_private.save_booking_preferences_v1($1,0,false)',[a]),/STALE_PREFERENCES/);
 });
 const service=(await db.query("select aesthenda_private.create_service_v1($1,$2,'Service','',30,3500) r",[a,crypto.randomUUID()])).rows[0].r;
 await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[a,crypto.randomUUID(),'America/New_York',JSON.stringify(Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020})))]);
 const token=(await db.query("select aesthenda_private.appointment_slots_v1($1,$2,'2031-01-06') r",[a,service])).rows[0].r.service.token;
 const create=async(time)=>(await db.query('select aesthenda_private.create_appointment_v1($1,$2,$3,$4,$5,$6) r',[a,crypto.randomUUID(),cid,service,time,token])).rows[0].r;
 const raw=async(id)=>(await admin.query('select * from public.appointments where id=$1',[id])).rows[0];
 const status=(id,rev,value,key=crypto.randomUUID(),actor=a)=>db.query('select aesthenda_private.set_appointment_status_v1($1,$2,$3,$4,$5)',[actor,key,id,rev,value]);
 const undo=async()=>(await db.query('select aesthenda_private.read_calendar_undo_v1($1) r',[a])).rows[0].r;
 let aid,pending;
 await t.test('auto-confirmed creation can be rescheduled and undone without losing status',async()=>{
 aid=await create('2031-01-06T14:00Z');assert.equal((await raw(aid)).status,'confirmed');
 const preview=(await db.query("select aesthenda_private.reschedule_slots_v1($1,$2,'2031-01-06') r",[a,aid])).rows[0].r;
 await db.query("select aesthenda_private.reschedule_appointment_v1($1,$2,$3,$4,'2031-01-06T15:00Z',$5)",[a,crypto.randomUUID(),aid,1,preview.moveToken]);assert.equal((await raw(aid)).status,'confirmed');const change=await undo();await db.query('select aesthenda_private.undo_calendar_change_v1($1,$2)',[a,change.id]);assert.equal((await raw(aid)).status,'confirmed');assert.equal((await raw(aid)).start_at.toISOString(),'2031-01-06T14:00:00.000Z');
 await db.query('select aesthenda_private.save_booking_preferences_v1($1,1,false)',[a]);pending=await create('2031-01-06T16:00Z');assert.equal((await raw(pending)).status,'pending');assert.equal((await raw(aid)).status,'confirmed');
 });
 await t.test('manual confirmation preserves facts, is idempotent and prevents undoing an older edit',async()=>{
 const before=await raw(pending),key=crypto.randomUUID();await status(pending,1,'confirmed',key);await status(pending,1,'confirmed',key);const after=await raw(pending);assert.equal(after.status,'confirmed');assert.equal(after.start_at.toISOString(),before.start_at.toISOString());assert.deepEqual(after.service_snapshot,before.service_snapshot);assert.equal(after.revision,2);assert.equal(await undo(),null);
 await assert.rejects(status(pending,1,'confirmed'),/STALE_APPOINTMENT/);await assert.rejects(status(pending,2,'paid'),/INVALID_INPUT/);await assert.rejects(status(pending,2,'completed'),/STATUS_TIME_REVIEW/);await assert.rejects(status(pending,2,'no_show'),/STATUS_TIME_REVIEW/);await assert.rejects(status(pending,2,'completed',crypto.randomUUID(),b),/APPOINTMENT_UNAVAILABLE/);
 });
 await t.test('confirmed cancellation and Undo restore confirmed, never payment state',async()=>{
 await db.query('select aesthenda_private.cancel_appointment_v1($1,$2,2)',[a,pending]);assert.equal((await raw(pending)).status,'cancelled');const change=await undo();await db.query('select aesthenda_private.undo_calendar_change_v1($1,$2)',[a,change.id]);assert.equal((await raw(pending)).status,'confirmed');
 });
 await t.test('past visits allow completed/no-show, history is bounded and salon-scoped',async()=>{
 const base=await raw(aid);const past=[];
 for(let i=0;i<23;i++)past.push((await admin.query("insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,service_snapshot,booking_source,timezone) values($1,$2,$3,$4,now()-interval '2 days'-$5*interval '1 hour',now()-interval '2 days'-$5*interval '1 hour'+interval '30 minutes','pending',$6,'professional_v1','America/New_York') returning id",[base.business_id,base.professional_id,cid,service,i,base.service_snapshot])).rows[0].id);
 await status(past[0],1,'completed');await status(past[1],1,'no_show');await assert.rejects(status(past[2],1,'confirmed'),/STATUS_TIME_REVIEW/);await assert.rejects(status(past[0],2,'no_show'),/INVALID_STATUS_TRANSITION/);
 const history=async(actor,id,group,page=0)=>(await db.query('select aesthenda_private.read_client_appointments_v1($1,$2,$3,$4) r',[actor,id,group,page])).rows[0].r;
 const first=await history(a,cid,'previous'),next=await history(a,cid,'previous',1);assert.equal(first.appointments.length,20);assert.equal(first.hasMore,true);assert.equal(next.appointments.length,3);assert.ok(first.appointments.some(x=>x.status==='completed'));assert.ok(first.appointments.some(x=>x.status==='no_show'));assert.equal((await history(a,cid,'upcoming')).appointments.length,2);await assert.rejects(history(b,cid,'previous'),/CLIENT_UNAVAILABLE/);const neighbors=(await db.query('select aesthenda_private.read_appointment_neighbors_v1($1,$2) r',[a,aid])).rows[0].r;assert.equal(neighbors.upcoming.id,pending);assert.ok(neighbors.previous.id);await assert.rejects(db.query('select aesthenda_private.read_appointment_neighbors_v1($1,$2)',[b,aid]),/APPOINTMENT_UNAVAILABLE/);
 });
 await t.test('simultaneous different status changes accept one revision and rollback audit failures',async()=>{
 const base=await raw(aid);const testId=(await admin.query("insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,service_snapshot,booking_source,timezone) values($1,$2,$3,$4,now()-interval '3 days',now()-interval '3 days'+interval '30 minutes','confirmed',$5,'professional_v1','America/New_York') returning id",[base.business_id,base.professional_id,cid,service,base.service_snapshot])).rows[0].id;
 const other=new pg.Client({connectionString:url});await other.connect();await other.query('set role aesthenda_runtime');
 try{const results=await Promise.allSettled([status(testId,1,'completed'),other.query('select aesthenda_private.set_appointment_status_v1($1,$2,$3,1,$4)',[a,crypto.randomUUID(),testId,'no_show'])]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/STALE_APPOINTMENT/);}finally{await other.end();}
 const before=await raw(aid),key=crypto.randomUUID();await admin.query("create function public.fail_status_audit() returns trigger language plpgsql as $$begin if new.action='changeAppointmentStatus' then raise exception 'injected status failure';end if;return new;end$$;create trigger fail_status_audit before insert on public.audit_events for each row execute function public.fail_status_audit()");
 const fresh=await create('2031-01-06T20:00Z');
 try{await assert.rejects(status(fresh,1,'confirmed',key),/injected status failure/);}finally{await admin.query('drop trigger fail_status_audit on public.audit_events;drop function public.fail_status_audit()');}
 assert.equal((await raw(fresh)).status,'pending');assert.equal((await raw(fresh)).revision,1);assert.equal((await raw(aid)).revision,before.revision);assert.equal(Number((await admin.query('select count(*) from aesthenda_private.appointment_requests where request_key=$1',[key])).rows[0].count),0);
 });
 await t.test('new tables and functions have no direct runtime or public access',async()=>{
 for(const table of ['client_preference_events','booking_preferences'])await assert.rejects(db.query(`select * from aesthenda_private.${table}`),/permission denied/);
 for(const role of ['anon','authenticated'])for(const fn of ['set_appointment_status_v1(uuid,uuid,uuid,integer,text)','read_client_appointments_v1(uuid,uuid,text,integer)','save_client_v2(uuid,uuid,uuid,integer,text,text,text,text,text,jsonb,text)'])assert.equal((await admin.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,'aesthenda_private.'+fn])).rows[0].ok,false);
 });
});
