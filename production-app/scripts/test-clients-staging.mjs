// Uses only explicitly provisioned disposable staging fixtures. Sends no emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const fixtures=JSON.parse(readFileSync('.env.clients-qa.local','utf8'));
assert.equal(fixtures.length,2);
for(const f of fixtures)assert.match(f.email,/^qa-clients-[0-9a-f-]+@example\.invalid$/);
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
  const form=formFrom(await response.text(),'requestKey');form.set('businessName',`QA Clients Salon ${i} ${marker}`);form.set('professionalName',`QA Professional ${i}`);
  assert.equal((await post(actor,'/business',form)).status,303);
 }
 const names=[`QA Client A ${marker}`,`QA Client B ${marker}`],ids=[];
 for(const [i,actor]of [a,b].entries()){
  const response=await get(actor,'/clients');assert.equal(response.status,200);const form=formFrom(await response.text(),'requestKey');
  form.set('firstName',names[i]);form.set('lastName','Tester');form.set('email','client@example.invalid');form.set('phone','+1 (212) 555-0101');form.set('notes',`Private ${i} ${marker}`);
  form.set('actorId',fixtures[1-i].id);form.set('businessId',crypto.randomUUID());form.set('status','blocked');
  const saved=await post(actor,'/clients',form);assert.equal(saved.status,303);const location=saved.headers.get('location');assert.match(location,/\/clients\/[0-9a-f-]+\?saved=1$/);ids.push(location.split('/').at(-1).split('?')[0]);
  const retry=await post(actor,'/clients',form);assert.equal(retry.status,303);assert.equal(retry.headers.get('location'),location);
 }
 console.log('PASS: two real authenticated client forms save once, ignoring forged actor/business/status fields.');
 for(const [i,actor]of [a,b].entries()){
  const response=await get(actor,'/clients');const body=await response.text();assert.equal(response.status,200);assert.ok(body.includes(names[i]));assert.ok(!body.includes(names[1-i]));assert.ok(!body.includes(`Private ${i} ${marker}`));
  const foreign=await get(actor,'/clients/'+ids[1-i]);assert.equal(foreign.status,404);assert.ok(!(await foreign.text()).includes(names[1-i]));
  const search=await get(actor,'/clients?q='+encodeURIComponent(names[1-i]));assert.ok((await search.text()).includes('No clients match your search.'));
 }
 console.log('PASS: lists, search, notes and direct URLs preserve salon boundaries.');
 const detail=await get(a,'/clients/'+ids[0]);const html=await detail.text();const edit=formFrom(html,'revision');
 edit.set('firstName','Updated '+marker);edit.set('lastName','Tester');edit.set('email','updated@example.invalid');edit.set('phone','');edit.set('notes','Updated private note');
 const forged=formFrom(html,'revision');for(const [k,v]of edit)forged.set(k,v);forged.set('clientId',ids[1]);
 const denied=await post(a,'/clients/'+ids[0],forged);assert.equal(denied.status,200);assert.ok((await denied.text()).includes('Could not save this client.'));
 assert.ok((await (await get(b,'/clients/'+ids[1])).text()).includes(names[1]));
 const stale=new FormData();for(const [k,v]of edit)stale.set(k,v);stale.set('requestKey',crypto.randomUUID());stale.set('firstName','Old tab');
 assert.equal((await post(a,'/clients/'+ids[0],edit)).status,303);assert.equal((await post(a,'/clients/'+ids[0],edit)).status,303);
 const conflict=await post(a,'/clients/'+ids[0],stale);assert.equal(conflict.status,200);assert.ok((await conflict.text()).includes('This client was changed in another tab.'));
 const returning=await signIn(fixtures[0]);const durable=await get(returning,'/clients/'+ids[0]);const durableHtml=await durable.text();assert.ok(durableHtml.includes('Updated '+marker));assert.ok(durableHtml.includes('Updated private note'));assert.ok(durableHtml.includes('updated@example.invalid'));
 console.log('PASS: forged edits are denied; own edits persist across a fresh session, retry safely, and reject stale tabs.');
 for(const path of ['/clients','/clients/'+ids[0]]){const out=await fetch(origin+path,{redirect:'manual'});assert.equal(out.status,307);assert.match(out.headers.get('location'),/\/auth\/sign-in$/);}
 console.log('PASS: signed-out list and detail requests are blocked. Exact fixture cleanup is required.');
} finally {for(const actor of actors)await actor.client.auth.signOut({scope:'local'});}
