import nextEnv from '@next/env';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd());
const connectionString=process.env.AESTHENDA_MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('Set AESTHENDA_MIGRATION_DATABASE_URL privately before running reviewed migrations.');
const db=new pg.Client({connectionString, connectionTimeoutMillis:5000});
try {
 await db.connect();
 await db.query('select pg_advisory_lock(184503,1)');
 await db.query('create schema if not exists aesthenda_migrations; revoke all on schema aesthenda_migrations from public; create table if not exists aesthenda_migrations.applied(name text primary key,checksum text not null,applied_at timestamptz not null default now())');
 for (const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
  const sql=await readFile('supabase/migrations/'+name,'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const previous=await db.query('select checksum from aesthenda_migrations.applied where name=$1',[name]);
  if (previous.rows.length) {
   if (previous.rows[0].checksum!==checksum) throw new Error('Applied migration was modified: '+name);
   continue;
  }
  await db.query('begin');
  try {
   await db.query(sql);
   await db.query('insert into aesthenda_migrations.applied(name,checksum) values($1,$2)',[name,checksum]);
   await db.query('commit');
   console.log('Applied '+name);
  } catch(error) { await db.query('rollback'); throw error; }
 }
} catch(error) {
 console.error('Migration failed; review database state and migration compatibility.');
 console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted connection]') : 'Database error');
 process.exitCode=1;
} finally { await db.end(); }
