import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin=process.env.TEST_APP_URL??'http://127.0.0.1:3191';
for(const path of ['/guest','/guest/verify','/client/booking'])test(`${path} keeps guest contact and verification pages private`,async()=>{
 const response=await fetch(new URL(path,origin),{headers:{Cookie:'ae-guest-booking=forged'}});
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const html=await response.text();
 assert.doesNotMatch(html,/encryptedToken|tokenHash|RESEND_API_KEY|PRIVATE NOTE/);
 assert.equal(response.headers.get('set-cookie'),null);
});
test('opening a verification link never verifies or books on GET',async()=>{
 const response=await fetch(new URL('/guest/verify?token=invalid',origin));
 assert.equal(response.status,200);
 assert.match(await response.text(),/Verify and review my appointment/);
 assert.equal(response.headers.get('set-cookie'),null);
});
for(const name of ['startGuestBooking','saveGuestTerms','confirmAccountBooking'])test(`${name} requires owner authentication`,{skip:!process.env.TEST_SERVER_ACTION_MANIFEST},async()=>{
 const manifest=JSON.parse(await readFile(process.env.TEST_SERVER_ACTION_MANIFEST,'utf8'));
 const entry=Object.entries(manifest.node??{}).find(([,value])=>value.exportedName===name);assert.ok(entry);
 const response=await fetch(new URL('/guest',origin),{method:'POST',redirect:'manual',headers:{'Next-Action':entry[0],Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8',Origin:origin},body:JSON.stringify([{message:''},{}])});
 if(response.status===303||response.headers.has('x-action-redirect'))assert.match(response.headers.get('x-action-redirect')??response.headers.get('location')??'',name==='confirmAccountBooking'?/^\/client\/sign-in(?:;|$)/:/^\/auth\/sign-in(?:;|$)/);
 else {assert.equal(response.status,200);assert.deepEqual(await response.json(),{});}
});

test('account checkout stays disabled without its explicit readiness flag',async()=>{const r=await fetch(new URL('/client/booking',origin));assert.equal(r.status,200);assert.match(await r.text(),/Account checkout is being prepared/);assert.equal(r.headers.get('set-cookie'),null);});
