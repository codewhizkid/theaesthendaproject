// Restricted-runtime staging integration. Exact fixture identities are provisioned
// separately without passwords/email; this does not simulate a browser session.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import pg from 'pg';
const env=parseEnv(readFileSync('.env.staging.local','utf8'));assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');const actors=JSON.parse(readFileSync('.env.calendar-edit-qa.local','utf8'));assert.equal(actors.length,2);const db=new pg.Client({connectionString:env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();
try{
 assert.equal((await db.query('select current_user as role')).rows[0].role,'aesthenda_runtime');const records=[];
 for(const actor of actors){
 assert.match(actor,/^[0-9a-f-]{36}$/);const existing=(await db.query('select aesthenda_private.read_business_setup($1) as r',[actor])).rows[0].r;assert.ok(!existing||existing.businessName==='QA Calendar Editing','Refusing a non-fixture business');
 await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@example.invalid',crypto.randomUUID(),'QA Calendar Editing','QA Professional']);
 const cid=(await db.query("select aesthenda_private.save_client_v1($1,$2,null,0,'QA','Client','qa@example.invalid','','') as r",[actor,crypto.randomUUID()])).rows[0].r;
 const sid=(await db.query("select aesthenda_private.create_service_v1($1,$2,'QA Service','',45,6500) as r",[actor,crypto.randomUUID()])).rows[0].r;
 await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[actor,crypto.randomUUID(),'America/New_York',JSON.stringify(Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020})))]);
 const token=(await db.query("select aesthenda_private.appointment_slots_v1($1,$2,'2032-01-05') as r",[actor,sid])).rows[0].r.service.token;
 const id=(await db.query("select aesthenda_private.create_appointment_v1($1,$2,$3,$4,'2032-01-05T14:00Z',$5) as r",[actor,crypto.randomUUID(),cid,sid,token])).rows[0].r;
 for(const [revision,mode,duration]of [[1,'move',45],[2,'extend',75]]){
 const p=(await db.query("select aesthenda_private.preview_calendar_change_v1($1,$2,$3,$4,'2032-01-05',600,$5) as r",[actor,id,revision,mode,duration])).rows[0].r;assert.equal(p.priceCents,6500);const key=crypto.randomUUID();
 for(let i=0;i<2;i++)assert.equal((await db.query("select aesthenda_private.save_calendar_change_v1($1,$2,$3,$4,$5,'2032-01-05',600,$6,$7) as id",[actor,key,id,revision,mode,duration,p.reviewToken])).rows[0].id,id);
 }
 records.push({actor,id});
 }
 for(const [i,r]of records.entries()){
 const data=(await db.query('select aesthenda_private.read_appointments_v1($1,null,$2) as r',[r.actor,r.id])).rows[0].r.appointments[0];assert.equal(data.revision,3);assert.equal(data.priceCents,6500);assert.equal(Date.parse(data.endAt)-Date.parse(data.startAt),75*60000);
 assert.equal((await db.query('select aesthenda_private.read_appointments_v1($1,null,$2) as r',[r.actor,records[1-i].id])).rows[0].r.appointments.length,0);
 await assert.rejects(db.query("select aesthenda_private.preview_calendar_change_v1($1,$2,3,'move','2032-01-06',600,75)",[r.actor,records[1-i].id]),/APPOINTMENT_UNAVAILABLE/);
 }
 console.log('PASS: restricted staging runtime moved and extended two isolated appointments, preserved prices, retried safely, and denied foreign changes.');
 const fresh=new pg.Client({connectionString:env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000});await fresh.connect();try{const x=(await fresh.query('select aesthenda_private.read_appointments_v1($1,null,$2) as r',[records[0].actor,records[0].id])).rows[0].r.appointments[0];assert.equal(x.revision,3);assert.equal(Date.parse(x.endAt)-Date.parse(x.startAt),75*60000);console.log('PASS: a new restricted connection sees durable edited times and duration. Exact fixture cleanup required.');}finally{await fresh.end();}
}finally{await db.end();}
