// Creates and removes only its own disposable container. Never targets Supabase.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const docker=process.env.DOCKER_BIN || 'docker';
const name='aesthenda-setup-test-'+randomBytes(5).toString('hex');
const password=randomBytes(24).toString('hex');
let started=false;
function run(script,env) {
 const result=spawnSync(process.execPath,script,{stdio:'inherit',env:{...process.env,...env}});
 if(result.status!==0) throw new Error('Verification command failed.');
}
try {
 execFileSync(docker,['run','--pull=never','--rm','--detach','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB=aesthenda_setup_test','postgres:16'],{stdio:'pipe'});
 started=true;
 const port=execFileSync(docker,['inspect','--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',name],{encoding:'utf8'}).trim();
 const connectionString=`postgresql://postgres:${password}@127.0.0.1:${port}/aesthenda_setup_test`;
 let ready=false;
 for(let i=0;i<60;i++) {
  const db=new pg.Client({connectionString,connectionTimeoutMillis:1000});
  try { await db.connect(); await db.query('create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); alter default privileges grant execute on functions to anon,authenticated'); ready=true; }
  catch { await new Promise(resolve=>setTimeout(resolve,250)); }
  finally { await db.end().catch(()=>{}); }
  if(ready) break;
 }
 if(!ready) throw new Error('Disposable PostgreSQL database did not become ready.');
 const env={AESTHENDA_MIGRATION_DATABASE_URL:connectionString,AESTHENDA_TEST_DATABASE_URL:connectionString};
 run(['scripts/migrate.mjs'],env);
 run(['scripts/migrate.mjs'],env);
 run(['--test','tests/setup-database.test.mjs'],env);
 run(['--test','tests/services-database.test.mjs'],env);
 run(['--test','tests/clients-database.test.mjs'],env);
 run(['--test','tests/availability-database.test.mjs'],env);
 run(['--test','tests/date-hours-database.test.mjs'],env);
 run(['--test','tests/appointments-database.test.mjs'],env);
 run(['--test','tests/reschedule-database.test.mjs'],env);
 run(['--test','tests/calendar-changes-database.test.mjs'],env);
 run(['--test','tests/blocks-database.test.mjs'],env);
 run(['--test','tests/calendar-undo-database.test.mjs'],env);
 run(['--test','tests/client-preferences-status-database.test.mjs'],env);
 run(['--test','tests/processing-database.test.mjs'],env);
 run(['--test','tests/workflow-database.test.mjs'],env);
 run(['--test','tests/client-visibility-database.test.mjs'],env);
 run(['--test','tests/client-identity-database.test.mjs'],env);
 run(['--test','tests/guest-booking-database.test.mjs'],env);
 run(['--test','tests/owner-confirmation-database.test.mjs'],env);
 console.log('PASS: fresh migrations, replay, atomicity, concurrency, and isolated persistence.');
} catch(error) {
 console.error(error instanceof Error ? error.message : 'Disposable database test failed.');
 process.exitCode=1;
} finally {
 if(started) execFileSync(docker,['stop',name],{stdio:'pipe'});
}
