// Approved staging installation check. All test writes are rolled back.
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const actor=process.env.AESTHENDA_TEST_ACTOR;
assert.match(actor??'',/^[0-9a-f-]{36}$/);
const db=new pg.Client({connectionString:config.AESTHENDA_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
let transaction=false;
try{
 await db.connect(); assert.equal((await db.query('select current_user')).rows[0].current_user,'aesthenda_runtime');
 const read=async(sql,args=[])=>(await db.query(sql,args)).rows[0].r;
 const profiles=()=>read('select aesthenda_private.read_client_identity_profiles_v1($1) r',[actor]);
 const before=await profiles();
 assert.equal(before.length,0,'Use an owner with no existing client identity links');
 const hash=createHash('sha256').update(randomBytes(32)).digest('hex');
 const email=randomUUID()+'@example.invalid';
 let cid;
 await db.query('begin');transaction=true;
 await read('select aesthenda_private.create_client_signin_invite_v1($1,$2) r',[actor,hash]);
 const invitation=await read('select aesthenda_private.read_client_signin_invite_v1($1) r',[hash]);
 assert.deepEqual(Object.keys(invitation).sort(),['businessName','expiresAt']);
 const resolve=()=>read("select aesthenda_private.resolve_client_identity_v1($1,$2,'',$3,'Rollback-only','Identity','') r",[actor,email,hash]);
 const first=await resolve();assert.equal(first.state,'linked');assert.equal(first.created,true);cid=first.profile.id;
 assert.deepEqual(Object.keys(first.profile).sort(),['businessName','firstName','id','lastName']);
 assert.equal((await resolve()).profile.id,cid);assert.equal((await profiles()).length,1);
 const second=createHash('sha256').update(randomBytes(32)).digest('hex');
 await read('select aesthenda_private.create_client_signin_invite_v1($1,$2) r',[actor,second]);
 assert.equal((await read("select aesthenda_private.resolve_client_identity_v1($1,$2,'',$3,'Rollback-only','Identity','') r",[actor,email,second])).profile.id,cid);
 await db.query('rollback');transaction=false;
 assert.deepEqual(await profiles(),before);
 assert.equal(await read('select aesthenda_private.read_client_signin_invite_v1($1) r',[hash]),null);
 assert.deepEqual((await read("select aesthenda_private.read_clients_v2($1,$2,'',0,false) r",[actor,cid])).clients,[]);
 console.log('PASS: actual restricted staging invite, profile enrollment/retry/reuse, own-profile projection; all invite/link/client/audit writes rolled back and absent. No Auth identities created.');
}catch(error){console.error(error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Staging check failed');process.exitCode=1;}
finally{if(transaction)await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
