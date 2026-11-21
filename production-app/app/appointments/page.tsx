import {AppointmentBookingWorkspace} from '@/components/appointments/booking-workspace';
import type {AppointmentSearch} from '@/lib/calendar/navigation';
export default function AppointmentsPage({searchParams}:{searchParams:Promise<AppointmentSearch>}){return <AppointmentBookingWorkspace searchParams={searchParams}/>;}
