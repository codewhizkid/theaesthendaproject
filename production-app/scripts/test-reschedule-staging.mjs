// Uses only explicitly provisioned disposable staging fixtures. Sends no emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const fixtures=JSON.parse(readFileSync('.env.reschedule-qa.local','utf8'));
assert.equal(fixtures.length,2);
for(const f of fixtures)assert.match(f.email,/^qa-reschedule-[0-9a-f-]+@example\.invalid$/);
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
const marker=crypto.randomUUID(),date='2030-01-07',records=[];
const pathFor=r=>'/appointments?'+new URLSearchParams({date,client:r.client,service:r.service});
try {
 const [a,b]=await Promise.all(fixtures.map(signIn));
 for(const [i,actor]of [a,b].entries()){
  let response=await get(actor,'/business');let form=formFrom(await response.text(),'requestKey');form.set('businessName',`QA Appointment Salon ${i} ${marker}`);form.set('professionalName',`QA Professional ${i}`);assert.equal((await post(actor,'/business',form)).status,303);
  response=await get(actor,'/clients');form=formFrom(await response.text(),'requestKey');form.set('firstName',`QA Appointment Client ${i} ${marker}`);form.set('lastName','Tester');form.set('email','');form.set('phone','');form.set('notes','');const savedClient=await post(actor,'/clients',form);assert.equal(savedClient.status,303);const client=savedClient.headers.get('location').split('/').at(-1).split('?')[0];
  response=await get(actor,'/services');form=formFrom(await response.text(),'requestKey');form.set('name',`QA Appointment Service ${i} ${marker}`);form.set('description','');form.set('durationMinutes','45');form.set('price','65');const savedService=await post(actor,'/services',form);assert.equal(savedService.status,303);const service=savedService.headers.get('location').split('/').at(-1);
  response=await get(actor,'/availability');form=formFrom(await response.text(),'requestKey');form.set('timezone','America/New_York');form.set('windows',JSON.stringify(Array.from({length:7},(_,day)=>({day,startMinute:540,endMinute:1020}))));assert.equal((await post(actor,'/availability',form)).status,303);
  records.push({client,service,name:`QA Appointment Client ${i} ${marker}`});
 }
 console.log('PASS: two real accounts set up separate salons, clients, services and hours through the web forms.');
 for(const [i,actor]of [a,b].entries()){
  const path=pathFor(records[i]);const response=await get(actor,path);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('9:00 AM'));const form=formFrom(html,'startAt');
  form.set('actorId',fixtures[1-i].id);form.set('businessId',crypto.randomUUID());form.set('status','confirmed');form.set('durationMinutes','1');form.set('priceCents','1');
  const saved=await post(actor,path,form);assert.equal(saved.status,303);const location=saved.headers.get('location');assert.match(location,/\/appointments\/[0-9a-f-]+\?saved=1$/);records[i].id=location.split('/').at(-1).split('?')[0];records[i].form=form;
  const replay=await post(actor,path,form);assert.equal(replay.status,303);assert.equal(replay.headers.get('location'),location);
  const occupied=new FormData();for(const [k,v]of form)occupied.set(k,v);occupied.set('requestKey',crypto.randomUUID());const conflict=await post(actor,path,occupied);assert.equal(conflict.status,200);assert.ok((await conflict.text()).includes('That time is no longer available.'));
 }
 console.log('PASS: appointment forms reserve 45 minutes with a saved price, retry once and block a second occupied-slot save.');
 for(const [i,actor]of [a,b].entries()){
  const schedule=await get(actor,'/appointments?date='+date);const html=await schedule.text();assert.ok(html.includes(records[i].name));assert.ok(!html.includes(records[1-i].name));
  const own=await get(actor,'/appointments/'+records[i].id);const detail=await own.text();assert.ok(detail.includes('9:00 AM–9:45 AM'));assert.ok(detail.includes('$65.00'));assert.ok(detail.includes('Status:'));assert.ok(detail.includes('pending'));
  const foreign=await get(actor,'/appointments/'+records[1-i].id);assert.equal(foreign.status,404);assert.ok(!(await foreign.text()).includes(records[1-i].name));
 }
 const bdetail=await get(b,'/appointments/'+records[1].id);const cancellation=formFrom(await bdetail.text(),'appointmentId');const denied=await post(a,'/appointments/'+records[0].id,cancellation);assert.equal(denied.status,200);assert.ok((await denied.text()).includes('Could not cancel this appointment.'));
 const forged=new FormData();for(const [k,v]of records[0].form)forged.set(k,v);forged.set('requestKey',crypto.randomUUID());forged.set('clientId',records[1].client);forged.set('startAt','2030-01-07T16:00:00Z');const deniedClient=await post(a,pathFor(records[0]),forged);assert.equal(deniedClient.status,200);assert.ok((await deniedClient.text()).includes('Could not save this appointment.'));
 console.log('PASS: salon lists/details are isolated; foreign URLs, clients and cancellation requests are blocked.');
 const movePath='/appointments/'+records[0].id+'/reschedule?date='+date;
 const initialPreview=await get(a,movePath);assert.equal(initialPreview.status,200);const moveForm=formFrom(await initialPreview.text(),'moveToken');
 const occupied=new FormData();for(const [k,v]of records[0].form)occupied.set(k,v);occupied.set('requestKey',crypto.randomUUID());occupied.set('startAt','2030-01-07T16:00:00Z');assert.equal((await post(a,pathFor(records[0]),occupied)).status,303);
 moveForm.set('startAt','2030-01-07T16:00:00Z');const conflictMove=await post(a,movePath,moveForm);assert.equal(conflictMove.status,200);assert.ok((await conflictMove.text()).includes('Your original appointment is unchanged.'));assert.ok((await (await get(a,'/appointments/'+records[0].id)).text()).includes('9:00 AM–9:45 AM'));
 const foreignPreview=await get(a,'/appointments/'+records[1].id+'/reschedule?date='+date);assert.equal(foreignPreview.status,404);
 const bpreview=await get(b,'/appointments/'+records[1].id+'/reschedule?date='+date);const foreignMove=formFrom(await bpreview.text(),'moveToken');foreignMove.set('startAt','2030-01-07T15:00:00Z');const deniedMove=await post(a,movePath,foreignMove);assert.equal(deniedMove.status,200);assert.ok((await deniedMove.text()).includes('The appointment could not be moved.'));
 moveForm.set('startAt','2030-01-07T15:00:00Z');moveForm.set('priceCents','1');moveForm.set('durationMinutes','1');moveForm.set('clientId',records[1].client);moveForm.set('actorId',fixtures[1].id);
 const moved=await post(a,movePath,moveForm);assert.equal(moved.status,303);assert.equal(moved.headers.get('location'),'/appointments/'+records[0].id+'?rescheduled=1');assert.equal((await post(a,movePath,moveForm)).status,303);
 const stale=new FormData();for(const [k,v]of moveForm)stale.set(k,v);stale.set('requestKey',crypto.randomUUID());stale.set('startAt','2030-01-07T15:15:00Z');const deniedStale=await post(a,movePath,stale);assert.equal(deniedStale.status,200);assert.ok((await deniedStale.text()).includes('This appointment changed in another tab.'));
 const movedDetails=await (await get(a,'/appointments/'+records[0].id)).text();assert.ok(movedDetails.includes('10:00 AM–10:45 AM'));assert.ok(movedDetails.includes('$65.00'));assert.ok(movedDetails.includes(records[0].name));assert.ok((await (await get(b,'/appointments/'+records[1].id)).text()).includes('9:00 AM–9:45 AM'));
 console.log('PASS: failed moves preserve original time; foreign moves fail; successful move keeps identity, price/client/duration, rejects stale tabs and retries safely.');
 const returning=await signIn(fixtures[0]);const freshDetail=await (await get(returning,'/appointments/'+records[0].id)).text();assert.ok(freshDetail.includes(records[0].name));assert.ok(freshDetail.includes('10:00 AM–10:45 AM'));
 const adetail=await get(a,'/appointments/'+records[0].id);const cancel=formFrom(await adetail.text(),'appointmentId');assert.equal((await post(a,'/appointments/'+records[0].id,cancel)).status,303);assert.equal((await post(a,'/appointments/'+records[0].id,cancel)).status,303);
 assert.ok((await (await get(a,'/appointments/'+records[0].id)).text()).includes('cancelled'));
 const available=await get(a,pathFor(records[0]));const newForm=formFrom(await available.text(),'startAt');assert.equal(newForm.get('startAt'),records[0].form.get('startAt'));
 assert.ok((await (await get(b,'/appointments/'+records[1].id)).text()).includes('pending'));
 console.log('PASS: a new login sees persisted booking; cancellation retains history and frees the time for only its salon.');
 for(const path of ['/appointments','/appointments/'+records[0].id]){const out=await fetch(origin+path,{redirect:'manual'});assert.equal(out.status,307);assert.match(out.headers.get('location'),/\/auth\/sign-in$/);}
 console.log('PASS: signed-out schedule/detail requests are blocked. Exact fixture cleanup is required.');
} finally {for(const actor of actors)await actor.client.auth.signOut({scope:'local'});}
