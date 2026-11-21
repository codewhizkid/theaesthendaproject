// Run only with explicitly approved temporary IDs and orchestrator finally cleanup.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import pg from 'pg';
const env=parseEnv(readFileSync('.env.staging.local','utf8'));assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');const actors=JSON.parse(readFileSync('.env.blocks-qa.local','utf8'));assert.equal(actors.length,2);const db=new pg.Client({connectionString:env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();const records=[];const sql='select aesthenda_private.save_block_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) r';
try{
 assert.equal((await db.query('select current_user r')).rows[0].r,'aesthenda_runtime');
 for(const actor of actors){assert.match(actor,/^[0-9a-f-]{36}$/);const existing=(await db.query('select aesthenda_private.read_business_setup($1) r',[actor])).rows[0].r;assert.ok(!existing||existing.businessName==='QA Blocked Time','Refusing a non-fixture business');await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5)',[actor,'qa@example.invalid',crypto.randomUUID(),'QA Blocked Time','QA Professional']);
 await db.query('select aesthenda_private.save_availability_v1($1,$2,0,$3,$4)',[actor,crypto.randomUUID(),'America/New_York',JSON.stringify(Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020})))]);
 const params=[actor,crypto.randomUUID(),null,0,'2032-01-05',600,660,'QA Lunch',false];const block=(await db.query(sql,params)).rows[0].r.id;assert.ok(block);assert.equal((await db.query(sql,params)).rows[0].r.id,block);
 await db.query(sql,[actor,crypto.randomUUID(),block,1,'2032-01-05',660,720,'QA edited',false]);records.push({actor,block});
 }
 for(const [i,r]of records.entries()){const list=(await db.query("select aesthenda_private.read_blocks_v1($1,'2032-01-05') r",[r.actor])).rows[0].r;assert.equal(list.length,1);assert.equal(list[0].id,r.block);assert.equal(list[0].revision,2);await assert.rejects(db.query(sql,[r.actor,crypto.randomUUID(),records[1-i].block,2,null,null,null,'',true]),/BLOCK_UNAVAILABLE/);}
 const fresh=new pg.Client({connectionString:env.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:10000});await fresh.connect();try{assert.equal((await fresh.query("select aesthenda_private.read_blocks_v1($1,'2032-01-05') r",[actors[0]])).rows[0].r[0].name,'QA edited');}finally{await fresh.end();}
 for(const r of records){await db.query(sql,[r.actor,crypto.randomUUID(),r.block,2,null,null,null,'',true]);assert.equal((await db.query("select aesthenda_private.read_blocks_v1($1,'2032-01-05') r",[r.actor])).rows[0].r.length,0);}
 console.log('PASS: restricted staging runtime created, retried, edited and removed blocks for two isolated salons; foreign writes denied; fresh connection verified durable edits.');
}finally{await db.end();}
