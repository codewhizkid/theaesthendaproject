import {AppointmentRescheduleWorkspace} from '@/components/appointments/reschedule-workspace';
export default function ReschedulePage(props:{params:Promise<{id:string}>;searchParams:Promise<{date?:string}>}){return <AppointmentRescheduleWorkspace {...props}/>;}
