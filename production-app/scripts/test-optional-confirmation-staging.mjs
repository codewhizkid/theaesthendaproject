// Existing staging owner only. Every synthetic write rolls back; never sends mail.
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const actor=process.env.AESTHENDA_TEST_ACTOR;assert.match(actor??'',/^[0-9a-f-]{36}$/);
const hash=()=>createHash('sha256').update(randomBytes(32)).digest('hex');
const db=new pg.Client({connectionString:config.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:10000});
let transaction=false,service,client,appointment;const session=hash(),email=randomUUID()+'@example.invalid';
try{
 await db.connect();assert.equal((await db.query('select current_user')).rows[0].current_user,'aesthenda_runtime');
 const read=async(sql,args=[])=>(await db.query(sql,args)).rows[0].r;
 const op=(action,data={})=>read('select aesthenda_private.guest_booking_v1($1,$2,$3) r',[session,action,JSON.stringify(data)]);
 await db.query('begin');transaction=true;
 service=await read("select aesthenda_private.save_service_v3($1,$2,null,0,'Rollback-only guest service','',6500,$3,'Guest QA') r",[actor,randomUUID(),JSON.stringify([{label:'Visit',kind:'active',durationMinutes:30,released:false}])]);
 const policy=await read("select aesthenda_private.save_guest_policy_v1($1,'Rollback-only terms. No online payment.') r",[actor]);
 const prefs=await read('select aesthenda_private.read_booking_preferences_v3($1) r',[actor]);await db.query('select aesthenda_private.save_booking_preferences_v3($1,$2,$3,true,$4,false)',[actor,prefs.revision,prefs.autoConfirm,prefs.maxConcurrentClients]);
 const visibility=await read('select aesthenda_private.read_client_booking_visibility_v1($1) r',[actor]);
 let chosen,date,catalog;
 for(let offset=1;offset<=14&&!chosen;offset++){
  date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
  catalog=await read('select aesthenda_private.appointment_slots_v2($1,$2,$3,null) r',[actor,service,date]);
  const eligible=catalog.slots.filter(s=>s.minute%30===0).sort((a,b)=>a.startAt.localeCompare(b.startAt));const count=Math.ceil(eligible.length*visibility.showPercent/100);
  if(count)chosen=eligible[count===eligible.length?0:Math.floor(.5*eligible.length/count)];
 }
 assert.ok(chosen,'Existing owner needs available hours within two weeks');
 const start=()=>read('select aesthenda_private.start_guest_booking_v1($1,$2,$3,$4,$5,$6) r',[actor,session,service,chosen.startAt,catalog.service.token,date]);
 const hold=await start();assert.equal((await start()).expiresAt,hold.expiresAt);
 assert.equal((await op('status')).state,'unverified');
 assert.equal((await op('status')).confirmationRequired,false);
 const stillAvailable=await read('select aesthenda_private.appointment_slots_v2($1,$2,$3,null) r',[actor,service,date]);assert.ok(stillAvailable.slots.some(s=>s.startAt===chosen.startAt),'Unheld draft must not reserve the time');
 const immediate=()=>read('select aesthenda_private.book_guest_immediately_v1($1,$2) r',[session,JSON.stringify({firstName:'Rollback-only',lastName:'Immediate',email,phone:'',updatesEmail:false,policyId:policy,accepted:true})]);
 const saved=await immediate();assert.equal(saved.state,'booked');appointment=saved.appointmentId;
 assert.equal((await immediate()).appointmentId,appointment);
 const state=await op('status');assert.equal(state.state,'booked');assert.equal(state.service.priceCents,6500);assert.equal(state.notification,'queued');assert.equal('tokenHash' in state,false);
 const schedule=await read('select aesthenda_private.read_appointments_v1($1,$2,$3) r',[actor,null,appointment]);assert.equal(schedule.appointments.length,1);client=schedule.appointments[0].clientId;
 await db.query('rollback');transaction=false;
 assert.equal((await read('select aesthenda_private.read_booking_preferences_v3($1) r',[actor])).requireClientConfirmation,prefs.requireClientConfirmation);
 assert.deepEqual(await read('select aesthenda_private.read_services_v1($1,$2) r',[actor,service]),[]);
 assert.deepEqual((await read("select aesthenda_private.read_clients_v2($1,$2,'',0,false) r",[actor,client])).clients,[]);
 assert.equal((await read('select aesthenda_private.read_appointments_v1($1,$2,$3) r',[actor,null,appointment])).appointments.length,0);
 await db.query('begin');transaction=true;await assert.rejects(op('status'),/SESSION_UNAVAILABLE/);await db.query('rollback');transaction=false;
 console.log('PASS: restricted staging confirmation-off setting, unheld available time, immediate idempotent booking and queued receipt; all synthetic writes rolled back. No email or Auth account created.');
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Guest staging check failed');process.exitCode=1;}
finally{if(transaction)await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
