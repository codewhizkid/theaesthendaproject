// Exercises actual restricted staging routines inside one rolled-back transaction.
// Creates no authentication users; never commits test services, clients or visits.
import assert from 'node:assert/strict';import pg from 'pg';
const actor=process.env.AESTHENDA_TEST_ACTOR;
if(!/^[0-9a-f-]{36}$/.test(actor??'')||new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'http://invalid').hostname!=='srwjgtvmlrkdqtxetjuu.supabase.co')throw Error('Requires an existing staging owner and the pinned staging configuration.');
const db=new pg.Client({connectionString:process.env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
let transaction=false;
try{
 await db.connect();assert.equal((await db.query('select current_user')).rows[0].current_user,'aesthenda_runtime');
 const read=async(sql,args=[])=>(await db.query(sql,args)).rows[0].r;
 const catalog=()=>read('select aesthenda_private.read_services_v1($1,null) r',[actor]);
 const preferences=()=>read('select aesthenda_private.read_booking_preferences_v2($1) r',[actor]);
 const beforeCatalog=await catalog(),beforePreferences=await preferences();
 const date='2033-01-03';const dates=await read('select aesthenda_private.read_date_hours_v1($1) r',[actor]);assert.ok(!dates.some(item=>item.date===date),'Refusing an existing special date');
 const existing=await read('select aesthenda_private.read_appointments_v1($1,$2,null) r',[actor,date]);assert.equal(existing.appointments.length,0,'Refusing an occupied test date');
 const weekly=await read('select aesthenda_private.read_availability_v1($1) r',[actor]);assert.ok(weekly.revision>0);
 await db.query('begin');transaction=true;
 // Same canonical business lock as the trusted actions; all test changes are private
 // to this transaction until they are discarded in finally.
 const steps=[{label:'Application',kind:'active',durationMinutes:15,released:false},{label:'Processing',kind:'processing',durationMinutes:30,released:true},{label:'Finish',kind:'active',durationMinutes:45,released:false}];
 const service=async timing=>read("select aesthenda_private.save_service_v2($1,$2,null,0,'Rollback-only QA service','',1000,$3) r",[actor,crypto.randomUUID(),JSON.stringify(timing)]);
 const color=await service(steps),cut=await service([{label:'Cut',kind:'active',durationMinutes:30,released:false}]),longCut=await service([{label:'Long cut',kind:'active',durationMinutes:45,released:false}]);
 const clients=[];for(let i=0;i<2;i++)clients.push(await read("select aesthenda_private.save_client_v1($1,$2,null,0,'Rollback-only QA','',$3,'','') r",[actor,crypto.randomUUID(),crypto.randomUUID()+'@example.invalid']));
 // Deliberately do not enable an overall processing policy. Service release alone
 // must work with the owner's current stored preference.
 assert.equal(beforePreferences.processingEnabled,true);
 assert.ok(beforePreferences.maxConcurrentClients>=2);
 await db.query("select aesthenda_private.save_date_hours_v1($1,$2,$3,0,$4,'custom',$5)",[actor,crypto.randomUUID(),date,weekly.revision,JSON.stringify([{startMinute:540,endMinute:1020}])]);
 const slots=(service,client)=>read('select aesthenda_private.appointment_slots_v2($1,$2,$3,$4) r',[actor,service,date,client]);
 const initial=await slots(color,clients[0]),start=initial.slots.find(slot=>slot.minute===600);assert.ok(start);
 const first=await read('select aesthenda_private.create_appointment_v1($1,$2,$3,$4,$5,$6) r',[actor,crypto.randomUUID(),clients[0],color,start.startAt,initial.service.token]);
 const fits=await slots(cut,clients[1]);assert.ok(fits.slots.some(slot=>slot.minute===615));assert.ok(!(await slots(longCut,clients[1])).slots.some(slot=>slot.minute===615));assert.ok(!(await slots(cut,clients[0])).slots.some(slot=>slot.minute===615));
 const second=await read('select aesthenda_private.create_appointment_v1($1,$2,$3,$4,$5,$6) r',[actor,crypto.randomUUID(),clients[1],cut,fits.slots.find(slot=>slot.minute===615).startAt,fits.service.token]);assert.ok(second);
 const preview=await read("select aesthenda_private.preview_calendar_change_v2($1,$2,1,'extend',$3,600,105,null) r",[actor,first,date]);assert.deepEqual(preview.timingPlan.map(step=>step.durationMinutes),[15,30,60]);
 await db.query("select aesthenda_private.save_calendar_change_v2($1,$2,$3,1,'extend',$4,600,105,$5,null)",[actor,crypto.randomUUID(),first,date,preview.reviewToken]);
 const undo=await read('select aesthenda_private.read_calendar_undo_v1($1) r',[actor]);await db.query('select aesthenda_private.undo_calendar_change_v1($1,$2)',[actor,undo.id]);
 const saved=await read('select aesthenda_private.read_appointments_v1($1,null,$2) r',[actor,first]);assert.deepEqual(saved.appointments[0].segments.map(step=>step.durationMinutes),[15,30,45]);
 await db.query('rollback');transaction=false;
 assert.deepEqual(await catalog(),beforeCatalog);assert.deepEqual(await preferences(),beforePreferences);
 assert.deepEqual((await read('select aesthenda_private.read_appointments_v1($1,$2,null) r',[actor,date])).appointments,[]);
 console.log('PASS: restricted staging writes, processing fit, return protection, same-client denial, extension and Undo; all test changes rolled back.');
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Processing staging check failed.');process.exitCode=1;}
finally{if(transaction)await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
