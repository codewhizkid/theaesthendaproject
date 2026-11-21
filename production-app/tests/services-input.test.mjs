import test from 'node:test';import assert from 'node:assert/strict';
import {parseService} from '../lib/services/input.ts';
const form=(overrides={})=>{const f=new FormData();for(const [k,v]of Object.entries({actionVersion:'1',requestKey:crypto.randomUUID(),name:'Haircut',serviceType:'Cuts',description:'Details',durationMinutes:'45',price:'123.45',...overrides}))f.set(k,v);return f;};
test('service money uses exact minor units and ignores forged identity/lifecycle',()=>{
 const x=parseService(form({businessId:'foreign',actorId:'foreign',status:'active',isPublic:'true'}));
 assert.equal(x.priceCents,12345);assert.equal(x.businessId,undefined);assert.equal(x.status,undefined);
 assert.equal(parseService(form({price:'0.01'})).priceCents,1);assert.equal(parseService(form({price:'1.1'})).priceCents,110);
});
test('service validation rejects fractional duration, malformed money and invalid retry keys',()=>{
 for(const bad of [{durationMinutes:'0'},{durationMinutes:'1.5'},{durationMinutes:'1441'},{price:'1.234'},{price:'-1'},{price:'1e2'},{price:'1000000'},{name:' '},{requestKey:'forged'},{description:'x'.repeat(2001)}])assert.throws(()=>parseService(form(bad)));
});
test('service steps compute total and preserve explicit processing release',()=>{
 const steps=[{label:' Application ',kind:'active',durationMinutes:15,released:false},{label:'Processing',kind:'processing',durationMinutes:30,released:true},{label:'Finish',kind:'active',durationMinutes:45,released:false}];
 const x=parseService(form({steps:JSON.stringify(steps),durationMinutes:'999'}));assert.equal(x.durationMinutes,90);assert.equal(x.steps[0].label,'Application');assert.equal(x.steps[1].released,true);
 for(const invalid of [[{...steps[0],released:true}],[{...steps[1],durationMinutes:0}],[{...steps[1],durationMinutes:1.5}],[],[{...steps[0],durationMinutes:1440},steps[1]]])assert.throws(()=>parseService(form({steps:JSON.stringify(invalid)})));
 assert.throws(()=>parseService(form({serviceId:crypto.randomUUID(),revision:'0'})));
});

test('service types are entered by the provider and bounded before saving',()=>{assert.equal(parseService(form({serviceType:'  My own treatments  '})).serviceType,'My own treatments');for(const serviceType of ['', ' ', 'x'.repeat(81)])assert.throws(()=>parseService(form({serviceType})));});
