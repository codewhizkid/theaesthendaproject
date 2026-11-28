/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import {AppointmentChangeServiceWorkspace} from '@/components/appointments/change-service-workspace';
export default function ChangeServicePage(props:{params:Promise<{id:string}>;searchParams:Promise<{date?:string}>}){return <AppointmentChangeServiceWorkspace {...props}/>;}
