import test from 'node:test';import assert from 'node:assert/strict';
import {parseAvailability} from '../lib/availability/input.ts';
const form=(overrides={})=>{const f=new FormData();for(const [k,v]of Object.entries({actionVersion:'1',requestKey:crypto.randomUUID(),revision:'0',timezone:'America/New_York',windows:JSON.stringify([{day:1,startMinute:540,endMinute:720},{day:1,startMinute:780,endMinute:1020}]),...overrides}))f.set(k,v);return f;};
test('weekly hours normalize ordering, keep wall clock minutes and discard identity hints',()=>{
 const result=parseAvailability(form({businessId:'foreign',professionalId:'foreign',actorId:'foreign'}));assert.equal(result.businessId,undefined);assert.equal(result.timezone,'America/New_York');assert.equal(result.windows[0].startMinute,540);
 const midnight=parseAvailability(form({windows:JSON.stringify([{day:6,startMinute:1320,endMinute:1440},{day:0,startMinute:0,endMinute:120}])}));assert.equal(midnight.windows[0].day,0);assert.equal(midnight.windows[1].endMinute,1440);
 assert.deepEqual(parseAvailability(form({windows:'[]'})).windows,[]);
});
test('invalid zones, overnight ranges, overlaps, non-integers and stale input shapes are rejected',()=>{
 for(const bad of [{timezone:'EST'},{timezone:'Etc/Fake'},{revision:'-1'},{requestKey:'forged'},{windows:'{}'},{windows:'null'},{windows:JSON.stringify([{day:1,startMinute:1320,endMinute:120}])},{windows:JSON.stringify([{day:7,startMinute:540,endMinute:600}])},{windows:JSON.stringify([{day:1,startMinute:540.5,endMinute:600}])},{windows:JSON.stringify([{day:1,startMinute:540,endMinute:540}])},{windows:JSON.stringify([{day:1,startMinute:540,endMinute:720},{day:1,startMinute:600,endMinute:780}])}])assert.throws(()=>parseAvailability(form(bad)));
});
