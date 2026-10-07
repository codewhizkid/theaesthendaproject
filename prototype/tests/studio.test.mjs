import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBooking, commitBooking, createHold, freeMinutes, HOLD_MS, parseStudio, seedStudio, slots } from '../lib/studio.ts';

const date = '2026-09-29';
const now = new Date('2026-09-29T12:00:00Z');
const studio = () => seedStudio(date);
const draft = (state, start = 780) => ({ clientId: 'nina', service: state.services[0], date, start, notes: '' });

test('bookings preserve service snapshots and survive serialization', () => {
  const state = studio();
  const booked = commitBooking(state, draft(state), { channel: 'studio' }, now);
  state.services[0].price = 99;
  assert.equal(booked.appointments.at(-1).service.price, 65);
  assert.equal(parseStudio(JSON.stringify(booked)).appointments.length, 4);
  assert.equal(booked.audit.at(-1).action, 'Booked');
});

test('manual hands-on overlap requires approval for the current revision', () => {
  const state = studio();
  const candidate = { ...draft(state, 555), clientId: 'alex' };
  const check = checkBooking(state, candidate, 'studio', now);
  assert.equal(check.conflicts.length, 1);
  assert.throws(() => commitBooking(state, candidate, { channel: 'studio' }, now), /Book anyway/);
  const booked = commitBooking(state, candidate, { channel: 'studio', approval: check.token }, now);
  assert.match(booked.audit.at(-1).detail, /Explicit Book anyway approval/);
  assert.throws(() => commitBooking({ ...state, revision: 1 }, candidate, { channel: 'studio', approval: check.token }, now), /Book anyway/);
});

test('public bookings cannot override hands-on conflicts', () => {
  const state = studio();
  assert.throws(() => createHold(state, state.services[0], date, 555, now), /no longer available/);
  assert.ok(!slots(state, state.services[0], date, now).includes(555));
});

test('processing time can be released without shortening the booked service', () => {
  const state = studio();
  const candidate = { ...draft(state, 615), service: state.services[2] };
  assert.equal(checkBooking(state, candidate, 'booking', now).conflicts.length, 1);
  state.policy.processingOverlap = true;
  assert.deepEqual(checkBooking(state, candidate, 'booking', now).errors, []);
  assert.equal(state.appointments[1].service.processing, 30);
  state.policy.maxConcurrent = 1;
  assert.match(checkBooking(state, candidate, 'booking', now).errors.join(' '), /concurrent/);
});

test('holds reserve time and require verification before consumption', () => {
  const state = studio();
  const held = createHold(state, state.services[0], date, 780, now);
  assert.throws(() => createHold(held.state, state.services[0], date, 780, now), /holding/);
  assert.throws(() => commitBooking(held.state, draft(state), { channel: 'booking', holdId: held.hold.id }, now), /verification/);
  const booked = commitBooking(held.state, draft(state), { channel: 'booking', holdId: held.hold.id, verified: true }, now);
  assert.equal(booked.holds.length, 0);
  assert.equal(booked.appointments.at(-1).source, 'booking');
});

test('expired holds cannot book and release the slot', () => {
  const state = studio();
  const held = createHold(state, state.services[0], date, 780, now);
  const later = new Date(now.getTime() + HOLD_MS);
  assert.throws(() => commitBooking(held.state, draft(state), { channel: 'booking', holdId: held.hold.id, verified: true }, later), /expired/);
  assert.ok(slots(held.state, state.services[0], date, later).includes(780));
});

test('calendar blocks and buffers are hard booking boundaries', () => {
  const state = studio();
  state.blocks.push({ id: 'lunch', date, start: 780, end: 840, label: 'Lunch' });
  assert.match(checkBooking(state, draft(state), 'studio', now).errors.join(' '), /calendar block/);
  const candidate = { ...draft(state, 540), service: { ...state.services[0], before: 15 } };
  assert.match(checkBooking(state, candidate, 'studio', now).errors.join(' '), /opening hours/);
});

test('a client cannot occupy overlapping appointments even with manual approval', () => {
  const state = studio();
  assert.match(checkBooking(state, draft(state, 555), 'studio', now).errors.join(' '), /client already/);
});

test('cancellation releases time and cancelled appointments cannot be rescheduled', () => {
  const state = studio();
  const before = freeMinutes(state, date);
  state.appointments[0].status = 'cancelled';
  assert.equal(freeMinutes(state, date), before + 45);
  assert.throws(() => commitBooking(state, { ...draft(state), id: 'sample-0' }, { channel: 'studio' }, now), /confirmed appointment/);
});
