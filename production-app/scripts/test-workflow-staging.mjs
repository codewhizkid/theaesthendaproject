// Run only after the reviewed workflow migration is approved and applied.
// Existing staging owner; every synthetic service/client write is rolled back.
import pg from 'pg';import assert from 'node:assert/strict';
const actor=process.env.AESTHENDA_TEST_ACTOR;
if(!/^[0-9a-f-]{36}$/.test(actor??'')||new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'http://invalid').hostname!=='srwjgtvmlrkdqtxetjuu.supabase.co')throw Error('Requires the pinned staging project and an existing owner.');
const db=new pg.Client({connectionString:process.env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});let transaction=false;
try{await db.connect();assert.equal((await db.query('select current_user')).rows[0].current_user,'aesthenda_runtime');await db.query('begin');transaction=true;
 const read=async(sql,args)=>(await db.query(sql,args)).rows[0].r;
 const service=await read("select aesthenda_private.save_service_v3($1,$2,null,0,'Rollback-only service','',1000,$3,'QA custom type') r",[actor,crypto.randomUUID(),JSON.stringify([{label:'Hands-on',kind:'active',durationMinutes:30,released:false}])]);
 const client=await read("select aesthenda_private.save_client_v1($1,$2,null,0,'Rollback-only client','',$3,'','') r",[actor,crypto.randomUUID(),crypto.randomUUID()+'@example.invalid']);
 assert.equal((await read('select aesthenda_private.read_services_v1($1,$2) r',[actor,service]))[0].serviceType,'QA custom type');
 for(const deleted of [true,false]){const revision=deleted?1:2;await db.query('select aesthenda_private.set_service_deleted_v1($1,$2,$3,$4)',[actor,service,revision,deleted]);await db.query('select aesthenda_private.set_client_deleted_v1($1,$2,$3,$4)',[actor,client,revision,deleted]);const row=await read("select aesthenda_private.read_clients_v2($1,$2,'',0,false) r",[actor,client]);assert.equal(row.clients[0].status,deleted?'archived':'active');assert.equal((await read('select aesthenda_private.read_services_v1($1,$2) r',[actor,service]))[0].steps.length,1);}
 await db.query('rollback');transaction=false;assert.deepEqual(await read('select aesthenda_private.read_services_v1($1,$2) r',[actor,service]),[]);assert.deepEqual((await read("select aesthenda_private.read_clients_v2($1,$2,'',0,false) r",[actor,client])).clients,[]);console.log('PASS: restricted staging service types, delete/restore and timing preservation; all synthetic writes rolled back.');
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Staging workflow check failed.');process.exitCode=1;}
finally{if(transaction)await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
