import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';

const config=parseEnv(readFileSync('.env.staging.local','utf8'));
if(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname!=='srwjgtvmlrkdqtxetjuu.supabase.co') throw new Error('Staging launcher refused an unexpected project.');
if(!config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !config.AESTHENDA_DATABASE_URL) throw new Error('Staging configuration is incomplete.');
const child=spawn(process.execPath,['scripts/dev.mjs','--webpack','--hostname','127.0.0.1','--port','3190'],{stdio:'inherit',env:{...process.env,...config,AESTHENDA_STAGING:'1'}});
child.on('error',()=>{console.error('Could not start staging preview.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
