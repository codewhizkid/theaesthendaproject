import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSetupInput} from '../lib/business/input.ts';
function form(overrides={}) {
 const data=new FormData();
 for(const [key,value] of Object.entries({actionVersion:'1',requestKey:crypto.randomUUID(),businessName:' My studio ',professionalName:' My Name ',...overrides})) data.set(key,value);
 return data;
}
test('setup accepts names and a versioned retry key, never caller identity or lifecycle',()=>{
 const data=form({ownerUserId:'forged',businessAccountId:'forged',status:'active'});
 const result=parseSetupInput(data);
 assert.equal(result.businessName,'My studio'); assert.equal(result.professionalName,'My Name');
 assert.equal(result.actionVersion,1); assert.equal(Object.keys(result).length,4);
});
test('invalid names and unsupported action versions fail before persistence',()=>{
 for(const invalid of [{professionalName:''},{businessName:' '},{professionalName:'x'.repeat(161)},{actionVersion:'2'},{requestKey:'invalid'}]) assert.throws(()=>parseSetupInput(form(invalid)));
});
