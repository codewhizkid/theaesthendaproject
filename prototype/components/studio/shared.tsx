'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { conflicts, dateLabel, duration, money, timeLabel, type Appointment, type Studio } from '@/lib/studio';

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={`studio-modal ${wide ? 'wide' : ''}`}><DialogTitle className="modal-title">{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}{children}</DialogContent></Dialog>;
}
export function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) { return <label className="field"><span>{label}</span>{children}{help && <small className="muted">{help}</small>}</label>; }
export function ErrorMessage({ error }: { error: string }) { return error ? <div className="error-box" role="alert">{error}</div> : null; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><CalendarDays size={28} strokeWidth={1.3}/><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function ConflictStripe({ studio, appointment }: { studio: Studio; appointment: Appointment }) {
  const parts = appointment.status === 'confirmed' || appointment.status === 'completed' ? conflicts(studio, appointment) : [];
  const total = duration(appointment.service);
  return <span className="appointment-line" aria-hidden="true">{parts.map((c, i) => <span key={i} style={{ top: `${Math.max(0, (c.start - appointment.start) / total * 100)}%`, height: `${Math.max(0, (Math.min(c.end, appointment.start + total) - Math.max(c.start, appointment.start)) / total * 100)}%` }}/>)}</span>;
}
export function AppointmentList({ studio, appointments, onOpen }: { studio: Studio; appointments: Appointment[]; onOpen: (a: Appointment) => void }) {
  return <div>{appointments.map(a => {
    const client = studio.clients.find(c => c.id === a.clientId);
    const overlaps = conflicts(studio, a);
    return <button className={`appointment-row appointment-button ${a.status === 'cancelled' ? 'cancelled' : ''}`} key={a.id} onClick={() => onOpen(a)}>
      <span className="time">{timeLabel(a.start).split(' ')[0]}<small>{timeLabel(a.start).split(' ')[1]}</small></span><ConflictStripe studio={studio} appointment={a}/><div><h3>{client?.name || 'Client'}</h3><p>{a.service.name} · {duration(a.service)} min</p>{a.status !== 'confirmed' && <span className={`status-tag ${a.status}`}>{a.status === 'no-show' ? 'No-show' : a.status}</span>}</div><span className="row-price">{money(a.service.price)}</span><ArrowUpRight size={17}/>{overlaps.length > 0 && <span className="sr-only">Conflicting intervals: {overlaps.map(c => `${timeLabel(c.start)} to ${timeLabel(c.end)}`).join(', ')}. Open for approval details.</span>}
    </button>;
  })}</div>;
}
export function AppointmentSummary({ appointment }: { appointment: Appointment }) { return <div className="booking-summary"><strong>{appointment.service.name}</strong><p>{dateLabel(appointment.date, true)} · {timeLabel(appointment.start)}–{timeLabel(appointment.start + duration(appointment.service))}</p><p>{money(appointment.service.price)} · {duration(appointment.service)} minutes</p></div>; }
export function message(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
