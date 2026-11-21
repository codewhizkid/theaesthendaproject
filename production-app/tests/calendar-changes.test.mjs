import test from 'node:test';import assert from 'node:assert/strict';
import {gestureTime,parseCalendarChange,changeForm} from '../lib/calendar/changes.ts';
test('calendar gestures snap only the presentation and clamp moves/extensions to the day',()=>{assert.deepEqual(gestureTime(600,45,17,'move'),{minute:615,duration:45});assert.deepEqual(gestureTime(600,45,-20,'extend'),{minute:600,duration:45});assert.deepEqual(gestureTime(600,45,15,'extend'),{minute:600,duration:60});assert.deepEqual(gestureTime(1380,45,90,'move'),{minute:1395,duration:45});assert.deepEqual(gestureTime(1380,45,90,'extend'),{minute:1380,duration:60});});
test('calendar changes require valid scope-free values and ignore forged account/price/confirmation hints',()=>{const form=changeForm({id:crypto.randomUUID(),revision:2,mode:'extend',date:'2031-01-06',minute:600,duration:75});form.set('actorId','forged');form.set('priceCents','1');const value=parseCalendarChange(form);assert.equal(value.duration,75);assert.equal(value.actorId,undefined);for(const [key,v]of [['revision','0'],['minute','1440'],['duration','0'],['date','2031-02-30'],['mode','override']]){const f=changeForm(value);f.set(key,v);assert.throws(()=>parseCalendarChange(f));}});

test('quarter-hour moves preserve existing non-quarter service lengths',()=>{assert.deepEqual(gestureTime(600,35,16,'move'),{minute:615,duration:35});assert.deepEqual(gestureTime(605,35,7,'move'),{minute:615,duration:35});assert.deepEqual(gestureTime(600,35,16,'extend'),{minute:600,duration:50});});
test('extension step selection is optional, bounded, and retained in the submitted review',()=>{
 const form=new FormData();for(const [k,v]of Object.entries({actionVersion:'1',id:crypto.randomUUID(),revision:'1',mode:'extend',date:'2033-01-03',minute:'600',duration:'105',step:'1'}))form.set(k,v);
 assert.equal(parseCalendarChange(form).step,1);
 for(const invalid of ['-1','1.5','20','no']){form.set('step',invalid);assert.throws(()=>parseCalendarChange(form));}
 form.delete('step');assert.equal(parseCalendarChange(form).step,undefined);
});
