// Rollback-only staging check through the restricted runtime. Never sends email.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import pg from 'pg';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const actor=process.env.AESTHENDA_TEST_ACTOR;assert.match(actor??'',/^[0-9a-f-]{36}$/);
const db=new pg.Client({connectionString:config.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:10000});let transaction=false,service,client,appointment;
try{
 await db.connect();assert.equal((await db.query('select current_user')).rows[0].current_user,'aesthenda_runtime');const read=async(sql,args=[])=>(await db.query(sql,args)).rows[0].r;
 await db.query('begin');transaction=true;
 service=await read("select aesthenda_private.save_service_v3($1,$2,null,0,'Rollback-only calendar receipt','',3500,$3,'Receipt QA') r",[actor,randomUUID(),JSON.stringify([{label:'Visit',kind:'active',durationMinutes:30,released:false}])]);
 client=await read("select aesthenda_private.save_client_v1($1,$2,null,0,'Rollback-only','Receipt',$3,'','') r",[actor,randomUUID(),randomUUID()+'@example.invalid']);
 let slot,catalog;for(let offset=1;offset<=14&&!slot;offset++){const date=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);catalog=await read('select aesthenda_private.appointment_slots_v2($1,$2,$3,$4) r',[actor,service,date,client]);slot=catalog.slots[0];}assert.ok(slot,'Salon needs availability within two weeks');
 const args=[actor,randomUUID(),client,service,slot.startAt,catalog.service.token];const create=()=>read('select aesthenda_private.create_owner_appointment_v1($1,$2,$3,$4,$5,$6) r',args);
 appointment=await create();assert.equal(await create(),appointment);
 const op=(action,data={})=>read('select aesthenda_private.owner_booking_message_v1($1,$2,$3,$4) r',[actor,appointment,action,JSON.stringify(data)]);
 assert.equal((await op('status')).state,'queued');const claim=await op('claim');assert.equal(claim.state,'claimed');assert.equal(claim.payload.appointmentId,appointment);assert.equal(claim.payload.priceCents,3500);assert.ok(['pending','confirmed'].includes(claim.payload.status));assert.equal((await op('claim')).state,'pending');
 assert.equal((await op('result',{lease:claim.lease,state:'accepted',providerId:'rollback-only-synthetic'})).state,'accepted');assert.equal((await op('claim')).state,'accepted');
 await db.query('rollback');transaction=false;
 assert.deepEqual(await read('select aesthenda_private.read_services_v1($1,$2) r',[actor,service]),[]);assert.deepEqual((await read("select aesthenda_private.read_clients_v2($1,$2,'',0,false) r",[actor,client])).clients,[]);assert.equal((await read('select aesthenda_private.read_appointments_v1($1,null,$2) r',[actor,appointment])).appointments.length,0);
 console.log('PASS: staging atomic calendar receipt, replay, claim and result checks; all synthetic writes rolled back. No email sent.');
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Staging receipt check failed');process.exitCode=1;}finally{if(transaction)await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
