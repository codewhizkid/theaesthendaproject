import '@/components/calendar/calendar.css';
import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
import {randomUUID} from 'node:crypto';
import {calendarHref,type CalendarContext,type AppointmentSearch} from '@/lib/calendar/navigation';
import {PopupActions} from '@/components/calendar/dialog-actions';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readAppointments,readClientAppointments,readAppointmentNeighbors} from '@/lib/appointments/persistence';
import {readClients} from '@/lib/clients/persistence';
import {uuid,appointmentTime,appointmentDate,type Appointment} from '@/lib/appointments/input';
import {AppointmentManagementActions} from './management-actions';
import {AppointmentEmailStatus} from './email-status';
import {ClientContact} from './client-contact';
const button='ac-button';
const statusLabel=(status:string)=>status==='no_show'?'No-show':status.charAt(0).toUpperCase()+status.slice(1);
export async function AppointmentDetailsWorkspace({params,searchParams,calendar}:{params:Promise<{id:string}>;searchParams:Promise<AppointmentSearch>;calendar?:CalendarContext}){
 const user=await requireUser();const {id}=await params;if(!uuid(id))notFound();const {appointments,asOf}=await readAppointments(user.id,null,id);const a=appointments[0];if(!a||!a.clientId)notFound();
 const client=(await readClients(user.id,a.clientId)).clients[0];if(!client)notFound();
 const query=await searchParams;const group=query.section==='previous'||query.section==='upcoming'?query.section:null;
 const page=typeof query.page==='string'&&/^\d+$/.test(query.page)?Math.min(Number(query.page),20000):0;
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:a.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.startAt));
 const href=(fields:AppointmentSearch={})=>calendar?calendarHref(calendar,'appointment',{id,...fields}):`/appointments/${id}?${new URLSearchParams(fields as Record<string,string>)}`;
 const now=Date.parse(asOf);const active=['pending','confirmed'].includes(a.status)&&a.source==='professional_v1';
 const hasStarted=Date.parse(a.startAt)<=now,hasEnded=Date.parse(a.endAt)<=now;
 function card(item:Appointment){return <Link scroll={calendar?false:undefined} className="block rounded-xl border border-stone-200 p-4 hover:bg-stone-50" href={calendar?calendarHref(calendar,'appointment',{id:item.id}):`/appointments/${item.id}`}><strong>{item.serviceName}</strong><span className="mt-1 block text-sm">{appointmentDate(item)} · {appointmentTime(item)}</span><span className="mt-1 block text-sm">{statusLabel(item.status)}</span></Link>;}
 if(group){const result=await readClientAppointments(user.id,a.clientId,group,page);const content=<>{result.appointments.length?result.appointments.map(item=><div key={item.id}>{card(item)}</div>):<p>No {group} appointments.</p>}<nav className="flex justify-between gap-3" aria-label="Appointment history pages">{page>0&&<Link href={href({section:group,page:String(page-1)})} scroll={false}>Previous page</Link>}{result.hasMore&&<Link href={href({section:group,page:String(page+1)})} scroll={false}>Next page</Link>}</nav><PopupActions><Link className={button} scroll={false} href={href()}>Back to appointment</Link></PopupActions></>;if(calendar)return <section className="ac-popup-content"><div className="space-y-5"><h1 className="font-serif text-3xl">{group==='previous'?'Previous appointments':'Upcoming appointments'}</h1><p>{a.clientName}</p>{content}</div></section>;return <WorkspacePage title={group==='previous'?'Previous appointments':'Upcoming appointments'} description={a.clientName} backHref={href()} backLabel="Appointment" narrow><WorkspacePanel>{content}</WorkspacePanel></WorkspacePage>;}
 const {previous:last,upcoming:next}=await readAppointmentNeighbors(user.id,a.id);
 const content=<> {query.saved==='1'&&<p role="status" className="rounded-lg bg-[#e9eee5] p-3">Appointment saved.</p>}{query.rescheduled==='1'&&<p role="status" className="rounded-lg bg-[#e9eee5] p-3">Appointment rescheduled.</p>}
 {a.source==='professional_v1'&&<AppointmentEmailStatus actor={user.id} appointmentId={a.id} hasEmail={!!client.email}/>}
 <section className="space-y-4 border-b border-stone-200 pb-6"><p className="text-xs font-semibold uppercase tracking-widest">Client profile</p><h2 className="break-words font-serif text-3xl">{a.clientName}</h2><div className="flex flex-wrap items-start gap-3"><ClientContact client={client}/><Link className={button} scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'client',{id:client.id,returnAppointment:a.id}):`/clients/${client.id}`}>View profile</Link></div></section>
 <section className="space-y-4" aria-labelledby="current-appointment"><h2 id="current-appointment" className="font-serif text-2xl">Current appointment</h2><p>{appointmentDate(a)}<br/>{appointmentTime(a)} · {Math.round((Date.parse(a.endAt)-Date.parse(a.startAt))/60000)} minutes<br/><span className="text-sm text-stone-600">{a.timezone.replaceAll('_',' ')}</span></p><p><strong>Status: {statusLabel(a.status)}</strong></p>{a.status==='pending'&&<p className="text-sm text-stone-600">{hasStarted?'This visit is still marked Pending.':'Reserved, awaiting confirmation.'}</p>}
 {((a.segments?.length??0)>1||a.segments?.some(step=>!step.occupied))&&<ol className="space-y-2 rounded-xl bg-[#f7f3ed] p-4" aria-label="Booked visit steps">{a.segments!.map((step,index)=><li key={index} className="text-sm"><strong>{step.label}</strong> · {appointmentTime({...a,startAt:step.startAt,endAt:step.endAt})}<span className="block text-stone-600">{step.occupied?'Hands-on / reserved':'Released processing'}</span></li>)}</ol>}
 {active?<AppointmentManagementActions calendar={calendar} id={a.id} revision={a.revision} requestKey={randomUUID()} status={a.status} hasStarted={hasStarted} hasEnded={hasEnded} bookHref={calendar?calendarHref(calendar,'book',{client:client.id}):`/appointments?client=${client.id}`} rescheduleHref={calendar?calendarHref(calendar,'reschedule',{id:a.id,date}):`/appointments/${a.id}/reschedule`}/>:<Link className="ac-button ac-primary" scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'book',{client:client.id}):`/appointments?client=${client.id}`}>Book new appointment</Link>}
 </section>
 <section className="rounded-xl bg-[#f7f3ed] p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-serif text-2xl">{a.serviceName}</h2><p>{a.priceCents!=null?(a.priceCents/100).toLocaleString('en-US',{style:'currency',currency:a.currency||'USD'}):'Price unavailable'}</p></div><button type="button" disabled className="ac-button opacity-50" aria-describedby="checkout-note">Checkout</button></div><p id="checkout-note" className="mt-3 text-sm text-stone-600">Checkout and payment tracking are not connected yet. Appointment status does not indicate payment.</p></section>
 <section className="space-y-3 border-t border-stone-200 pt-5"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Previous appointments</h2><Link className="underline" scroll={false} href={href({section:'previous'})}>See all<span className="sr-only"> previous appointments</span></Link></div>{last?card(last):<p className="text-sm text-stone-600">No previous appointments to show.</p>}</section>
 <section className="space-y-3 border-t border-stone-200 pt-5"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Upcoming appointments</h2><Link className="underline" scroll={false} href={href({section:'upcoming'})}>See all<span className="sr-only"> upcoming appointments</span></Link></div>{next?card(next):<p className="text-sm text-stone-600">No later upcoming appointments.</p>}</section>
</>;
 if(calendar)return <section className="ac-popup-content"><div className="space-y-6"><h1 className="font-serif text-3xl">Appointment details</h1>{content}</div></section>;
 return <WorkspacePage title="Appointment details" description={`${appointmentDate(a)} · ${appointmentTime(a)}`} backHref={`/calendar?date=${date}`} backLabel="Calendar" narrow><WorkspacePanel>{content}</WorkspacePanel></WorkspacePage>;
}
