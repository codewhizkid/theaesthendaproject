import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedClientIdentity,clientPublicOrigin,isInviteToken,clientAuthCookieName} from '../lib/client-access/identity.ts';
const id='00000000-0000-4000-8000-000000000001',stamp='2030-01-01T12:00:00Z';
test('client identity accepts only provider-confirmed contacts and never metadata flags',()=>{
 assert.equal(verifiedClientIdentity({id,email:'alex@example.invalid',user_metadata:{verified:true,email_confirmed_at:stamp}}),null);
 assert.equal(verifiedClientIdentity({id,email:'alex@example.invalid',confirmed_at:stamp}),null);
 assert.deepEqual(verifiedClientIdentity({id,email:' Alex@Example.invalid ',email_confirmed_at:stamp,phone:'12125550100'}),{id,email:'alex@example.invalid',phone:''});
 assert.deepEqual(verifiedClientIdentity({id,phone:'12125550100',phone_confirmed_at:stamp}),{id,email:'',phone:'+12125550100'});
 assert.equal(verifiedClientIdentity({id,email:'alex@example.invalid',email_confirmed_at:stamp,is_anonymous:true}),null);
 for(const value of [null,{id:'invalid',email:'alex@example.invalid',email_confirmed_at:stamp},{id,email:'invalid',email_confirmed_at:stamp},{id,phone:'123',phone_confirmed_at:stamp}])assert.equal(verifiedClientIdentity(value),null);
});
test('invitation token format and separate client cookie scope',()=>{assert.equal(isInviteToken('a'.repeat(64)),true);for(const value of ['',null,'a'.repeat(63),'Z'.repeat(64),'../client'])assert.equal(isInviteToken(value),false);assert.equal(clientAuthCookieName,'ae-client-auth');});
test('auth redirect origin is configured, never request-supplied, and HTTPS outside loopback',()=>{
 assert.equal(clientPublicOrigin({AESTHENDA_STAGING:'1'}),'http://127.0.0.1:3190');assert.equal(clientPublicOrigin({AESTHENDA_PUBLIC_ORIGIN:'https://aesthenda.com'}),'https://aesthenda.com');
 for(const raw of ['http://example.com','https://user:pass@example.com','https://example.com/redirect','https://example.com/?next=evil','javascript:alert(1)'])assert.throws(()=>clientPublicOrigin({AESTHENDA_PUBLIC_ORIGIN:raw}));assert.throws(()=>clientPublicOrigin({}));
});
