import '@/components/calendar/calendar.css';
import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readClients} from '@/lib/clients/persistence';
import {isUuid} from '@/lib/clients/input';
import {ClientProfileView} from '@/components/clients/profile-view';
import {ClientForm} from '@/components/clients/client-form';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {calendarHref,type CalendarContext,type AppointmentSearch} from '@/lib/calendar/navigation';
export async function ClientProfileWorkspace({params,searchParams,calendar}:{params:Promise<{id:string}>;searchParams:Promise<AppointmentSearch>;calendar?:CalendarContext}) {
 const user=await requireUser();const {id}=await params;if(!isUuid(id))notFound();
 const {clients}=await readClients(user.id,id);const client=clients[0];if(!client)notFound();
 const query=await searchParams;const appointmentId=query.returnAppointment&&isUuid(query.returnAppointment)?query.returnAppointment:undefined;
 const content=<>{query.saved==='1'&&<p role="status" className="rounded-lg bg-[#e9eee5] p-3">Client saved.</p>}<h2 className="font-serif text-2xl">Client profile</h2><ClientProfileView key={`${client.id}-${client.revision}`} requestKey={randomUUID()} client={client} calendar={calendar} appointmentId={appointmentId}/>{calendar&&appointmentId&&<PopupActions><Link className="ac-button" scroll={false} href={calendarHref(calendar,'appointment',{id:appointmentId})}>Back to appointment</Link></PopupActions>}</>;
 if(calendar)return <section className="ac-popup-content"><div className="space-y-6"><h1 className="break-words font-serif text-3xl">{client.firstName} {client.lastName}</h1>{content}</div></section>;
 return <WorkspacePage title={`${client.firstName} ${client.lastName}`} description="Contact details, preferences, and appointment history." backHref="/clients" backLabel="Clients" narrow><WorkspacePanel>{content}</WorkspacePanel></WorkspacePage>;
}

export async function ClientCreateWorkspace({searchParams,calendar}:{searchParams:Promise<AppointmentSearch>;calendar:CalendarContext}){
 await requireUser();const params=await searchParams;
 return <section className="ac-popup-content"><div className="mx-auto max-w-2xl space-y-6 bg-white p-6 sm:p-8"><h1 className="font-serif text-3xl">New client</h1><p>Add their details, then continue booking.</p><ClientForm requestKey={randomUUID()} calendar={calendar} booking={params}/><PopupActions><Link className="ac-button" scroll={false} href={calendarHref(calendar,'book',params)}>Back to booking</Link></PopupActions></div></section>;
}
