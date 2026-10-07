export const STORAGE_KEY = 'aesthenda.studio.v1';
export const TIME_ZONE = 'America/New_York';
export const HOLD_MS = 10 * 60 * 1000;
export type Service = { id: string; name: string; price: number; active: number; processing: number; finish: number; before: number; after: number; archived: boolean };
export type Client = { id: string; name: string; email: string; phone: string; notes: string };
export type Status = 'confirmed' | 'completed' | 'cancelled' | 'no-show';
export type Appointment = { id: string; clientId: string; service: Service; date: string; start: number; status: Status; notes: string; source: 'studio' | 'booking'; revision: number };
export type Hours = { enabled: boolean; start: number; end: number };
export type Block = { id: string; date: string; start: number; end: number; label: string };
export type Hold = { id: string; date: string; start: number; service: Service; expiresAt: number };
export type Audit = { id: string; at: string; action: string; appointmentId: string; actor: string; detail: string; policyRevision: number };
export type Studio = { version: 1; revision: number; services: Service[]; clients: Client[]; appointments: Appointment[]; hours: Hours[]; blocks: Block[]; holds: Hold[]; audit: Audit[]; policy: { processingOverlap: boolean; maxConcurrent: number; noticeMinutes: number; advanceDays: number; revision: number } };
export type Interval = { start: number; end: number };
export type Conflict = Interval & { appointmentId: string; clientId: string; revision: number };
export type Draft = { id?: string; clientId: string; service: Service; date: string; start: number; notes: string };

