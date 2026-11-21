// Uses only explicitly provisioned disposable staging fixtures. Sends no emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const fixtures=JSON.parse(readFileSync('.env.service-qa.local','utf8'));
assert.equal(fixtures.length,2);
for(const f of fixtures)assert.match(f.email,/^qa-services-[0-9a-f-]+@example\.invalid$/);
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
const marker=crypto.randomUUID();
try {
 const [a,b]=await Promise.all(fixtures.map(signIn));
 for(const [i,actor]of [a,b].entries()){
  const response=await get(actor,'/business');if(response.status===307){assert.match(response.headers.get('location'),/dashboard/);continue;}assert.equal(response.status,200);
  const form=formFrom(await response.text(),'requestKey');form.set('businessName',`QA Service Salon ${i} ${marker}`);form.set('professionalName',`QA Professional ${i}`);
  assert.equal((await post(actor,'/business',form)).status,303);
 }
 console.log('PASS: two real Supabase sessions created separate businesses through trusted web actions.');
 const ids=[];const names=[`QA Service A ${marker}`,`QA Service B ${marker}`];
 for(const [i,actor]of [a,b].entries()){
  const response=await get(actor,'/services');assert.equal(response.status,200);const form=formFrom(await response.text(),'requestKey');
  form.set('name',names[i]);form.set('description','Disposable isolation acceptance');form.set('durationMinutes','45');form.set('price','123.45');
  // The action must ignore all caller identity and account hints.
  form.set('actorId',fixtures[1-i].id);form.set('businessId',crypto.randomUUID());form.set('isPublic','true');form.set('status','active');
  const saved=await post(actor,'/services',form);assert.equal(saved.status,303);
  const location=saved.headers.get('location');assert.match(location,/\/services\/[0-9a-f-]+$/);ids.push(location.split('/').at(-1));
  const retry=await post(actor,'/services',form);assert.equal(retry.status,303);assert.equal(retry.headers.get('location'),location);
 }
 console.log('PASS: both service forms save durably; forged identities are ignored and replay returns the same record.');
 for(const [i,actor]of [a,b].entries()){
  const list=await get(actor,'/services');const body=await list.text();assert.equal(list.status,200);assert.ok(body.includes(names[i]));assert.ok(!body.includes(names[1-i]));
  const foreign=await get(actor,'/services/'+ids[1-i]);assert.equal(foreign.status,404);assert.ok(!(await foreign.text()).includes(names[1-i]));
 }
 console.log('PASS: each salon list excludes the other, and direct cross-salon service URLs return 404 without private content.');
 const bdetail=await get(b,'/services/'+ids[1]);const archive=formFrom(await bdetail.text(),'serviceId');
 const denied=await post(a,'/services/'+ids[0],archive);assert.equal(denied.status,200);assert.ok((await denied.text()).includes('Service unavailable or could not be archived'));
 const unchanged=await get(b,'/services/'+ids[1]);assert.ok((await unchanged.text()).includes('Private draft'));
 console.log('PASS: an actual forged archive POST from salon A cannot change salon B’s service.');
 const returning=await signIn(fixtures[0]);const durable=await get(returning,'/services/'+ids[0]);assert.ok((await durable.text()).includes(names[0]));
 const ownArchive=await post(b,'/services/'+ids[1],archive);assert.equal(ownArchive.status,303);
 const archived=await get(b,'/services/'+ids[1]);assert.ok((await archived.text()).includes('Archived service'));
 console.log('PASS: fresh real-auth session sees saved service; own archival retains the service record.');
 const out=await fetch(origin+'/services',{redirect:'manual'});assert.equal(out.status,307);assert.match(out.headers.get('location'),/\/auth\/sign-in$/);
 console.log('PASS: signed-out service access is blocked. Fixture cleanup is required.');
} finally {
 for(const actor of actors)await actor.client.auth.signOut({scope:'local'});
}
