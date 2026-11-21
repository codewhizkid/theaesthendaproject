import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin=process.env.TEST_APP_URL,manifestPath=process.env.TEST_SERVER_ACTION_MANIFEST;
// Exercise public-page invocation of the real read-only action IDs too. Next
// may forward to a private worker: a blocked worker returns an empty JSON result
// rather than exposing lookup data. Direct action redirects must go to sign-in.
for(const [name,args] of [['reviewClientBooking',[{message:'',review:null},{}]],['loadClientPreviewTimes',['00000000-0000-4000-8000-000000000001','2033-01-03']],['saveClientVisibilitySettings',[{message:''},{revision:'0',showPercent:'20'}]],['loadBookingDay',['2033-01-03']],['searchBookingClients',['QA unmatched']],['loadBookingTimes',['book','00000000-0000-4000-8000-000000000001','2031-01-06']],['loadBookingTimes',['reschedule','00000000-0000-4000-8000-000000000001','2031-01-06']]]){
 test(`${name} ${args[0]} denies a signed-out action request`,{skip:!origin||!manifestPath},async()=>{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const entry=Object.entries(manifest.node??{}).find(([,value])=>value.exportedName===name);
  assert.ok(entry,`Compile the updated preview before testing ${name}`);
  const response=await fetch(new URL('/auth/sign-in',origin),{method:'POST',redirect:'manual',headers:{'Next-Action':entry[0],Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8',Origin:origin},body:JSON.stringify(args)});
  if(response.status===303){assert.match(response.headers.get('x-action-redirect')??response.headers.get('location')??'',/^\/auth\/sign-in(?:;|$)/);await response.arrayBuffer();}
  else{assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/application\/json/);assert.deepEqual(await response.json(),{});}
 });
}