export function uid() { return crypto.randomUUID(); }
export function studioToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function studioMinute(now = new Date()) { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function dateLabel(date: string, long = false) { return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric' }); }
export function weekday(date: string) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
export function duration(s: Service) { return s.active + s.processing + s.finish; }
export function timeValue(n: number) { return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
export function toMinutes(s: string) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
export function timeLabel(n: number) { return `${Math.floor(n / 60) % 12 || 12}:${String(n % 60).padStart(2, '0')} ${n < 720 ? 'AM' : 'PM'}`; }
export function money(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n); }
export function isReserved(a: Appointment) { return a.status === 'confirmed' || a.status === 'completed'; }
export function intersects(a: Interval, b: Interval) { return a.start < b.end && b.start < a.end; }
export function range(a: { start: number; service: Service }): Interval { return { start: a.start - a.service.before, end: a.start + duration(a.service) + a.service.after }; }
export function occupied(a: { start: number; service: Service }, release: boolean): Interval[] {
  const s = a.service;
  if (!release || !s.processing) return [range(a)];
  return [{ start: a.start - s.before, end: a.start + s.active }, { start: a.start + s.active + s.processing, end: a.start + duration(s) + s.after }].filter(i => i.end > i.start);
}
export function conflicts(state: Studio, draft: Draft): Conflict[] {
  const intervals = occupied(draft, state.policy.processingOverlap);
  return state.appointments.filter(a => a.id !== draft.id && a.date === draft.date && isReserved(a)).flatMap(a => occupied(a, state.policy.processingOverlap).flatMap(other => intervals.filter(i => intersects(i, other)).map(i => ({ start: Math.max(i.start, other.start), end: Math.min(i.end, other.end), appointmentId: a.id, clientId: a.clientId, revision: a.revision }))));
}
export function validateService(s: Service) {
  if (!s.name.trim()) return 'Give the service a name.';
  if (!Number.isFinite(s.price) || s.price < 0 || s.price > 100000) return 'Enter a price between $0 and $100,000.';
  if (![s.active, s.processing, s.finish, s.before, s.after].every(n => Number.isInteger(n) && n >= 0 && n <= 720) || s.active < 5 || duration(s) > 720) return 'Use whole minutes, at least 5 minutes of active work, and a total duration of 12 hours or less.';
  return null;
}
export function checkBooking(state: Studio, draft: Draft, channel: 'studio' | 'booking', now = new Date(), ownHold?: string) {
  const errors: string[] = [];
  const sError = validateService(draft.service);
  if (sError) errors.push(sError);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(new Date(`${draft.date}T12:00:00Z`).getTime()) || !Number.isInteger(draft.start)) return { errors: ['Choose a valid date and time.'], conflicts: [] as Conflict[], token: '' };
  const span = range(draft);
  const hours = state.hours[weekday(draft.date)];
  if (span.start < 0 || span.end > 1440 || !hours?.enabled || span.start < hours.start || span.end > hours.end) errors.push('This appointment, including its buffers, must fit within your opening hours.');
  if (state.blocks.some(b => b.date === draft.date && intersects(span, b))) errors.push('This time overlaps a calendar block. Choose another time or remove the block in Availability.');
  const others = state.appointments.filter(a => a.id !== draft.id && a.date === draft.date && isReserved(a));
  if (draft.clientId && others.some(a => a.clientId === draft.clientId && intersects({ start: draft.start, end: draft.start + duration(draft.service) }, { start: a.start, end: a.start + duration(a.service) }))) errors.push('This client already has an appointment at this time.');
  const held = state.holds.filter(h => h.id !== ownHold && h.expiresAt > now.getTime() && h.date === draft.date);
  if (held.some(h => intersects(span, range(h)))) errors.push('Another booking preview is holding this time. Try another slot or wait for the hold to expire.');
  // Count concurrent clients across every boundary, rather than counting all
  // appointments that overlap any portion of the candidate.
  const concurrent = others.map(a => ({ start: a.start, end: a.start + duration(a.service) }));
  const actual = { start: draft.start, end: draft.start + duration(draft.service) };
  const points = [actual.start, ...concurrent.flatMap(i => [i.start, i.end]).filter(t => t >= actual.start && t < actual.end)];
  if (points.some(t => 1 + concurrent.filter(i => i.start <= t && i.end > t).length > state.policy.maxConcurrent)) errors.push(`This would exceed your limit of ${state.policy.maxConcurrent} concurrent clients.`);
  const overlaps = conflicts(state, draft);
  if (channel === 'booking') {
    if (overlaps.length) errors.push('This time is no longer available. Choose another slot.');
    const today = studioToday(now);
    const delta = (new Date(`${draft.date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000;
    if (delta < 0 || delta * 1440 + draft.start - studioMinute(now) < state.policy.noticeMinutes) errors.push('This time is too soon for your booking notice.');
    if (delta > state.policy.advanceDays) errors.push('This date is outside your advance booking window.');
    if (draft.service.archived) errors.push('This service is no longer available.');
  }
  // Any intervening store revision invalidates a professional approval.
  const token = JSON.stringify({ revision: state.revision, draft, overlaps, policy: state.policy });
  return { errors, conflicts: overlaps, token };
}
export function slots(state: Studio, service: Service, date: string, now = new Date()) {
  const hours = state.hours[weekday(date)];
  if (!hours?.enabled) return [];
  const result: number[] = [];
  for (let t = Math.ceil((hours.start + service.before) / 15) * 15; t + duration(service) + service.after <= hours.end; t += 15) {
    if (!checkBooking(state, { clientId: '', service, date, start: t, notes: '' }, 'booking', now).errors.length) result.push(t);
  }
  return result;
}
export function commitBooking(state: Studio, draft: Draft, options: { channel: 'studio' | 'booking'; approval?: string; holdId?: string; verified?: boolean }, now = new Date()): Studio {
  const existing = draft.id ? state.appointments.find(a => a.id === draft.id) : undefined;
  if (draft.id && (!existing || existing.status !== 'confirmed')) throw new Error('Only a confirmed appointment can be rescheduled.');
  if (!state.clients.some(c => c.id === draft.clientId)) throw new Error('Choose a client first.');
  if (options.channel === 'booking') {
    const hold = state.holds.find(h => h.id === options.holdId);
    if (!hold || hold.expiresAt <= now.getTime()) throw new Error('Your hold expired. Please choose a time again.');
    if (hold.date !== draft.date || hold.start !== draft.start || JSON.stringify(hold.service) !== JSON.stringify(draft.service)) throw new Error('Your selection changed. Please choose a time again.');
    if (!options.verified) throw new Error('Complete the preview verification step.');
  }
  const check = checkBooking(state, draft, options.channel, now, options.holdId);
  if (check.errors.length) throw new Error(check.errors[0]);
  if (check.conflicts.length && options.approval !== check.token) throw new Error('Review the current overlap warning and choose Book anyway to approve this exact appointment.');
  const id = draft.id || uid();
  const appointment: Appointment = { ...draft, id, service: { ...draft.service }, status: 'confirmed', revision: (existing?.revision || 0) + 1, source: existing?.source || options.channel };
  const detail = check.conflicts.length ? `Explicit Book anyway approval; request ${check.token}` : `${dateLabel(draft.date)} at ${timeLabel(draft.start)}`;
  return { ...state, revision: state.revision + 1, holds: state.holds.filter(h => h.id !== options.holdId && h.expiresAt > now.getTime()), appointments: [...state.appointments.filter(a => a.id !== id), appointment], audit: [...state.audit, { id: uid(), at: now.toISOString(), appointmentId: id, actor: options.channel === 'studio' ? 'Jamie · local owner preview' : 'Client · simulated verification', action: existing ? 'Rescheduled' : 'Booked', detail, policyRevision: state.policy.revision }] };
}
export function createHold(state: Studio, service: Service, date: string, start: number, now = new Date()): { state: Studio; hold: Hold } {
  const result = checkBooking(state, { service, date, start, clientId: '', notes: '' }, 'booking', now);
  if (result.errors.length) throw new Error(result.errors[0]);
  const hold: Hold = { id: uid(), service: { ...service }, date, start, expiresAt: now.getTime() + HOLD_MS };
  return { hold, state: { ...state, revision: state.revision + 1, holds: [...state.holds.filter(h => h.expiresAt > now.getTime()), hold] } };
}
export function freeMinutes(state: Studio, date: string) {
  const h = state.hours[weekday(date)];
  if (!h.enabled) return 0;
  const intervals = [...state.appointments.filter(a => a.date === date && isReserved(a)).flatMap(a => occupied(a, state.policy.processingOverlap)), ...state.blocks.filter(b => b.date === date)].map(i => ({ start: Math.max(i.start, h.start), end: Math.min(i.end, h.end) })).filter(i => i.end > i.start).sort((a, b) => a.start - b.start);
  let end = h.start, used = 0;
  for (const i of intervals) { used += Math.max(0, i.end - Math.max(end, i.start)); end = Math.max(end, i.end); }
  return h.end - h.start - used;
}
export function seedStudio(date = studioToday()): Studio {
  const services: Service[] = [
    { id: 'haircut', name: 'Signature haircut', price: 65, active: 45, processing: 0, finish: 0, before: 0, after: 0, archived: false },
    { id: 'color', name: 'Color & cut', price: 145, active: 15, processing: 30, finish: 45, before: 0, after: 0, archived: false },
    { id: 'finish', name: 'Express finish', price: 35, active: 30, processing: 0, finish: 0, before: 0, after: 0, archived: false },
  ];
  return { version: 1, revision: 0, services, clients: [
    { id: 'nina', name: 'Nina Brooks', email: 'nina@example.test', phone: '', notes: 'Prefers a quiet appointment.' },
    { id: 'maya', name: 'Maya Chen', email: 'maya@example.test', phone: '', notes: 'Loves a natural, lived-in color.' },
    { id: 'alex', name: 'Alex Morgan', email: 'alex@example.test', phone: '', notes: '' },
  ], appointments: [ ['nina', services[0], 540], ['maya', services[1], 600], ['alex', services[2], 720] ].map(([clientId, service, start], i) => ({ id: `sample-${i}`, clientId: clientId as string, service: service as Service, start: start as number, date, status: 'confirmed', revision: 1, notes: '', source: 'studio' })), hours: Array.from({ length: 7 }, (_, day) => ({ enabled: day !== 0, start: 540, end: 1020 })), blocks: [], holds: [], audit: [], policy: { processingOverlap: false, maxConcurrent: 2, noticeMinutes: 60, advanceDays: 60, revision: 1 } };
}

export function parseStudio(raw: string): Studio {
  const s = JSON.parse(raw) as Studio;
  if (!s || s.version !== 1 || !Number.isInteger(s.revision) || !Array.isArray(s.services) || !Array.isArray(s.clients) || !Array.isArray(s.appointments) || !Array.isArray(s.hours) || s.hours.length !== 7 || !Array.isArray(s.blocks) || !Array.isArray(s.holds) || !Array.isArray(s.audit) || !s.policy) throw new Error('Saved studio data could not be read. Your existing data has not been replaced.');
  if (s.services.some(service => validateService(service)) || s.hours.some(h => typeof h.enabled !== 'boolean' || !Number.isInteger(h.start) || !Number.isInteger(h.end) || h.start < 0 || h.end > 1440 || h.start >= h.end) || s.appointments.some(a => !a.service || validateService(a.service) || !s.clients.some(c => c.id === a.clientId))) throw new Error('Saved studio data needs recovery. Your existing data has not been replaced.');
  return s;
}
