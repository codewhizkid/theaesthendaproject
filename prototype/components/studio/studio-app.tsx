'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, Plus, Scissors, Search, Sun, Users, X } from 'lucide-react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useStudio, type MutateStudio } from '@/hooks/use-studio';
import { addDays, dateLabel, duration, freeMinutes, isReserved, money, studioToday, timeLabel, weekday, type Appointment, type Client, type Service, type Studio } from '@/lib/studio';
import { AppointmentDetail, AppointmentEditor, ClientEditor, ServiceEditor } from './editors';
import { BookingPreview } from './booking';
import { Availability } from './availability';
import { AppointmentList, ConflictStripe, Empty, ErrorMessage, message, Modal } from './shared';

type View = 'Today' | 'Calendar' | 'Clients' | 'Services' | 'Availability';
type Editor = { type: 'appointment'; appointment?: Appointment } | { type: 'detail'; appointment: Appointment } | { type: 'client'; client?: Client } | { type: 'client-detail'; client: Client } | { type: 'service'; service?: Service } | { type: 'archive'; service: Service } | { type: 'booking' } | null;
const navigation = [{ label: 'Today', icon: Sun }, { label: 'Calendar', icon: CalendarDays }, { label: 'Clients', icon: Users }, { label: 'Services', icon: Scissors }, { label: 'Availability', icon: Clock3 }] as const;

