// Uses only explicitly provisioned disposable staging fixtures. Sends no emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const fixtures=JSON.parse(readFileSync('.env.availability-qa.local','utf8'));
assert.equal(fixtures.length,2);
for(const f of fixtures)assert.match(f.email,/^qa-hours-[0-9a-f-]+@example\.invalid$/);
const origin='http://127.0.0.1:3190';
const actors=[];
async function signIn(f) {
 const jar=new Map();
 const client=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:entries=>entries.forEach(({name,value})=>jar.set(name,value))}});
 const {data,error}=await client.auth.signInWithPassword({email:f.email,password:f.password});
 assert.equal(error,null,'Real staging fixture login must succeed');assert.equal(data.user.id,f.id);
 const actor={client,headers:()=>({Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')})};actors.push(actor);return actor;
}
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#x27;',"'").replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
function formFrom(html,field) {
 const formHtml=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(x=>x[0]).find(x=>x.includes(`name="${field}"`));
 assert.ok(formHtml,'Expected server action form');const form=new FormData();
 for(const match of formHtml.matchAll(/<input\b[^>]*>/g)){
  const a=Object.fromEntries([...match[0].matchAll(/([^\s=/>]+)="([^"]*)"/g)].map(x=>[x[1],decode(x[2])]));
  if(a.type==='hidden'&&a.name)form.append(a.name,a.value??'');
 }return form;
}
const get=(actor,path)=>fetch(origin+path,{headers:actor.headers(),redirect:'manual'});
const post=(actor,path,body)=>fetch(origin+path,{method:'POST',headers:{...actor.headers(),Origin:origin},body,redirect:'manual'});

async function state(actor,query='') {
 const response=await get(actor,'/availability'+query);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store|no-cache, must-revalidate/); // Next dev overrides the middleware header.
 const html=await response.text();const form=formFrom(html,'revision');
 return {form,revision:Number(form.get('revision')),windows:JSON.parse(form.get('windows')),html};
}
function payload(snapshot,windows,timezone,key=null) {
 const form=snapshot.form;form.set('windows',JSON.stringify(windows));form.set('timezone',timezone);if(key)form.set('requestKey',key);return form;
}
try {
 const [a,b]=await Promise.all(fixtures.map(signIn));
 for(const [i,actor]of [a,b].entries()){
  const response=await get(actor,'/business');
  if(response.status===307){assert.match(response.headers.get('location'),/dashboard/);continue;}
  assert.equal(response.status,200);const form=formFrom(await response.text(),'requestKey');form.set('businessName','QA Hours Salon '+i);form.set('professionalName','QA Hours Professional '+i);assert.equal((await post(actor,'/business',form)).status,303);
 }
 const initialA=await state(a),initialB=await state(b);assert.equal(initialA.revision,0);assert.equal(initialB.revision,0);
 const stale=await state(a);
 const hoursA=[{day:1,startMinute:540,endMinute:720},{day:1,startMinute:780,endMinute:1020}];const hoursB=[{day:6,startMinute:600,endMinute:840}];
 const formA=payload(initialA,hoursA,'America/New_York');formA.set('businessId',crypto.randomUUID());formA.set('actorId',fixtures[1].id);formA.set('professionalId',crypto.randomUUID());
 const savedA=await post(a,'/availability',formA);assert.equal(savedA.status,303);assert.match(savedA.headers.get('location'),/availability\?saved=1/);
 assert.equal((await post(b,'/availability',payload(initialB,hoursB,'Europe/London'))).status,303);
 const afterA=await state(a),afterB=await state(b);assert.deepEqual(afterA.windows,hoursA);assert.deepEqual(afterB.windows,hoursB);assert.equal(afterA.revision,1);assert.equal(afterB.revision,1);
 console.log('PASS: actual web forms saved distinct split-shift schedules for two real authenticated staging accounts.');
 assert.equal((await post(a,'/availability',formA)).status,303);assert.equal((await state(a)).revision,1);
 const oldTab=await post(a,'/availability',payload(stale,[],'America/New_York'));assert.equal(oldTab.status,200);assert.ok((await oldTab.text()).includes('Your hours changed in another tab'));assert.deepEqual((await state(a)).windows,hoursA);
 console.log('PASS: replay is idempotent and a stale web form cannot overwrite newer working hours.');
 const invalid=await state(a);const overlap=[{day:1,startMinute:540,endMinute:780},{day:1,startMinute:600,endMinute:840}];
 const rejected=await post(a,'/availability',payload(invalid,overlap,'America/New_York'));assert.equal(rejected.status,200);assert.ok((await rejected.text()).includes('cannot overlap'));assert.deepEqual((await state(a)).windows,hoursA);
 console.log('PASS: overlapping periods are rejected without modifying saved hours.');
 const foreignQuery=await state(a,'?businessId='+fixtures[1].id+'&actorId='+fixtures[1].id);assert.deepEqual(foreignQuery.windows,hoursA);assert.ok(!foreignQuery.html.includes('QA Hours Salon 1'));
 const forged=payload(await state(a),[],'UTC');forged.set('actorId',fixtures[1].id);forged.set('businessId',crypto.randomUUID());forged.set('professionalId',fixtures[1].id);
 assert.equal((await post(a,'/availability',forged)).status,303);assert.deepEqual((await state(a)).windows,[]);assert.deepEqual((await state(b)).windows,hoursB);assert.equal((await state(b)).revision,1);
 console.log('PASS: forged account hints cannot read or overwrite the other salon’s schedule; all-closed week saves correctly.');
 const returning=await signIn(fixtures[1]);assert.deepEqual((await state(returning)).windows,hoursB);
 const out=await fetch(origin+'/availability',{redirect:'manual'});assert.equal(out.status,307);assert.match(out.headers.get('location'),/auth\/sign-in$/);
 console.log('PASS: fresh-session persistence, development cache-revalidation headers and signed-out denial. Fixture cleanup is required.');
}finally{for(const actor of actors)await actor.client.auth.signOut({scope:'local'});}
