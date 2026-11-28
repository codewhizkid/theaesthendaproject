/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readAppointments} from '@/lib/appointments/persistence';
import {readServices} from '@/lib/services/persistence';
import {uuid,validDate,type Appointment} from '@/lib/appointments/input';
import '@/components/calendar/calendar.css';
import {ChangeServicePicker} from './change-service-picker';

export async function AppointmentChangeServiceWorkspace({params,searchParams,calendar}:{params:Promise<{id:string}>;searchParams:Promise<{date?:string}>;calendar?:CalendarContext}){
 const user=await requireUser();const {id}=await params;if(!uuid(id))notFound();
 const [{appointments,asOf},services]=await Promise.all([readAppointments(user.id,null,id),readServices(user.id)]);const appointment=appointments[0];if(!appointment)notFound();
 const requested=(await searchParams).date;const currentDate=new Intl.DateTimeFormat('en-CA',{timeZone:appointment.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(appointment.startAt));const date=typeof requested==='string'&&validDate(requested)?requested:currentDate;
 const canChange=['pending','confirmed'].includes(appointment.status)&&appointment.source==='professional_v1'&&Date.parse(appointment.startAt)>Date.parse(asOf);
 const content=<><section className="rounded-lg bg-[#f7f3ed] p-4"><h2 className="font-semibold">Change the booked service</h2><p>Choose a replacement service and an available start time. The original appointment stays reserved until the change saves.</p></section>
 {canChange?<ChangeServicePicker appointment={appointment as Appointment} services={services} initialDate={date} calendar={calendar} requestKey={randomUUID()}/>:<p role="status">This appointment can no longer be changed. Check its current status and time.</p>}
 <PopupActions><Link scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'appointment',{id}):`/appointments/${id}`} className="inline-block underline">Go back without changing</Link></PopupActions></>;
 if(calendar)return <section className="ac-popup-content"><div className="space-y-6"><h1 className="font-serif text-3xl">Change service</h1>{content}</div></section>;
 return <WorkspacePage title="Change service" description="Update the service for this appointment." backHref={`/appointments/${id}`} backLabel="Appointment" narrow><WorkspacePanel>{content}</WorkspacePanel></WorkspacePage>;
}
