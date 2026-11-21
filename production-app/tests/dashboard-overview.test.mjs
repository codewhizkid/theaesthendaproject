import test from 'node:test';import assert from 'node:assert/strict';
import {dashboardOverview} from '../lib/dashboard/overview.ts';
const appointment=(id,status,startAt='2030-01-01T15:00Z',endAt='2030-01-01T16:00Z',currency='USD')=>({id,status,startAt,endAt,currency,priceCents:3500,clientName:id,serviceName:'Service',timezone:'America/New_York',revision:1,source:'professional_v1'});
const schedule=appointments=>({asOf:'2030-01-01T15:30Z',date:'2030-01-01',timezone:'America/New_York',appointments});
test('dashboard selects active visits chronologically, excluding completed, no-show and cancellation from up next',()=>{
 const overview=dashboardOverview(schedule([appointment('later','confirmed','2030-01-01T18:00Z','2030-01-01T19:00Z'),appointment('done','completed'),appointment('missed','no_show'),appointment('cancelled','cancelled'),appointment('current','pending')]));
 assert.equal(overview.next.id,'current');assert.equal(overview.inProgress,true);assert.equal(overview.visits.length,4);assert.equal(overview.remaining.length,2);assert.equal(overview.completed,1);assert.equal(overview.pending.length,1);assert.equal(overview.serviceValue,'$105');
});
test('scheduled value keeps currencies separate and never counts no-show or cancelled prices',()=>{
 const overview=dashboardOverview(schedule([appointment('usd','confirmed'),appointment('eur','pending',undefined,undefined,'EUR'),appointment('cancelled','cancelled'),appointment('no-show','no_show')]));assert.equal(overview.serviceValue,'€35 + $35');
});
test('empty and finished days have no next visit or invented service total',()=>{
 const empty=dashboardOverview(schedule([]));assert.equal(empty.next,undefined);assert.equal(empty.serviceValue,'—');assert.equal(empty.pending.length,0);
 const finished=dashboardOverview(schedule([appointment('ended','confirmed','2030-01-01T13:00Z','2030-01-01T14:00Z')]));assert.equal(finished.next,undefined);assert.equal(finished.inProgress,false);
});
