'use client';

import { useState, type FormEvent } from 'react';
import type { MutateStudio } from '@/hooks/use-studio';
import { checkBooking, commitBooking, conflicts, dateLabel, duration, timeLabel, timeValue, toMinutes, uid, validateService, type Appointment, type Client, type Draft, type Service, type Status, type Studio } from '@/lib/studio';
import { AppointmentSummary, ConflictStripe, ErrorMessage, Field, message, Modal } from './shared';

type EditorProps = { studio: Studio; mutate: MutateStudio; onClose: () => void; onSaved: (text: string) => void };

export function AppointmentEditor({ studio, mutate, onClose, onSaved, appointment, date }: EditorProps & { appointment?: Appointment; date: string }) {
  const [draft, setDraft] = useState<Draft>(() => appointment ? { id: appointment.id, clientId: appointment.clientId, service: { ...appointment.service }, date: appointment.date, start: appointment.start, notes: appointment.notes } : { clientId: '', service: studio.services.find(s => !s.archived) || studio.services[0], date, start: 540, notes: '' });
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const check = checkBooking(studio, draft, 'studio');
  const set = (part: Partial<Draft>) => { setDraft(d => ({ ...d, ...part })); setWarning(''); setError(''); };
  function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.clientId) { setError('Choose a client first.'); return; }
    if (check.errors.length) { setError(check.errors[0]); return; }
    if (check.conflicts.length) { setWarning(check.token); return; }
    commit();
  }
  function commit(approval?: string) {
    try {
      mutate(current => {
        if (appointment && current.appointments.find(a => a.id === appointment.id)?.revision !== appointment.revision) throw new Error('This appointment changed in another tab. Close and reopen it before editing.');
        return commitBooking(current, draft, { channel: 'studio', approval });
      });
      onSaved(appointment ? 'Appointment updated.' : 'Appointment booked.'); onClose();
    } catch (e) { setError(message(e)); setWarning(''); }
  }
  const serviceOptions = studio.services.filter(s => !s.archived);
  return <Modal title={appointment ? 'Edit appointment' : 'A little time, reserved.'} description="All appointment times are in Eastern time." onClose={onClose} wide>
    <form onSubmit={save} className="studio-form">
      <div className="form-grid"><Field label="Client"><select required value={draft.clientId} onChange={e => set({ clientId: e.target.value })}><option value="">Choose a client</option>{studio.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Service"><select value={draft.service.id} onChange={e => { const service = studio.services.find(s => s.id === e.target.value); if (service) set({ service: { ...service } }); }}>{!serviceOptions.some(s => s.id === draft.service.id) && <option value={draft.service.id}>{draft.service.name} (booked service)</option>}{serviceOptions.map(s => <option value={s.id} key={s.id}>{s.name} · {duration(s)} min</option>)}</select></Field>
        <Field label="Appointment date"><input type="date" required value={draft.date} onChange={e => set({ date: e.target.value })}/></Field><Field label="Start time"><input type="time" step="300" required value={timeValue(draft.start)} onChange={e => set({ start: toMinutes(e.target.value) })}/></Field></div>
      <Field label="Appointment notes"><textarea value={draft.notes} maxLength={2000} onChange={e => set({ notes: e.target.value })} placeholder="Anything to remember for this visit?"/></Field>
      <p className="form-hint">{duration(draft.service)} minutes · Ends at {timeLabel(draft.start + duration(draft.service))}{draft.service.before + draft.service.after > 0 && ` · ${draft.service.before} min before / ${draft.service.after} min after`}</p>
      {check.conflicts.length > 0 && <div className="conflict-preview"><p className="field-label">Placement preview</p><div className="preview-bars">{[ { ...draft, id: draft.id || 'draft', revision: 1, status: 'confirmed' as const, source: 'studio' as const }, ...studio.appointments.filter(a => check.conflicts.some(c => c.appointmentId === a.id)) ].map(a => <div key={a.id}><ConflictStripe studio={{ ...studio, appointments: [...studio.appointments.filter(x => x.id !== draft.id), { ...draft, id: draft.id || 'draft', revision: 1, status: 'confirmed', source: 'studio' }] }} appointment={a}/><span>{a.id === (draft.id || 'draft') ? 'This appointment' : studio.clients.find(c => c.id === a.clientId)?.name}<small>{timeLabel(a.start)}–{timeLabel(a.start + duration(a.service))}</small></span></div>)}</div></div>}
      {warning && <div className="warning-box" role="alert"><h3>These appointments need you at the same time.</h3>{check.conflicts.map((c, i) => <p key={i}>{studio.clients.find(x => x.id === c.clientId)?.name}: {timeLabel(c.start)}–{timeLabel(c.end)} ({c.end - c.start} minutes).</p>)}<p>The full service durations stay unchanged. Approve only if you can manage this overlap.</p><div className="button-row"><button type="button" className="secondary" onClick={() => setWarning('')}>Go back</button><button type="button" className="primary" onClick={() => commit(warning)}>Book anyway</button></div></div>}
      <ErrorMessage error={error}/>
      {!warning && <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">{check.conflicts.length ? 'Review overlap' : appointment ? 'Save changes' : 'Book appointment'}</button></div>}
    </form>
  </Modal>;
}

export function AppointmentDetail({ studio, mutate, onClose, onSaved, appointment, onEdit }: EditorProps & { appointment: Appointment; onEdit: () => void }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Status | null>(null);
  const a = studio.appointments.find(x => x.id === appointment.id) || appointment;
  const client = studio.clients.find(c => c.id === a.clientId);
  const overlaps = conflicts(studio, a);
  function update(status: Status) {
    try {
      mutate(current => {
        const target = current.appointments.find(x => x.id === a.id);
        if (!target || target.revision !== a.revision || target.status !== 'confirmed') throw new Error('This appointment has changed. Close and reopen it to continue.');
        return { ...current, appointments: current.appointments.map(x => x.id === a.id ? { ...x, status, revision: x.revision + 1 } : x), audit: [...current.audit, { id: uid(), at: new Date().toISOString(), appointmentId: a.id, actor: 'Jamie · local owner preview', action: status, detail: `Changed from confirmed to ${status}. No client message was sent.`, policyRevision: current.policy.revision }] };
      });
      onSaved(`Appointment ${status === 'no-show' ? 'marked as no-show' : status}.`); setPending(null);
    } catch (e) { setError(message(e)); }
  }
  return <Modal title={client?.name || 'Appointment'} description="Appointment details and history" onClose={onClose} wide>
    <AppointmentSummary appointment={a}/><span className={`status-tag ${a.status}`}>{a.status}</span>
    <div className="detail-grid"><div><span className="field-label">Client contact</span><p>{client?.email || 'No email saved'}</p><p>{client?.phone || 'No phone saved'}</p></div><div><span className="field-label">Service timing</span><p>{a.service.active} min active{a.service.processing > 0 && ` · ${a.service.processing} min processing`}{a.service.finish > 0 && ` · ${a.service.finish} min finishing`}</p></div></div>
    {a.notes && <div><span className="field-label">Appointment notes</span><p className="preserve-lines">{a.notes}</p></div>}
    {overlaps.length > 0 && a.status === 'confirmed' && <div className="warning-box"><h3>Overlap details</h3>{overlaps.map((c, i) => <p key={i}>{c.end - c.start} minutes with {studio.clients.find(x => x.id === c.clientId)?.name}, {timeLabel(c.start)}–{timeLabel(c.end)}.</p>)}</div>}
    <details className="history"><summary>Appointment history</summary>{studio.audit.filter(x => x.appointmentId === a.id).length ? studio.audit.filter(x => x.appointmentId === a.id).map(x => <div key={x.id}><strong>{x.action}</strong><p>{new Date(x.at).toLocaleString('en-US', { timeZone: 'America/New_York' })} Eastern · {x.actor}</p><p>{x.detail.startsWith('Explicit') ? 'Explicit Book anyway approval recorded for the exact request and affected appointment revisions.' : x.detail}</p><small>Policy version {x.policyRevision}</small></div>) : <p>Seeded sample appointment · {dateLabel(a.date)}.</p>}</details>
    <ErrorMessage error={error}/>
    {pending ? <div className="warning-box"><h3>{pending === 'cancelled' ? 'Cancel this appointment?' : 'Mark this appointment as a no-show?'}</h3><p>{pending === 'cancelled' ? 'The time will become available again. The appointment stays in your history.' : 'This records a missed visit. No charge or client restriction will be applied.'} No message will be sent.</p><div className="button-row"><button className="secondary" onClick={() => setPending(null)}>Keep appointment</button><button className="primary" onClick={() => update(pending)}>Confirm {pending === 'cancelled' ? 'cancellation' : 'no-show'}</button></div></div> : a.status === 'confirmed' && <div className="detail-actions"><button className="primary" onClick={onEdit}>Edit / reschedule</button><button className="secondary" onClick={() => update('completed')}>Mark completed</button><button className="text-button" onClick={() => setPending('no-show')}>No-show</button><button className="text-button danger" onClick={() => setPending('cancelled')}>Cancel appointment</button></div>}
  </Modal>;
}

export function ClientEditor({ mutate, onClose, onSaved, client }: Omit<EditorProps, 'studio'> & { client?: Client }) {
  const [value, setValue] = useState<Client>(client ? { ...client } : { id: uid(), name: '', email: '', phone: '', notes: '' });
  const [error, setError] = useState('');
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      const next = { ...value, name: value.name.trim(), email: value.email.trim().toLowerCase(), phone: value.phone.trim(), notes: value.notes.trim() };
      if (!next.name) throw new Error('Enter the client’s name.');
      mutate(current => {
        if (next.email && current.clients.some(c => c.id !== next.id && c.email.toLowerCase() === next.email)) throw new Error('A client with this email already exists. Edit their profile instead.');
        return { ...current, clients: [...current.clients.filter(c => c.id !== next.id), next] };
      });
      onSaved(client ? 'Client updated.' : 'Client added.'); onClose();
    } catch (e) { setError(message(e)); }
  }
  return <Modal title={client ? 'Edit client' : 'A new face in your studio.'} description="Contact details and private notes" onClose={onClose}><form onSubmit={save} className="studio-form"><Field label="Full name"><input required autoComplete="name" maxLength={100} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })}/></Field><Field label="Email"><input type="email" autoComplete="email" maxLength={200} value={value.email} onChange={e => setValue({ ...value, email: e.target.value })}/></Field><Field label="Phone"><input type="tel" autoComplete="tel" maxLength={40} value={value.phone} onChange={e => setValue({ ...value, phone: e.target.value })}/></Field><Field label="Private notes"><textarea maxLength={2000} value={value.notes} onChange={e => setValue({ ...value, notes: e.target.value })}/></Field><ErrorMessage error={error}/><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save client</button></div></form></Modal>;
}

