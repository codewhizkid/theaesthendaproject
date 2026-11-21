import test from 'node:test';import assert from 'node:assert/strict';import {displayTime,fromTimeParts,timeParts} from '../lib/availability/time-display.ts';
test('12-hour time keeps noon and midnight distinct, including end-of-day boundaries',()=>{
 assert.equal(displayTime(540),'9:00 AM');assert.equal(displayTime(1020),'5:00 PM');assert.equal(displayTime(720),'12:00 PM');assert.equal(displayTime(0),'12:00 AM');assert.equal(displayTime(1440),'12:00 AM (midnight)');
 assert.equal(fromTimeParts(12,0,'AM'),0);assert.equal(fromTimeParts(12,0,'AM',true),1440);assert.equal(fromTimeParts(12,0,'PM',true),720);
 for(let value=0;value<1440;value++){const p=timeParts(value);assert.equal(fromTimeParts(p.hour,p.minute,p.period),value);}
});
