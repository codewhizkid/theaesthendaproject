import {ClientProfileWorkspace} from '@/components/clients/profile-workspace';
import type {AppointmentSearch} from '@/lib/calendar/navigation';
export default function ClientPage(props:{params:Promise<{id:string}>;searchParams:Promise<AppointmentSearch>}){return <ClientProfileWorkspace {...props}/>;}
