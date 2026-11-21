import {AppointmentDetailsWorkspace} from '@/components/appointments/details-workspace';
import type {AppointmentSearch} from '@/lib/calendar/navigation';
export default function AppointmentPage(props:{params:Promise<{id:string}>;searchParams:Promise<AppointmentSearch>}){return <AppointmentDetailsWorkspace {...props}/>;}
