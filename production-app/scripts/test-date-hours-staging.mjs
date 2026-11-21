// Uses only explicitly provisioned disposable staging fixtures. Sends no emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
const config=parseEnv(readFileSync('.env.staging.local','utf8'));
assert.equal(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,'srwjgtvmlrkdqtxetjuu.supabase.co');
const fixtures=JSON.parse(readFileSync('.env.date-hours-qa.local','utf8'));
assert.equal(fixtures.length,2);
for(const f of fixtures)assert.match(f.email,/^qa-dates-[0-9a-f-]+@example\.invalid$/);
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


import pg from 'pg';
const db=new pg.Client({connectionString:config.AESTHENDA_DATABASE_URL});await db.connect();
const date='2099-01-05';
async function snapshot(i){return (await db.query('select aesthenda_private.read_date_hours_v1($1) as r',[fixtures[i].id])).rows[0].r;}
async function effective(i){return (await db.query('select aesthenda_private.effective_date_hours_v1($1,$2::date) as r',[fixtures[i].id,date])).rows[0].r;}
async function dateForm(actor,mode,windows=[],revision=null){
 const page=await get(actor,'/availability');assert.equal(page.status,200);const form=formFrom(await page.text(),'date');form.set('date',date);form.set('mode',mode);form.set('windows',JSON.stringify(windows));if(revision!==null)form.set('revision',String(revision));return form;
}
try{
 const [a,b]=await Promise.all(fixtures.map(signIn));
 for(const [i,actor]of[a,b].entries()){
  const setup=await get(actor,'/business');assert.equal(setup.status,200);const sf=formFrom(await setup.text(),'requestKey');sf.set('businessName','QA Dates Salon '+i);sf.set('professionalName','QA Dates Professional '+i);assert.equal((await post(actor,'/business',sf)).status,303);
  const weekly=await get(actor,'/availability');const wf=formFrom(await weekly.text(),'windows');wf.set('timezone','America/New_York');wf.set('windows',JSON.stringify([{day:1,startMinute:540,endMinute:1020}]));assert.equal((await post(actor,'/availability',wf)).status,303);
 }
 const stale=await dateForm(a,'weekly');const closed=await dateForm(a,'closed');closed.set('actorId',fixtures[1].id);closed.set('businessId',crypto.randomUUID());
 assert.equal((await post(a,'/availability',closed)).status,303);assert.equal((await post(a,'/availability',closed)).status,303);assert.equal((await snapshot(0))[0].revision,1);assert.equal((await effective(0)).source,'closed');assert.equal((await effective(1)).source,'weekly');
 const custom=[{startMinute:600,endMinute:720},{startMinute:780,endMinute:900}];assert.equal((await post(b,'/availability',await dateForm(b,'custom',custom))).status,303);assert.deepEqual((await effective(1)).windows,custom);assert.equal((await effective(0)).source,'closed');
 console.log('PASS: real-auth web forms save closed/custom dates independently; retries and forged account hints cannot change the other salon.');
 const staleResponse=await post(a,'/availability',stale);assert.equal(staleResponse.status,200);assert.ok((await staleResponse.text()).includes('changed in another tab'));assert.equal((await snapshot(0))[0].revision,1);
 const html=await (await get(a,'/availability?businessId='+fixtures[1].id)).text();assert.ok(!html.includes('QA Dates Salon 1'));assert.ok(!html.includes('10:00 AM–12:00 PM'));assert.ok(html.includes('2099-01-05'));
 const revert=await dateForm(a,'weekly',[],1);assert.equal((await post(a,'/availability',revert)).status,303);assert.equal((await effective(0)).source,'weekly');assert.deepEqual((await effective(0)).windows,[{startMinute:540,endMinute:1020}]);assert.equal((await effective(1)).source,'custom');
 console.log('PASS: stale forms are blocked and reverting an exception restores unchanged weekly hours only for that salon.');
 const fresh=await signIn(fixtures[1]);const body=await (await get(fresh,'/availability')).text();assert.ok(body.includes('2099-01-05'));assert.ok(body.includes('10:00 AM–12:00 PM'));
 const out=await fetch(origin+'/availability',{redirect:'manual'});assert.equal(out.status,307);
 console.log('PASS: persisted special hours survive fresh real-auth login; signed-out access remains blocked. Cleanup required.');
}finally{for(const actor of actors)await actor.client.auth.signOut({scope:'local'});await db.end();}
