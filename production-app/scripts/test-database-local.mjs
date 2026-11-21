// Optional fallback for the same disposable suite when Docker is unavailable.
// Supply a PostgreSQL 16 bin directory; never connects to a hosted database.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import net from 'node:net';
import pg from 'pg';
const bin=process.env.AESTHENDA_TEST_POSTGRES_BIN;if(!bin)throw Error('Supply AESTHENDA_TEST_POSTGRES_BIN.');
const dir=await mkdtemp(path.join(tmpdir(),'aesthenda-pg-test-'));let started=false;
const run=(args,env)=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});if(result.status!==0)throw Error('Disposable database check failed.');};
try{
 const listener=net.createServer();await new Promise((resolve,reject)=>listener.once('error',reject).listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 execFileSync(path.join(bin,'initdb'),['-D',dir,'-U','postgres','--no-locale','-E','UTF8','--auth=trust'],{stdio:'pipe'});
 execFileSync(path.join(bin,'pg_ctl'),['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir} -F`,'-w','start'],{stdio:'pipe'});started=true;
 const base=`postgresql://postgres@127.0.0.1:${port}`;
 const admin=new pg.Client({connectionString:base+'/postgres'});await admin.connect();try{await admin.query('create database aesthenda_setup_test');}finally{await admin.end();}
 const connectionString=base+'/aesthenda_setup_test';const db=new pg.Client({connectionString});await db.connect();try{await db.query('create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);alter default privileges grant execute on functions to anon,authenticated');}finally{await db.end();}
 const env={AESTHENDA_MIGRATION_DATABASE_URL:connectionString,AESTHENDA_TEST_DATABASE_URL:connectionString};
 run(['scripts/migrate.mjs'],env);run(['scripts/migrate.mjs'],env);
 for(const suite of ['setup','services','clients','availability','date-hours','appointments','reschedule','calendar-changes','blocks','calendar-undo','client-preferences-status','processing','workflow','client-visibility','client-identity','guest-booking','owner-confirmation'])run(['--test',`tests/${suite}-database.test.mjs`],env);
 console.log('PASS: disposable PostgreSQL migrations/replay and all database suites.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(started)execFileSync(path.join(bin,'pg_ctl'),['-D',dir,'-m','immediate','-w','stop'],{stdio:'pipe'});await rm(dir,{recursive:true,force:true});}
