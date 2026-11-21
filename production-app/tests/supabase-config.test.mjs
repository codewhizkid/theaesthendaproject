import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabasePublicConfig, requireSupabasePublicConfig } from '../lib/supabase/config.ts';

const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
function withConfig(values, action) {
  const saved = names.map(name => process.env[name]);
  try {
    names.forEach(name => { delete process.env[name]; });
    Object.assign(process.env, values);
    action();
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
}
const url = 'https://bicahdggujidnselpekn.supabase.co';
test('missing URL or public key does not produce a configured client', () => {
  for (const values of [{}, {NEXT_PUBLIC_SUPABASE_URL: url}, {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}]) {
    withConfig(values, () => { assert.equal(getSupabasePublicConfig(), null); assert.throws(requireSupabasePublicConfig, /configuration is missing/); });
  }
});
test('publishable key is supported and takes precedence over the legacy key', () => {
  withConfig({NEXT_PUBLIC_SUPABASE_URL:url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test', NEXT_PUBLIC_SUPABASE_ANON_KEY:'legacy-test'}, () => {
    assert.deepEqual(getSupabasePublicConfig(), {url, key:'sb_publishable_test'});
  });
});
test('legacy anon configuration remains compatible', () => {
  withConfig({NEXT_PUBLIC_SUPABASE_URL:url, NEXT_PUBLIC_SUPABASE_ANON_KEY:'legacy-test'}, () => {
    assert.deepEqual(getSupabasePublicConfig(), {url, key:'legacy-test'});
  });
});
test('elevated keys are rejected without exposing them in the error', () => {
  const token = 'header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
  for (const key of ['sb_secret_test', token]) {
    withConfig({NEXT_PUBLIC_SUPABASE_URL:url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}, () => {
      assert.throws(getSupabasePublicConfig, error => /must never/.test(error.message) && !error.message.includes(key));
    });
  }
});
test('invalid URLs and embedded credentials are rejected', () => {
  for (const value of ['not a url', 'file:///tmp/db', 'https://user:password@example.com']) {
    withConfig({NEXT_PUBLIC_SUPABASE_URL:value, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}, () => assert.throws(getSupabasePublicConfig, /project URL/));
  }
});