export function ServiceEditor({ mutate, onClose, onSaved, service }: Omit<EditorProps, 'studio'> & { service?: Service }) {
  const [value, setValue] = useState<Service>(service ? { ...service } : { id: uid(), name: '', price: 0, active: 30, processing: 0, finish: 0, before: 0, after: 0, archived: false });
  const [error, setError] = useState('');
  function save(e: FormEvent) {
    e.preventDefault();
    const validation = validateService(value);
    if (validation) { setError(validation); return; }
    try { mutate(current => ({ ...current, services: [...current.services.filter(s => s.id !== value.id), { ...value, name: value.name.trim() }] })); onSaved('Service saved. Existing appointments keep their booked details.'); onClose(); }
    catch (e) { setError(message(e)); }
  }
  return <Modal title={service ? 'Edit service' : 'Make room for something new.'} description="Service changes apply to new bookings. Existing appointments keep their original price and timing." onClose={onClose} wide><form onSubmit={save} className="studio-form"><Field label="Service name"><input required maxLength={100} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })}/></Field><div className="form-grid"><Field label="Price ($)"><input type="number" required min="0" max="100000" step="0.01" value={value.price} onChange={e => setValue({ ...value, price: Number(e.target.value) })}/></Field><Field label="Active work (minutes)"><input type="number" required min="5" max="720" value={value.active} onChange={e => setValue({ ...value, active: Number(e.target.value) })}/></Field><Field label="Processing (minutes)" help="Time when you may be released, if enabled in Availability."><input type="number" required min="0" max="720" value={value.processing} onChange={e => setValue({ ...value, processing: Number(e.target.value) })}/></Field><Field label="Finishing work (minutes)"><input type="number" required min="0" max="720" value={value.finish} onChange={e => setValue({ ...value, finish: Number(e.target.value) })}/></Field><Field label="Buffer before (minutes)"><input type="number" required min="0" max="120" value={value.before} onChange={e => setValue({ ...value, before: Number(e.target.value) })}/></Field><Field label="Buffer after (minutes)"><input type="number" required min="0" max="120" value={value.after} onChange={e => setValue({ ...value, after: Number(e.target.value) })}/></Field></div><p className="form-hint">{duration(value)} minutes with the client · {duration(value) + value.before + value.after} minutes including buffers</p><ErrorMessage error={error}/><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save service</button></div></form></Modal>;
}
