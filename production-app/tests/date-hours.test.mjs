import test from 'node:test';import assert from 'node:assert/strict';import {parseDateHours} from '../lib/availability/date-input.ts';
const form=(extra={})=>{const f=new FormData();for(const[k,v]of Object.entries({actionVersion:'1',requestKey:crypto.randomUUID(),date:'2027-01-04',revision:'0',weeklyRevision:'1',mode:'closed',windows:'[]',...extra}))f.set(k,v);return f;};
test('closed and custom date hours ignore forged account fields and normalize periods',()=>{
 assert.equal(parseDateHours(form({actorId:'foreign'})).actorId,undefined);assert.equal(parseDateHours(form()).mode,'closed');const x=parseDateHours(form({mode:'custom',windows:JSON.stringify([{startMinute:600,endMinute:720},{startMinute:0,endMinute:300}])}));assert.equal(x.windows[0].startMinute,0);
});
test('invalid dates, zero custom periods and overlaps are rejected',()=>{
 for(const extra of [{date:'2027-02-30'},{date:'2027-13-01'},{date:'bad'},{mode:'custom'},{mode:'forged'},{mode:'closed',windows:'[{}]'},{mode:'custom',windows:'[{"startMinute":600,"endMinute":720},{"startMinute":650,"endMinute":800}]'}])assert.throws(()=>parseDateHours(form(extra)));
});
