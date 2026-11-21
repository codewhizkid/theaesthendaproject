import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
function load(file,dependencies){const exports={};new Function('require','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{if(!(name in dependencies))throw Error('Unexpected import '+name);return dependencies[name]},exports);return exports;}
test('calendar save dispatches only after commit and retains success when sender is unavailable',async()=>{
 for(const saveFails of [true,false]){const calls=[];const actions=load('app/appointments/actions.ts',{
 '@/lib/appointments/confirmation':{dispatchOwnerBookingConfirmation:async(...args)=>calls.push(['dispatch',...args])},
 '@/lib/calendar/navigation':{calendarActionContext:()=>null},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:path=>{throw Error('REDIRECT '+path)}},
 '@/lib/supabase/require-user':{requireUser:async()=>({id:'verified-owner'})},'@/lib/appointments/input':{parseAppointment:()=>({requestKey:'key'}),uuid:()=>true},
 '@/lib/appointments/persistence':{createAppointment:async()=>{calls.push(['save']);if(saveFails)throw Error('SLOT_UNAVAILABLE');return 'saved-id';}}
 });
 if(saveFails){assert.match((await actions.bookAppointment({message:''},new FormData())).message,/no longer available/);assert.deepEqual(calls,[['save']]);}
 else{await assert.rejects(actions.bookAppointment({message:''},new FormData()),/REDIRECT \/appointments\/saved-id/);assert.deepEqual(calls,[['save'],['dispatch','verified-owner','saved-id']]);}
 }
});
test('owner dispatcher has no guest-cookie dependency, records provider outcomes and swallows failures',async()=>{
 const prior=process.env.AESTHENDA_APPOINTMENT_EMAIL_READY;process.env.AESTHENDA_APPOINTMENT_EMAIL_READY='1';
 try{for(const mode of ['accepted','pending','failed','throw','already-sent']){const calls=[];const dispatcher=load('lib/appointments/confirmation.ts',{
 'server-only':{},'@/lib/business/persistence':{checkedRuntime:async()=>({release(){},query:async(_sql,args)=>{calls.push(args);return {rows:[{result:args[2]==='claim'?{state:mode==='already-sent'?'accepted':'claimed',id:'same-message',lease:'lease',email:'qa@example.invalid',payload:{}}:{state:args[3]}}]};}})},
 '@/lib/guest-booking/resend-transport':{guestMailConfig:()=>({apiKey:'synthetic'})},'@/lib/guest-booking/confirmation-transport':{sendBookingConfirmation:async()=>{if(mode==='throw')throw Error('network');return {status:mode,messageId:'provider-id'};}}
 });await dispatcher.dispatchOwnerBookingConfirmation('verified-owner','appointment');assert.equal(calls[0][0],'verified-owner');assert.equal(calls[0][1],'appointment');assert.equal(calls.length,['throw','already-sent'].includes(mode)?1:2);if(calls.length===2){const result=JSON.parse(calls[1][3]);assert.equal(result.lease,'lease');assert.equal(result.state,mode);}}
 }finally{if(prior===undefined)delete process.env.AESTHENDA_APPOINTMENT_EMAIL_READY;else process.env.AESTHENDA_APPOINTMENT_EMAIL_READY=prior;}
});
