'use client';
import {useActionState} from 'react';
import {retryAppointmentEmail} from '@/app/appointments/actions';
export function AppointmentEmailRetry({appointmentId}:{appointmentId:string}){
 const [state,action,pending]=useActionState(retryAppointmentEmail,{message:''});
 return <form action={action} className="mt-3 space-y-2"><input type="hidden" name="appointmentId" value={appointmentId}/><button disabled={pending} className="ac-button">{pending?'Checking…':'Retry confirmation email'}</button>{state.message&&<p role="status" className="text-sm">{state.message}</p>}</form>;
}
