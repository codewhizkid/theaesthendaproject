import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readAppointments} from '@/lib/appointments/persistence';
import {uuid,validDate,appointmentTime,appointmentDate} from '@/lib/appointments/input';
import '@/components/calendar/calendar.css';
import {ReschedulePicker} from './reschedule-picker';
export async function AppointmentRescheduleWorkspace({params,searchParams,calendar}:{params:Promise<{id:string}>;searchParams:Promise<{date?:string}>;calendar?:CalendarContext}){
 const user=await requireUser();const {id}=await params;if(!uuid(id))notFound();
 const {appointments}=await readAppointments(user.id,null,id);const a=appointments[0];if(!a)notFound();
 const requested=(await searchParams).date;
 const currentDate=new Intl.DateTimeFormat('en-CA',{timeZone:a.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.startAt));
 const date=typeof requested==='string'&&validDate(requested)?requested:currentDate;
 const content=<><section className="rounded-lg bg-[#f7f3ed] p-4"><h2 className="font-semibold">Current appointment</h2><p>{a.clientName} · {a.serviceName}<br/>{appointmentDate(a)} · {appointmentTime(a)}<br/>{a.timezone.replaceAll('_',' ')}</p></section>
 <p>Choose a new time. The current time stays reserved until the move saves successfully. Your client, service, price, and full duration stay the same.</p>
 {['pending','confirmed'].includes(a.status)&&a.source==='professional_v1'?<ReschedulePicker id={id} initialDate={date} clientName={a.clientName} calendar={calendar} requestKey={randomUUID()}/>:<p role="status">This appointment cannot be rescheduled. Check its current status.</p>}
 <PopupActions><Link scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'appointment',{id}):`/appointments/${id}`} className="inline-block underline">Go back without changing</Link></PopupActions></>;
 if(calendar)return <section className="ac-popup-content"><div className="space-y-6"><h1 className="font-serif text-3xl">Reschedule appointment</h1>{content}</div></section>;
 return <WorkspacePage title="Reschedule appointment" description="Choose a new time for this visit." backHref={`/appointments/${id}`} backLabel="Appointment" narrow><WorkspacePanel>{content}</WorkspacePanel></WorkspacePage>;
}
