import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClient} from '../lib/clients/input.ts';
function form(overrides={}){const f=new FormData();for(const [k,v]of Object.entries({actionVersion:'1',requestKey:crypto.randomUUID(),clientId:'',revision:'0',firstName:'  Alex ',lastName:'Smith',email:'alex@example.invalid',phone:'+1 (212) 555-0101',notes:' Prefers mornings ',...overrides}))f.set(k,v);return f;}
test('client input requires a contact and and trims details, ignoring identity hints',()=>{
 const input=parseClient(form({businessId:crypto.randomUUID(),actorId:crypto.randomUUID(),status:'blocked'}));assert.equal(input.firstName,'Alex');assert.equal(input.notes,'Prefers mornings');assert.equal(input.id,null);assert.equal(input.businessId,undefined);assert.equal(input.status,undefined);
 assert.throws(()=>parseClient(form({email:'',phone:'',lastName:'',notes:''})),/phone number or email/);
 assert.equal(parseClient(form({email:'',phone:'2125550101'})).email,'');
 assert.equal(parseClient(form({email:'alex@example.invalid',phone:''})).phone,'');
});
test('client input rejects invalid details, revision and retry tokens',()=>{
 for(const overrides of [{firstName:''},{firstName:'a'.repeat(81)},{lastName:'a'.repeat(81)},{email:'invalid'},{phone:'555'},{phone:'555-123-4567 ext 2'},{notes:'a'.repeat(2001)},{revision:'1'},{clientId:crypto.randomUUID(),revision:'0'},{requestKey:'bad'},{actionVersion:'2'},{revision:'2147483647'}])assert.throws(()=>parseClient(form(overrides)));
 assert.equal(parseClient(form({clientId:crypto.randomUUID(),revision:'2'})).revision,2);
});

test('communication choices validate available channels and never infer permission',()=>{
 const input=parseClient(form());assert.deepEqual(input.preferences,{updatesEmail:false,updatesText:false,marketingEmail:false,marketingText:false,preferredContact:'none'});
 assert.equal(input.consentMethod,'not_given');
 assert.throws(()=>parseClient(form({email:'',updatesEmail:'on'})),/contact details/);
 assert.throws(()=>parseClient(form({phone:'',marketingText:'on'})),/contact details/);
 assert.throws(()=>parseClient(form({preferredContact:'fax'})),/contact preference/);
 assert.throws(()=>parseClient(form({consentMethod:'invented'})),/permission/);
 const explicit=parseClient(form({updatesText:'on',consentMethod:'verbal'}));assert.equal(explicit.preferences.updatesText,true);assert.equal(explicit.preferences.marketingText,false);
});
