import test from 'node:test';import assert from 'node:assert/strict';
import {appOrigin,appCookieSecure,appSignInRedirect} from '../lib/app-origin.ts';
import {databaseConnectionConfig} from '../lib/database-connection.ts';
import {guestMailConfig} from '../lib/guest-booking/resend-transport.ts';
import {previewAccess} from '../lib/preview-access.ts';
test('hosted sign-in redirects discard the internal listening port and retain the configured HTTPS host',()=>{
 const env={AESTHENDA_HOSTED_PREVIEW:'1',AESTHENDA_PUBLIC_ORIGIN:'https://preview.example.invalid'};
 for(const path of ['/auth/sign-in','/client/sign-in'])assert.equal(appSignInRedirect(path,'http://internal:10000/dashboard',env),'https://preview.example.invalid'+path);
 assert.equal(appSignInRedirect('/auth/sign-in','http://127.0.0.1:3190/dashboard',{}),'http://127.0.0.1:3190/auth/sign-in');
 assert.throws(()=>appSignInRedirect('/auth/sign-in','http://internal:10000/dashboard',{AESTHENDA_HOSTED_PREVIEW:'1'}));
});
test('hosted testing gate fails closed and requires the separate preview credential',async()=>{
 const key='b'.repeat(64), env={RENDER:'true',AESTHENDA_PREVIEW_ACCESS_KEY:key};
 assert.equal(await previewAccess(null,{}),'allow');
 assert.equal(await previewAccess(null,{RENDER:'true'}),'unconfigured');
 assert.equal(await previewAccess(null,env),'deny');
 for(const credential of ['Bearer anything','Basic !!!','Basic '+btoa('preview:wrong'),'Basic '+btoa('owner:'+key)])assert.equal(await previewAccess(credential,env),'deny');
 assert.equal(await previewAccess('Basic '+btoa('preview:'+key),env),'allow');
 assert.equal(await previewAccess(null,{AESTHENDA_HOSTED_PREVIEW:'1'}),'unconfigured');
});
test('hosted staging uses explicit HTTPS links and secure cookies without losing local preview support',()=>{
 const hosted={AESTHENDA_STAGING:'1',AESTHENDA_HOSTED_PREVIEW:'1',AESTHENDA_PUBLIC_ORIGIN:'https://preview.example.invalid',NODE_ENV:'production'};
 assert.equal(appOrigin(hosted),'https://preview.example.invalid');assert.equal(appCookieSecure(hosted),true);
 assert.equal(appOrigin({AESTHENDA_STAGING:'1'}),'http://127.0.0.1:3190');assert.equal(appCookieSecure({AESTHENDA_STAGING:'1',NODE_ENV:'production'}),false);
 for(const origin of ['', 'http://127.0.0.1:3190','https://localhost','http://example.invalid','https://name:password@example.invalid','https://example.invalid/path','https://example.invalid/?next=bad'])assert.throws(()=>appOrigin({...hosted,AESTHENDA_PUBLIC_ORIGIN:origin}));
 assert.throws(()=>appOrigin({VERCEL:'1',AESTHENDA_STAGING:'1'}));assert.equal(appCookieSecure({VERCEL:'1'}),true);
});
test('hosted guest email configuration cannot silently route verification to localhost',()=>{
 const config={AESTHENDA_STAGING:'1',AESTHENDA_HOSTED_PREVIEW:'1',AESTHENDA_GUEST_EMAIL_READY:'1',RESEND_API_KEY:'synthetic-key',AESTHENDA_GUEST_EMAIL_FROM:'booking@example.invalid'};
 assert.equal(guestMailConfig(config),null);assert.equal(guestMailConfig({...config,AESTHENDA_PUBLIC_ORIGIN:'https://preview.example.invalid'}).origin,'https://preview.example.invalid');
});
test('portable database certificate keeps TLS verification and replaces connection-string overrides',()=>{
 const url='postgresql://restricted:synthetic@pool.example.invalid/database?sslmode=verify-full&sslrootcert=%2Fmac-only%2Fca.crt&application_name=preview';
 assert.deepEqual(databaseConnectionConfig(url),{connectionString:url});assert.throws(()=>databaseConnectionConfig(url,'invalid'),/CA certificate/);
 const result=databaseConnectionConfig(url,'-----BEGIN CERTIFICATE-----\\nsynthetic-test-only\\n-----END CERTIFICATE-----');
 assert.equal(result.ssl.rejectUnauthorized,true);assert.match(result.ssl.ca,/\nsynthetic/);const parsed=new URL(result.connectionString);assert.equal(parsed.searchParams.has('sslmode'),false);assert.equal(parsed.searchParams.has('sslrootcert'),false);assert.equal(parsed.searchParams.get('application_name'),'preview');
});

test('hosted preflight rejects missing secrets, wrong project and unsafe origins without printing values',async()=>{
 const {hostedPreviewErrors}=await import('../scripts/check-hosted-preview.mjs');
 assert.deepEqual(hostedPreviewErrors({}),[]);
 const valid={VERCEL:'1',AESTHENDA_HOSTED_PREVIEW:'1',AESTHENDA_STAGING:'1',NEXT_PUBLIC_SUPABASE_URL:'https://srwjgtvmlrkdqtxetjuu.supabase.co',AESTHENDA_PUBLIC_ORIGIN:'https://preview.example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic',AESTHENDA_DATABASE_URL:'postgresql://aesthenda_runtime.srwjgtvmlrkdqtxetjuu:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres',AESTHENDA_DATABASE_CA:'-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----',AESTHENDA_GUEST_TOKEN_KEY:'a'.repeat(64),RESEND_API_KEY:'synthetic-private-key',AESTHENDA_GUEST_EMAIL_FROM:'bookings@example.invalid'};
 assert.deepEqual(hostedPreviewErrors(valid),[]);
 for(const changes of [{AESTHENDA_HOSTED_PREVIEW:''},{AESTHENDA_PUBLIC_ORIGIN:'http://localhost:3190'},{NEXT_PUBLIC_SUPABASE_URL:'https://original-project.supabase.co'},{AESTHENDA_DATABASE_CA:''},{AESTHENDA_DATABASE_URL:'postgresql://postgres:private-password@pool.supabase.com/postgres'}]){const errors=hostedPreviewErrors({...valid,...changes});assert.ok(errors.length);assert.doesNotMatch(errors.join(' '),/private-password|synthetic-private-key/);}
});
