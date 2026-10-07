'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3 } from 'lucide-react';
import { commitBooking, createHold, dateLabel, duration, money, slots, studioToday, addDays, timeLabel, uid, type Appointment, type Hold, type Studio } from '@/lib/studio';
import type { MutateStudio } from '@/hooks/use-studio';
import { AppointmentSummary, Empty, ErrorMessage, Field, message, Modal } from './shared';

export function BookingPreview({ studio, mutate, onClose, onSaved }: { studio: Studio; mutate: MutateStudio; onClose: () => void; onSaved: (text: string) => void }) {
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(studio.services.find(s => !s.archived)?.id || '');
  const [date, setDate] = useState(studioToday());
  const [hold, setHold] = useState<Hold | null>(null);
  const [now, setNow] = useState(Date.now());
  const [client, setClient] = useState({ name: '', email: '', phone: '' });
  const [verified, setVerified] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);
  const service = studio.services.find(s => s.id === serviceId && !s.archived);
  const choices = service ? slots(studio, service, date, new Date(now)) : [];
  const remaining = hold ? Math.max(0, Math.ceil((hold.expiresAt - now) / 1000)) : 0;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  function release() {
    if (hold) mutate(current => ({ ...current, holds: current.holds.filter(h => h.id !== hold.id) }));
    setHold(null); setVerified(false); setAccepted(false);
  }
  function close() { try { release(); onClose(); } catch (e) { setError(message(e)); } }
  function choose(start: number) {
    if (!service) return;
    try {
      let selected: Hold | undefined;
      mutate(current => {
        const currentService = current.services.find(s => s.id === serviceId && !s.archived);
        if (!currentService) throw new Error('This service is no longer available.');
        const result = createHold(current, currentService, date, start); selected = result.hold; return result.state;
      });
      if (selected) { setHold(selected); setNow(Date.now()); setStep(3); setError(''); }
    } catch (e) { setError(message(e)); }
  }
  function goBack() { try { release(); setStep(2); setError(''); } catch (e) { setError(message(e)); } }
  function confirm(e: FormEvent) {
    e.preventDefault();
    if (!hold || !verified || !accepted) return;
    try {
      if (!client.name.trim() || !client.email.trim()) throw new Error('Enter your name and email.');
      let resultAppointment: Appointment | undefined;
      mutate(current => {
        const email = client.email.trim().toLowerCase();
        const match = current.clients.find(c => c.email.toLowerCase() === email);
        const savedClient = match || { id: uid(), name: client.name.trim(), email, phone: client.phone.trim(), notes: '' };
        const next = commitBooking({ ...current, clients: match ? current.clients : [...current.clients, savedClient] }, { clientId: savedClient.id, service: hold.service, date: hold.date, start: hold.start, notes: '' }, { channel: 'booking', holdId: hold.id, verified });
        resultAppointment = next.appointments[next.appointments.length - 1]; return next;
      });
      if (resultAppointment) { setBooked(resultAppointment); setHold(null); setStep(4); onSaved('Client booking added to your calendar.'); }
    } catch (e) { setError(message(e)); }
  }
  return <Modal title={step === 4 ? 'A little time, just for you.' : 'Book with Jamie’s studio'} description="Client booking preview · Eastern time" onClose={close} wide>
    {step < 4 && <><div className="booking-steps" aria-label={`Step ${step} of 3`}>{['Service', 'Your time', 'Your details'].map((label, i) => <span key={label} className={step >= i + 1 ? 'current' : ''}><b>{step > i + 1 ? <Check size={12}/> : i + 1}</b>{label}</span>)}</div><p className="preview-note">Local demonstration: verification and ten-minute holds are simulated in this browser. No payment or message is sent.</p></>}
    {step === 1 && <><div className="service-choices">{studio.services.filter(s => !s.archived).map(s => <button key={s.id} className={`service-choice ${serviceId === s.id ? 'selected' : ''}`} onClick={() => setServiceId(s.id)} aria-pressed={serviceId === s.id}><div><strong>{s.name}</strong><p>{duration(s)} minutes</p></div><span>{money(s.price)}</span></button>)}</div>{!service && <Empty title="Services are taking a little break." text="Add or unarchive a service in your studio to start booking."/>}<div className="modal-actions"><button className="primary" disabled={!service} onClick={() => setStep(2)}>Choose a time <ArrowRight size={16}/></button></div></>}
    {step === 2 && <><button className="text-button back-button" onClick={() => setStep(1)}><ArrowLeft size={15}/>Change service</button><div className="booking-summary"><strong>{service?.name}</strong><p>{service && `${duration(service)} minutes · ${money(service.price)}`}</p></div><Field label="Booking date"><input type="date" min={studioToday()} max={addDays(studioToday(), studio.policy.advanceDays)} value={date} onChange={e => { setDate(e.target.value); setError(''); }}/></Field><p className="field-label">Available times · Eastern</p><div className="slot-grid">{choices.map(t => <button key={t} className="slot-button" onClick={() => choose(t)}>{timeLabel(t)}</button>)}</div>{!choices.length && <Empty title="A full day, or a day off." text="There are no available times for this service. Try another date."/>}<p className="form-hint">Booking opens {studio.policy.advanceDays} days ahead, with {studio.policy.noticeMinutes} minutes’ notice.</p></>}
    {step === 3 && hold && <><button className="text-button back-button" onClick={goBack}><ArrowLeft size={15}/>Choose a different time</button><div className={`hold-notice ${remaining === 0 ? 'expired' : ''}`} role="status"><Clock3 size={17}/>{remaining > 0 ? `Your time is held for ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Your hold expired. Choose a time again.'}</div><div className="booking-summary"><strong>{hold.service.name}</strong><p>{dateLabel(hold.date, true)} · {timeLabel(hold.start)} · {duration(hold.service)} min</p><p>{money(hold.service.price)} · No online payment in this preview</p></div><form onSubmit={confirm} className="studio-form"><div className="form-grid"><Field label="Your name"><input required maxLength={100} autoComplete="name" value={client.name} onChange={e => { setClient({ ...client, name: e.target.value }); setVerified(false); }}/></Field><Field label="Your email"><input required type="email" maxLength={200} autoComplete="email" value={client.email} onChange={e => { setClient({ ...client, email: e.target.value }); setVerified(false); }}/></Field></div><Field label="Your phone (optional)"><input type="tel" maxLength={40} value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })}/></Field><label className="check-label"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}/>Simulate a verified client for this preview</label><label className="check-label"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>I have reviewed the service, date, time, and price.</label><button className="primary full-width" disabled={!remaining || !verified || !accepted} type="submit">Confirm booking</button></form></>}
    {step === 4 && booked && <div className="booking-success"><span className="success-icon"><Check size={26}/></span><h2>You’re on the calendar.</h2><p>Your preview booking is saved in Jamie’s studio.</p><AppointmentSummary appointment={booked}/><p className="muted">No confirmation email or text was sent.</p><button className="primary" onClick={close}>Back to the studio</button></div>}
    <ErrorMessage error={error}/>
  </Modal>;
}
