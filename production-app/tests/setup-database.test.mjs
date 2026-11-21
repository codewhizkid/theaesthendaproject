import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url=process.env.AESTHENDA_TEST_DATABASE_URL;
const skip=!url;
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000003';
const D='00000000-0000-4000-8000-000000000004';
const key=()=>crypto.randomUUID();

async function connection(role='aesthenda_runtime') {
 const db=new pg.Client({connectionString:url}); await db.connect();
 await db.query('set role '+role); return db;
}
async function setup(db,actor,request=key(),name='Studio',fullName='Test Professional') {
 return (await db.query('select aesthenda_private.create_business_account_v1($1,$2,$3,$4,$5) as result',[actor,actor+'@test.invalid',request,name,fullName])).rows[0].result;
}

test('atomic business setup, retries, persistence and isolation', {skip}, async t=>{
 if (new URL(url).hostname!=='127.0.0.1' || !new URL(url).pathname.endsWith('/aesthenda_setup_test')) throw new Error('Tests require the dedicated local disposable database.');
 const admin=new pg.Client({connectionString:url}); await admin.connect();
 const db=await connection();
 t.after(async()=>{await db.end(); await admin.end();});
 {
  await admin.query('delete from aesthenda_private.setup_requests where actor_id=any($1::uuid[])',[[A,B,C,D]]);
  await admin.query('delete from public.businesses where owner_user_id=any($1::uuid[])',[[A,B,C,D]]);
  await admin.query('insert into auth.users(id) values($1),($2),($3),($4) on conflict do nothing',[A,B,C,D]);
  await t.test('creation writes both records and canonical lifecycle starts',async()=>{
   const result=await setup(db,A);
   assert.equal(result.businessStatus,'trial'); assert.equal(result.professionalStatus,'onboarding');
   assert.equal(Number((await admin.query('select count(*) from public.professionals where business_id=$1',[result.businessAccountId])).rows[0].count),1);
  });
  await t.test('same and new request keys return the same business without overwriting',async()=>{
   const request=key(); const first=await setup(db,B,request,'Original','Original Name');
   assert.deepEqual(await setup(db,B,request,'Original','Original Name'),first);
   assert.deepEqual(await setup(db,B,key(),'Different','Different Name'),first);
   await assert.rejects(setup(db,B,request,'Changed','Changed Name'),/IDEMPOTENCY_CONFLICT/);
   assert.equal(Number((await admin.query('select count(*) from public.businesses where owner_user_id=$1',[B])).rows[0].count),1);
  });
  await t.test('forced professional failure rolls back business, audit and idempotency together',async()=>{
   await admin.query("create function public.test_fail_professional() returns trigger language plpgsql as $$ begin if new.user_id='00000000-0000-4000-8000-000000000003'::uuid then raise exception 'injected professional failure'; end if; return new; end $$; create trigger test_failure before insert on public.professionals for each row execute function public.test_fail_professional()");
   const request=key();
   try { await assert.rejects(setup(db,C,request),/injected professional failure/); }
   finally { await admin.query('drop trigger test_failure on public.professionals; drop function public.test_fail_professional()'); }
   assert.equal(Number((await admin.query('select count(*) from public.businesses where owner_user_id=$1',[C])).rows[0].count),0);
   assert.equal(Number((await admin.query('select count(*) from aesthenda_private.setup_requests where actor_id=$1',[C])).rows[0].count),0);
   assert.equal(Number((await admin.query('select count(*) from public.audit_events where actor_id=$1',[C])).rows[0].count),0);
   await setup(db,C,request);
  });
  await t.test('concurrent setup requests create exactly one complete business',async()=>{
   const other=await connection();
   try { const [x,y]=await Promise.all([setup(db,D),setup(other,D)]); assert.equal(x.businessAccountId,y.businessAccountId); }
   finally { await other.end(); }
   assert.equal(Number((await admin.query('select count(*) from public.businesses where owner_user_id=$1',[D])).rows[0].count),1);
  });
  await t.test('a fresh connection sees the saved account',async()=>{
   const other=await connection();
   try { const result=(await other.query('select aesthenda_private.read_business_setup($1) as result',[B])).rows[0].result; assert.equal(result.businessName,'Original'); }
   finally { await other.end(); }
  });
  await t.test('runtime cannot read or write tables directly',async()=>{
   await assert.rejects(db.query('select * from public.businesses'),/permission denied/);
   await assert.rejects(db.query("insert into public.businesses(name,owner_user_id) values('Forged',$1)",[A]),/permission denied/);
   await assert.rejects(db.query('select * from aesthenda_private.setup_requests'),/permission denied/);
  });
  await t.test('public roles cannot call private actions or read another account',async()=>{
   for(const role of ['anon','authenticated']) {
    const caller=await connection(role);
    try {
     await assert.rejects(caller.query('select aesthenda_private.read_business_setup($1)',[A]),/permission denied/);
     await assert.rejects(caller.query('select * from public.businesses'),/permission denied/);
     await assert.rejects(caller.query('select * from public.professionals'),/permission denied/);
    } finally { await caller.end(); }
   }
  });
  await t.test('function owner is not privileged, not table owner, and RLS blocks cross-account rows',async()=>{
   const acl=(await admin.query("select has_function_privilege('anon','aesthenda_private.read_business_setup(uuid)','EXECUTE') as anon,has_function_privilege('authenticated','aesthenda_private.create_business_account_v1(uuid,text,uuid,text,text)','EXECUTE') as api")).rows[0];
   assert.deepEqual(acl,{anon:false,api:false});
   const attrs=(await admin.query("select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname='aesthenda_setup_owner'")).rows[0];
   assert.deepEqual(attrs,{rolsuper:false,rolbypassrls:false,rolcanlogin:false});
   const tables=(await admin.query("select pg_get_userbyid(relowner) as owner, relforcerowsecurity from pg_class where oid in ('public.businesses'::regclass,'public.professionals'::regclass)")).rows;
   assert.ok(tables.every(row=>row.owner!=='aesthenda_setup_owner' && row.relforcerowsecurity));
   const actor=await connection('aesthenda_setup_owner');
   try {
    await actor.query('begin'); await actor.query("select set_config('app.verified_actor_id',$1,true)",[A]);
    const rows=await actor.query('select owner_user_id from public.businesses');
    assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].owner_user_id,A);
    await assert.rejects(actor.query("insert into public.businesses(name,owner_user_id,status) values('Wrong',$1,'trial')",[B]),/row-level security/);
    await actor.query('rollback');
   } finally { await actor.end(); }
  });
 }
});