function Navigation({ view, navigate }: { view: View; navigate: (v: View) => void }) {
  const { setOpenMobile } = useSidebar();
  return <SidebarMenu>{navigation.map(({ label, icon: Icon }) => <SidebarMenuItem key={label}><SidebarMenuButton isActive={view === label} aria-current={view === label ? 'page' : undefined} onClick={() => { navigate(label); setOpenMobile(false); }}><Icon/><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>;
}

export function StudioApp() {
  const { studio, error, mutate } = useStudio();
  if (error) return <main className="load-screen"><div className="wordmark">aesthenda</div><h1>Let’s reconnect your studio.</h1><ErrorMessage error={error}/><p>Your saved data has not been overwritten. Enable browser storage, then try again.</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!studio) return <main className="load-screen" aria-busy="true"><div className="wordmark">aesthenda</div><p>Opening your studio…</p></main>;
  return <Workspace studio={studio} mutate={mutate}/>;
}

function Workspace({ studio, mutate }: { studio: Studio; mutate: MutateStudio }) {
  const [view, setView] = useState<View>('Today');
  const [date, setDate] = useState(studioToday());
  const [calendarMode, setCalendarMode] = useState<'day' | 'week'>('day');
  const [query, setQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const today = studioToday();
  const selectedDate = view === 'Today' ? today : date;
  const onDate = studio.appointments.filter(a => a.date === selectedDate).sort((a, b) => a.start - b.start);
  const visibleAppointments = onDate.filter(a => showHistory || isReserved(a));
  const scheduled = onDate.filter(isReserved);
  const free = freeMinutes(studio, selectedDate);
  const navigate = (v: View) => { setView(v); setQuery(''); setError(''); };
  const close = () => { setEditor(null); setError(''); };
  const notify = (text: string) => { setToast(text); setError(''); };
  function newAppointment() {
    if (!studio.clients.length) { setEditor({ type: 'client' }); notify('Add your first client, then book an appointment.'); return; }
    if (!studio.services.some(s => !s.archived)) { setEditor({ type: 'service' }); notify('Add a service before booking an appointment.'); return; }
    setEditor({ type: 'appointment' });
  }
  function archive(service: Service) {
    try { mutate(current => ({ ...current, services: current.services.map(s => s.id === service.id ? { ...s, archived: !service.archived } : s) })); notify(service.archived ? 'Service is available for booking again.' : 'Service archived. Existing appointments are unchanged.'); close(); }
    catch (e) { setError(message(e)); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(studio, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `aesthenda-studio-${today}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Studio backup downloaded.');
  }
  const headings: Record<View, { eyebrow: string; title: string; description: string }> = {
    Today: { eyebrow: dateLabel(today, true).toUpperCase(), title: 'A little space.\nA beautiful day.', description: 'Your appointments, all in one calm place.' },
    Calendar: { eyebrow: 'YOUR TIME, THOUGHTFULLY PLANNED', title: 'Space for every client.', description: 'A clear view of what’s ahead, with room for what matters.' },
    Clients: { eyebrow: 'THE PEOPLE BEHIND YOUR PRACTICE', title: 'Familiar faces.\nThoughtful care.', description: 'Keep the little details that make every visit personal.' },
    Services: { eyebrow: 'YOUR CRAFT, BEAUTIFULLY PRESENTED', title: 'What you do best.', description: 'Shape your services, prices, and the time each one deserves.' },
    Availability: { eyebrow: 'A SCHEDULE THAT FITS YOUR LIFE', title: 'Find your rhythm.', description: 'Make time for your clients. Keep time for yourself.' },
  };
  const h = headings[view];
  const weekStart = addDays(date, -((weekday(date) + 6) % 7));
  return <SidebarProvider><Sidebar className="studio-sidebar"><SidebarHeader><div className="wordmark">aesthenda<span>YOUR DAY, BEAUTIFULLY IN HAND</span></div></SidebarHeader><SidebarContent><Navigation view={view} navigate={navigate}/><div className="sidebar-booking"><span className="eyebrow">SEE IT THROUGH THEIR EYES</span><button className="text-button" onClick={() => setEditor({ type: 'booking' })}>Client booking preview <ArrowUpRight size={15}/></button></div></SidebarContent><SidebarFooter><div className="profile"><span className="avatar">JS</span><div>Jamie’s studio<small>Independent professional</small></div></div><button className="backup-button" onClick={exportData}><Download size={14}/>Download studio backup</button></SidebarFooter></Sidebar>
    <main className="workspace"><header className="topbar"><div className="topbar-breadcrumb"><SidebarTrigger className="mobile-menu"/><span>MY WORKSPACE / {view.toUpperCase()}</span></div><span className="demo-pill"><span className="save-dot"/>Saved on this browser</span></header><div className="page-content"><div className="page-heading"><div><p className="eyebrow">{h.eyebrow}</p><h1 className="preserve-lines">{h.title}</h1><p className="muted">{h.description}</p></div>{view === 'Clients' ? <button className="primary" onClick={() => setEditor({ type: 'client' })}><Plus size={18}/>Add client</button> : view === 'Services' ? <button className="primary" onClick={() => setEditor({ type: 'service' })}><Plus size={18}/>Add service</button> : view !== 'Availability' && <button className="primary" onClick={newAppointment}><Plus size={18}/>Add appointment</button>}</div><ErrorMessage error={error}/>
      {(view === 'Today' || view === 'Calendar') && <>
        {view === 'Today' && <div className="stats"><div><span>On the calendar</span><strong>{scheduled.length}<small>{scheduled.length === 1 ? 'appointment' : 'appointments'}</small></strong></div><div><span>Scheduled value</span><strong>{money(scheduled.reduce((n, a) => n + a.service.price, 0))}<small>before tips</small></strong></div><div><span>Room to breathe</span><strong>{Math.floor(free / 60)}h {free % 60}m<small>available today</small></strong></div></div>}
        {view === 'Calendar' && <div className="calendar-toolbar"><div className="button-row"><button className="icon-button" aria-label="Previous dates" onClick={() => setDate(addDays(date, calendarMode === 'week' ? -7 : -1))}><ChevronLeft size={18}/></button><button className="secondary compact" onClick={() => setDate(today)}>Today</button><button className="icon-button" aria-label="Next dates" onClick={() => setDate(addDays(date, calendarMode === 'week' ? 7 : 1))}><ChevronRight size={18}/></button><input className="date-picker" type="date" aria-label="Calendar date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></div><div className="segmented" aria-label="Calendar view"><button aria-pressed={calendarMode === 'day'} onClick={() => setCalendarMode('day')}>Day</button><button aria-pressed={calendarMode === 'week'} onClick={() => setCalendarMode('week')}>Week</button></div></div>}
        {view === 'Calendar' && calendarMode === 'week' ? <><p className="calendar-caption">{dateLabel(weekStart)}–{dateLabel(addDays(weekStart, 6))} · Eastern time</p><div className="week-grid">{Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(day => { const events = studio.appointments.filter(a => a.date === day && isReserved(a)).sort((a, b) => a.start - b.start); return <section className={`week-day ${day === today ? 'is-today' : ''}`} key={day}><button className="week-date" onClick={() => { setDate(day); setCalendarMode('day'); }}><span>{dateLabel(day).split(',')[0]}</span><strong>{Number(day.slice(-2))}</strong><small>{events.length} booked</small></button>{events.map(a => <button className="week-appointment" key={a.id} onClick={() => setEditor({ type: 'detail', appointment: a })}><ConflictStripe studio={studio} appointment={a}/><div><small>{timeLabel(a.start)}</small><strong>{studio.clients.find(c => c.id === a.clientId)?.name}</strong><span>{a.service.name}</span><small>{duration(a.service)} min</small></div></button>)}{studio.blocks.filter(b => b.date === day).map(b => <div className="week-block" key={b.id}>{b.label}<small>{timeLabel(b.start)}–{timeLabel(b.end)}</small></div>)}{!events.length && <p className="week-empty">{studio.hours[weekday(day)].enabled ? 'Room to breathe' : 'Day off'}</p>}</section>; })}</div></> : <div className="day-layout"><section className="panel"><div className="panel-heading"><div><h2>{view === 'Today' ? 'Your day' : dateLabel(date)}</h2><p className="panel-subtitle">Eastern time</p></div><label className="check-label history-toggle"><input type="checkbox" checked={showHistory} onChange={e => setShowHistory(e.target.checked)}/>Show history</label></div>{visibleAppointments.length ? <AppointmentList studio={studio} appointments={visibleAppointments} onOpen={a => setEditor({ type: 'detail', appointment: a })}/> : <Empty title="A little room for what’s next." text="No appointments to show for this day." action={<button className="secondary" onClick={newAppointment}>Add an appointment</button>}/>}{studio.blocks.filter(b => b.date === selectedDate).map(b => <div className="calendar-block" key={b.id}><Clock3 size={16}/><div><strong>{b.label}</strong><p>{timeLabel(b.start)}–{timeLabel(b.end)}</p></div></div>)}<button className="open-time" onClick={() => navigate('Availability')}><Clock3 size={18}/><span>Make your schedule work for you.</span><ArrowRight size={15}/></button></section><aside><section className="feature-card"><span className="eyebrow">MAKE IT YOURS</span><h2>Your next chapter<br/>starts with a booking.</h2><p>Shape your services, set your hours, and experience your client’s first visit.</p><button onClick={() => setEditor({ type: 'booking' })}>Preview booking <ArrowRight size={17}/></button></section><section className="notes"><span className="eyebrow">YOUR WORKING STUDIO</span><p>Sample data. Real room to explore.</p><p className="muted">Changes are saved in this browser, including after a refresh. Messages, verification, and payments are not connected.</p></section></aside></div>}
      </>}
      {view === 'Clients' && <><div className="list-toolbar"><label className="search-box"><Search size={18}/><input aria-label="Search clients" placeholder="Search names, emails, or phone numbers" value={query} onChange={e => setQuery(e.target.value)}/></label><span className="muted">{studio.clients.length} clients</span></div><div className="client-grid">{studio.clients.filter(c => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map(c => { const visits = studio.appointments.filter(a => a.clientId === c.id && a.status === 'completed').length; return <button className="client-card" key={c.id} onClick={() => setEditor({ type: 'client-detail', client: c })}><div className="client-card-top"><span className="avatar">{c.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><ArrowUpRight size={17}/></div><h2>{c.name}</h2><p>{c.email || 'No email saved'}</p><small>{visits} completed {visits === 1 ? 'visit' : 'visits'}</small></button>; })}</div>{!studio.clients.some(c => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(query.toLowerCase())) && <Empty title="No clients found." text="Try another search, or add a new client."/>}</>}
      {view === 'Services' && <><div className="list-toolbar"><p className="muted">{studio.services.filter(s => !s.archived).length} services available to book</p><label className="check-label"><input type="checkbox" checked={showArchive} onChange={e => setShowArchive(e.target.checked)}/>Show archived</label></div><div className="service-grid">{studio.services.filter(s => showArchive || !s.archived).map(s => <section className={`service-card ${s.archived ? 'archived' : ''}`} key={s.id}><div className="service-card-top"><span className="service-icon"><Scissors size={22}/></span><span className="status-tag">{s.archived ? 'Archived' : 'Available'}</span></div><h2>{s.name}</h2><div className="service-price">{money(s.price)}<small>{duration(s)} minutes</small></div><div className="segment-bar" aria-label={`${s.active} minutes active, ${s.processing} processing, ${s.finish} finishing`}><span style={{ flex: s.active }}/>{s.processing > 0 && <span className="processing" style={{ flex: s.processing }}/ >}{s.finish > 0 && <span style={{ flex: s.finish }}/>}</div><p className="service-timing">{s.active} min active{s.processing > 0 && ` · ${s.processing} min processing`}{s.finish > 0 && ` · ${s.finish} min finish`}</p><p className="form-hint">{s.before || s.after ? `${s.before} min before / ${s.after} min after` : 'No added buffers'}</p><div className="service-card-actions"><button className="secondary" onClick={() => setEditor({ type: 'service', service: s })}>Edit service</button><button className="text-button" onClick={() => setEditor({ type: 'archive', service: s })}>{s.archived ? 'Make available' : 'Archive'}</button></div></section>)}</div>{!studio.services.filter(s => showArchive || !s.archived).length && <Empty title="Your next service starts here." text="Add a service to open your calendar for bookings."/>}</>}
      {view === 'Availability' && <Availability studio={studio} mutate={mutate} notify={notify}/>}
    </div><footer className="workspace-footer">Aesthenda · Local working prototype <span>Jamie’s studio · Eastern time</span></footer></main>
    {toast && <div className="toast" role="status"><Check size={17}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16}/></button></div>}
    {editor?.type === 'appointment' && <AppointmentEditor studio={studio} mutate={mutate} onClose={close} onSaved={notify} appointment={editor.appointment} date={selectedDate}/>}
    {editor?.type === 'detail' && <AppointmentDetail studio={studio} mutate={mutate} onClose={close} onSaved={notify} appointment={editor.appointment} onEdit={() => setEditor({ type: 'appointment', appointment: studio.appointments.find(a => a.id === editor.appointment.id) || editor.appointment })}/>}
    {editor?.type === 'client' && <ClientEditor mutate={mutate} onClose={close} onSaved={notify} client={editor.client}/>}
    {editor?.type === 'service' && <ServiceEditor mutate={mutate} onClose={close} onSaved={notify} service={editor.service}/>}
    {editor?.type === 'booking' && <BookingPreview studio={studio} mutate={mutate} onClose={close} onSaved={notify}/>}
    {editor?.type === 'client-detail' && <Modal title={editor.client.name} description="Client profile and appointment history" onClose={close} wide><div className="detail-grid"><div><span className="field-label">Email</span><p>{editor.client.email || 'No email saved'}</p></div><div><span className="field-label">Phone</span><p>{editor.client.phone || 'No phone saved'}</p></div></div>{editor.client.notes && <div className="booking-summary"><strong>Private notes</strong><p className="preserve-lines">{editor.client.notes}</p></div>}<button className="secondary" onClick={() => setEditor({ type: 'client', client: editor.client })}>Edit profile</button><h2>Appointments</h2>{studio.appointments.filter(a => a.clientId === editor.client.id).length ? studio.appointments.filter(a => a.clientId === editor.client.id).sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start).map(a => <button key={a.id} className="client-visit" onClick={() => setEditor({ type: 'detail', appointment: a })}><div><strong>{a.service.name}</strong><p>{dateLabel(a.date)} · {timeLabel(a.start)}</p></div><span className={`status-tag ${a.status}`}>{a.status}</span></button>) : <p className="muted">No appointments yet.</p>}</Modal>}
    {editor?.type === 'archive' && <Modal title={editor.service.archived ? 'Make this service available?' : 'Archive this service?'} description={editor.service.archived ? 'Clients can choose this service in the booking preview again.' : 'New bookings will no longer offer this service. Existing appointments keep all of their booked details.'} onClose={close}><ErrorMessage error={error}/><div className="modal-actions"><button className="secondary" onClick={close}>Go back</button><button className="primary" onClick={() => archive(editor.service)}>{editor.service.archived ? 'Make available' : 'Archive service'}</button></div></Modal>}
  </SidebarProvider>;
}
