/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
'use client';
import {useActionState,useState,useRef} from 'react';
import Link from 'next/link';
import {cancelAppointment,changeAppointmentStatus} from '@/app/appointments/actions';
import {CalendarContextFields} from '@/components/calendar/context-fields';
import {useCalendarWorkspaceBusy} from '@/components/calendar/workspace-busy';
import type {CalendarContext} from '@/lib/calendar/navigation';
export function AppointmentManagementActions({id,revision,requestKey,status,calendar,hasStarted,hasEnded,bookHref,rescheduleHref,changeServiceHref}:{id:string;revision:number;requestKey:string;status:string;calendar?:CalendarContext;hasStarted:boolean;hasEnded:boolean;bookHref:string;rescheduleHref:string;changeServiceHref:string}){
 const [statusState,statusAction,statusPending]=useActionState(changeAppointmentStatus,{message:''});
 const [cancelState,cancelAction,cancelPending]=useActionState(cancelAppointment,{message:''});
 const [opensUp,setOpensUp]=useState(false);const options=useRef<HTMLDivElement>(null);
 const pending=statusPending||cancelPending;useCalendarWorkspaceBusy(pending);
 const statusFields=<><CalendarContextFields context={calendar}/><input type="hidden" name="appointmentId" value={id}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="requestKey" value={requestKey}/></>;
 return <>
 {status==='pending'&&!hasStarted&&<form action={statusAction}>{statusFields}<button name="status" value="confirmed" disabled={pending} className="ac-button">{statusPending?'Updating…':'Confirm appointment'}</button></form>}
 <div className="ab-appointment-actions"><Link className="ac-button ac-primary" scroll={calendar?false:undefined} href={bookHref} aria-disabled={pending||undefined} onClick={event=>{if(pending)event.preventDefault();}}>Book new appointment</Link>
 <details className={`ab-manage ${opensUp?'ab-manage-up':''}`} onToggle={event=>{if(!event.currentTarget.open)return;const rect=event.currentTarget.getBoundingClientRect();const dialog=event.currentTarget.closest('dialog');const bounds=dialog?.getBoundingClientRect();const footer=dialog?.querySelector('.ac-dialog-footer')?.getBoundingClientRect().height??0;const above=rect.top-(bounds?.top??0)-12;const below=(bounds?.bottom??window.innerHeight)-footer-rect.bottom-12;setOpensUp(below<(options.current?.scrollHeight??240)&&above>below);}}><summary className="ac-button" onClick={event=>{if(pending)event.preventDefault();}}>Manage appointment <span aria-hidden="true">⌄</span></summary><div className="ab-manage-options" ref={options}>
 <Link scroll={calendar?false:undefined} href={rescheduleHref} aria-disabled={pending||undefined} onClick={event=>{if(pending)event.preventDefault();}}>Reschedule appointment</Link>
 {!hasStarted&&<Link scroll={calendar?false:undefined} href={changeServiceHref} aria-disabled={pending||undefined} onClick={event=>{if(pending)event.preventDefault();}}>Change service</Link>}
 <form action={statusAction}>{statusFields}<button name="status" value="no_show" disabled={pending||!hasStarted}>Mark No-show{!hasStarted&&<span className="block text-xs font-normal">Available after the start time</span>}</button>{hasEnded&&<button name="status" value="completed" disabled={pending}>Mark Completed</button>}</form>
 <form action={cancelAction}><CalendarContextFields context={calendar}/><input type="hidden" name="appointmentId" value={id}/><input type="hidden" name="revision" value={revision}/><button disabled={pending} className="ab-cancel">{cancelPending?'Cancelling…':'Cancel appointment'}</button></form>
 </div></details></div>
 {(statusState.message||cancelState.message)&&<p role="alert">{statusState.message||cancelState.message}</p>}
 </>;
}
