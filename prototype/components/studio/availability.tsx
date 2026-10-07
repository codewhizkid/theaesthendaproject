'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { MutateStudio } from '@/hooks/use-studio';
import { dateLabel, isReserved, range, intersects, studioToday, timeLabel, timeValue, toMinutes, uid, weekday, type Studio } from '@/lib/studio';
import { Empty, ErrorMessage, Field, message, Modal } from './shared';

export function Availability({ studio, mutate, notify }: { studio: Studio; mutate: MutateStudio; notify: (text: string) => void }) {
  const [hours, setHours] = useState(studio.hours.map(h => ({ ...h })));
  const [policy, setPolicy] = useState({ ...studio.policy });
  const [error, setError] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);
  const [removeId, setRemoveId] = useState('');
  const [baseRevision, setBaseRevision] = useState(studio.policy.revision);
  const [block, setBlock] = useState({ date: studioToday(), start: 720, end: 780, label: '' });
  const [blockError, setBlockError] = useState('');
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (hours.some(h => h.enabled && (!Number.isFinite(h.start) || !Number.isFinite(h.end) || h.start >= h.end))) throw new Error('Each open day needs a closing time after its opening time.');
      mutate(current => {
        if (current.policy.revision !== baseRevision) throw new Error('Availability changed in another tab. Leave this page and reopen it to load the latest settings.');
        const affected = current.appointments.filter(a => a.status === 'confirmed' && a.date >= studioToday()).filter(a => { const h = hours[weekday(a.date)], r = range(a); return !h.enabled || r.start < h.start || r.end > h.end; });
        if (affected.length) throw new Error(`${affected.length} upcoming appointment${affected.length === 1 ? '' : 's'} would fall outside these hours. Reschedule or cancel them before reducing availability.`);
        const revision = current.policy.revision + 1;
        return { ...current, hours, policy: { ...policy, revision } };
      });
      setBaseRevision(baseRevision + 1); setError(''); notify('Availability and booking preferences saved.');
    } catch (e) { setError(message(e)); }
  }
  function addBlock(e: FormEvent) {
    e.preventDefault();
    try {
      if (!block.date || !block.label.trim() || !Number.isFinite(block.start) || !Number.isFinite(block.end) || block.end <= block.start) throw new Error('Add a label and choose an end time after the start.');
      mutate(current => {
        if (current.appointments.some(a => a.date === block.date && isReserved(a) && intersects(block, range(a)))) throw new Error('This block overlaps an appointment. Reschedule or cancel the appointment first.');
        if (current.holds.some(h => h.date === block.date && h.expiresAt > Date.now() && intersects(block, range(h)))) throw new Error('This time is currently held by a booking preview. Try again once it is released.');
        if (current.blocks.some(b => b.date === block.date && intersects(block, b))) throw new Error('This time already overlaps another block.');
        return { ...current, blocks: [...current.blocks, { ...block, label: block.label.trim(), id: uid() }] };
      });
      setBlockOpen(false); setBlockError(''); setBlock({ date: studioToday(), start: 720, end: 780, label: '' }); notify('Time blocked on your calendar.');
    } catch (e) { setBlockError(message(e)); }
  }
  function removeBlock() { try { mutate(current => ({ ...current, blocks: current.blocks.filter(b => b.id !== removeId) })); setRemoveId(''); notify('Calendar block removed.'); } catch (e) { setError(message(e)); } }
  return <><div className="availability-layout"><form className="panel settings-panel studio-form" onSubmit={save}><div><h2>Your weekly rhythm</h2><p className="muted">Set the hours you want to share. All times are Eastern.</p></div><div className="hours-list">{hours.map((h, day) => <div className={`hours-row ${!h.enabled ? 'closed' : ''}`} key={day}><label className="check-label"><input type="checkbox" checked={h.enabled} onChange={e => setHours(hours.map((x, i) => i === day ? { ...x, enabled: e.target.checked } : x))}/>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}</label><input type="time" aria-label={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]} opening time`} disabled={!h.enabled} value={timeValue(h.start)} onChange={e => setHours(hours.map((x, i) => i === day ? { ...x, start: toMinutes(e.target.value) } : x))}/><span>to</span><input type="time" aria-label={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]} closing time`} disabled={!h.enabled} value={timeValue(h.end)} onChange={e => setHours(hours.map((x, i) => i === day ? { ...x, end: toMinutes(e.target.value) } : x))}/></div>)}</div><h2>Booking preferences</h2><p className="muted small-copy">These are saved settings for this sample studio. Adjust them to suit your practice.</p><div className="form-grid"><Field label="Minimum notice (minutes)"><input required type="number" min="0" max="43200" value={policy.noticeMinutes} onChange={e => setPolicy({ ...policy, noticeMinutes: Number(e.target.value) })}/></Field><Field label="Book up to (days ahead)"><input required type="number" min="1" max="365" value={policy.advanceDays} onChange={e => setPolicy({ ...policy, advanceDays: Number(e.target.value) })}/></Field><Field label="Maximum concurrent clients"><input required type="number" min="1" max="10" value={policy.maxConcurrent} onChange={e => setPolicy({ ...policy, maxConcurrent: Number(e.target.value) })}/></Field></div><label className="check-label"><input type="checkbox" checked={policy.processingOverlap} onChange={e => setPolicy({ ...policy, processingOverlap: e.target.checked })}/>Allow fitting bookings during released processing time</label><p className="form-hint">Public bookings must fit without a hands-on conflict. Manual hands-on exceptions always need your explicit approval.</p><ErrorMessage error={error}/><button className="primary" type="submit">Save availability</button></form><section className="panel settings-panel"><div className="section-title"><div><h2>Time for yourself</h2><p className="muted">Breaks, days off, and everything in between.</p></div></div><button className="secondary" onClick={() => { setBlockError(''); setBlockOpen(true); }}><Plus size={16}/>Block time</button>{studio.blocks.length ? <div className="block-list">{[...studio.blocks].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).map(b => <div key={b.id}><div><strong>{b.label}</strong><p>{dateLabel(b.date)} · {timeLabel(b.start)}–{timeLabel(b.end)}</p></div><button className="icon-button" aria-label={`Remove block ${b.label}`} onClick={() => setRemoveId(b.id)}><Trash2 size={16}/></button></div>)}</div> : <Empty title="A little breathing room." text="Block a break or a day off to keep it out of your booking times."/>}</section></div>
    {blockOpen && <Modal title="Make a little space." description="This time will be unavailable for new bookings." onClose={() => setBlockOpen(false)}><form className="studio-form" onSubmit={addBlock}><Field label="Block label"><input required maxLength={100} placeholder="Lunch, personal time, a day off…" value={block.label} onChange={e => setBlock({ ...block, label: e.target.value })}/></Field><Field label="Block date"><input type="date" required value={block.date} onChange={e => setBlock({ ...block, date: e.target.value })}/></Field><div className="form-grid"><Field label="Block start"><input type="time" required value={timeValue(block.start)} onChange={e => setBlock({ ...block, start: toMinutes(e.target.value) })}/></Field><Field label="Block end"><input type="time" required value={timeValue(block.end)} onChange={e => setBlock({ ...block, end: toMinutes(e.target.value) })}/></Field></div><ErrorMessage error={blockError}/><div className="modal-actions"><button type="button" className="secondary" onClick={() => setBlockOpen(false)}>Cancel</button><button type="submit" className="primary">Save block</button></div></form></Modal>}
    {removeId && <Modal title="Remove this time block?" description="This time will be available for booking again, within your opening hours." onClose={() => setRemoveId('')}><div className="modal-actions"><button className="secondary" onClick={() => setRemoveId('')}>Keep block</button><button className="primary" onClick={removeBlock}>Remove block</button></div></Modal>}
  </>;
}
