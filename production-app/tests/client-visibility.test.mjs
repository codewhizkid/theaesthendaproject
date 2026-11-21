import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleClientSlots} from '../lib/appointments/client-visibility.ts';
const slot=minute=>({minute,startAt:new Date(Date.UTC(2033,0,3,0,minute)).toISOString()});
test('client visibility only narrows canonical slots and uses local half-hour starts',()=>{
 const slots=Array.from({length:301},(_,index)=>slot(540+index));
 const result=visibleClientSlots(slots,100);
 assert.equal(result.length,11);assert.ok(result.every(value=>slots.includes(value)&&value.minute%30===0));
 assert.deepEqual(visibleClientSlots([slot(541),slot(559)],100),[]);
});
test('percentages select exact rounded-up counts distributed across the day',()=>{
 const slots=Array.from({length:10},(_,index)=>slot(540+30*index));
 for(const [percent,count] of [[20,2],[50,5],[80,8],[100,10]]){
  const result=visibleClientSlots(slots,percent);assert.equal(result.length,count);assert.equal(new Set(result.map(value=>value.startAt)).size,count);
  assert.deepEqual(result,visibleClientSlots(slots,percent));assert.deepEqual(result,visibleClientSlots([...slots].reverse(),percent));
  assert.ok(result.some(value=>value.minute<690));assert.ok(result.some(value=>value.minute>=690));
 }
});
test('empty and small lists, duplicate instants, invalid percentages and source immutability',()=>{
 assert.deepEqual(visibleClientSlots([],20),[]);
 assert.equal(visibleClientSlots([slot(540)],20).length,1);
 assert.equal(visibleClientSlots([slot(540),slot(570)],20).length,1);
 const input=[slot(570),slot(540),slot(540)];const before=structuredClone(input);
 assert.equal(visibleClientSlots(input,100).length,2);assert.deepEqual(input,before);
 for(const percent of [0,30,101,NaN])assert.throws(()=>visibleClientSlots(input,percent));
});
