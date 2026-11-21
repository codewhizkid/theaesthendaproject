import nextEnv from '@next/env';
import { getSupabasePublicConfig } from '../lib/supabase/config.ts';

nextEnv.loadEnvConfig(process.cwd());
try {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error('Connection is incomplete: add the project URL and publishable (or legacy anon) key to .env.local.');
  console.log(`Checking ${new URL(config.url).host}`);
  const response = await fetch(new URL('/auth/v1/settings', config.url), {
    headers: { apikey: config.key },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Authentication settings check failed (HTTP ${response.status}).`);
  console.log('PASS: the project accepts the configured public key and its Auth endpoint responds.');
  console.log('No records were read or written. Live sign-in, redirects, and database isolation require separate checks.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Connection check failed.');
  process.exitCode = 1;
}
