/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
'use client';
import {useActionState,useState,useId} from 'react';
import {changeAppointmentService} from '@/app/appointments/actions';
import {CalendarContextFields} from '@/components/calendar/context-fields';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {useCalendarWorkspaceBusy} from '@/components/calendar/workspace-busy';
import type {CalendarContext} from '@/lib/calendar/navigation';
import type {Appointment} from '@/lib/appointments/input';
import type {Service} from '@/lib/services/input';
import {validDate} from '@/lib/appointments/input';
import {displayTime} from '@/lib/availability/time-display';
import {useServiceChangeTimes} from './use-service-change-times';

export function ChangeServicePicker({appointment,services,initialDate,calendar,requestKey:initialKey}:{appointment:Appointment;services:Service[];initialDate:string;calendar?:CalendarContext;requestKey:string}){
 const [date,setDate]=useState(initialDate);const [serviceId,setServiceId]=useState('');const [minute,setMinute]=useState<number|null>(null);const [requestKey,setRequestKey]=useState(initialKey);
 const [state,action,pending]=useActionState(changeAppointmentService,{message:''});useCalendarWorkspaceBusy(pending);
 const formId=useId();
 const times=useServiceChangeTimes(appointment.id,serviceId,date);
 const options=services.filter(service=>service.status==='draft');
 const result=times.result&&typeof times.result.revision==='number'&&times.result.changeToken?times.result:null;
 const currentDate=new Intl.DateTimeFormat('en-CA',{timeZone:appointment.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(appointment.startAt));
 const selected=result?.slots.find(slot=>slot.minute===minute)||(minute===null&&date===currentDate?result?.slots.find(slot=>slot.startAt===appointment.startAt):undefined);const quarterHours=result?.slots.filter(slot=>slot.minute%15===0)||[];const suggested=quarterHours.length?quarterHours:(result?.slots??[]);
 const reset=()=>{setMinute(null);setRequestKey(crypto.randomUUID());};
 return <div className="space-y-5">
  <section className="rounded-lg bg-[#f7f3ed] p-4"><h2 className="font-semibold">Current appointment</h2><p>{appointment.clientName} · {appointment.serviceName}<br/>{new Intl.DateTimeFormat('en-US',{timeZone:appointment.timezone,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(appointment.startAt))} · {new Intl.DateTimeFormat('en-US',{timeZone:appointment.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(appointment.startAt))} · {Math.round((Date.parse(appointment.endAt)-Date.parse(appointment.startAt))/60000)} minutes<br/>{appointment.timezone.replaceAll('_',' ')}</p></section>
  {options.length===0?<p role="status">There are no active services to switch to. Add a service in your service catalog, then try again.</p>:<>
   <label className="block font-semibold">New service<select value={serviceId} disabled={pending} required className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2" onChange={event=>{setServiceId(event.target.value);reset();}}><option value="">Choose a different service</option>{options.map(item=><option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min · {(item.priceCents/100).toLocaleString('en-US',{style:'currency',currency:item.currency})}</option>)}</select></label>
   <label className="block font-semibold">Date<input type="date" value={date} disabled={pending} required min="2000-01-01" max="2100-12-31" className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2" onChange={event=>{setDate(event.target.value);reset();}}/></label>
   {!serviceId?<p className="text-sm text-stone-600">Choose a service to see times that fit your schedule.</p>:!validDate(date)?<p role="status">Choose a valid date.</p>:times.loading?<p role="status" className="ab-loading">Checking availability…</p>:times.message?<p role="alert">{times.message} <button className="ac-button" onClick={times.retry}>Try again</button></p>:result&&<>
    <h2 className="font-serif text-2xl">Available times</h2><p className="text-sm text-stone-600">{result.timezone.replaceAll('_',' ')} · {result.service.durationMinutes} minutes</p>
    {result.slots.length===0?<p role="status">No available times for this service on this date. Choose another date or check your availability.</p>:<>
     <form id={formId} action={action} className="space-y-5"><CalendarContextFields context={calendar}/><input type="hidden" name="actionVersion" value="1"/><input type="hidden" name="requestKey" value={requestKey}/><input type="hidden" name="appointmentId" value={appointment.id}/><input type="hidden" name="revision" value={result.revision}/><input type="hidden" name="serviceId" value={result.service.id}/><input type="hidden" name="changeToken" value={result.changeToken}/><input type="hidden" name="startAt" value={selected?.startAt??''}/>
      <div className="ab-times" role="group" aria-label="Available appointment start times">{suggested.map(slot=><button type="button" key={slot.startAt} disabled={pending} onClick={()=>{setMinute(slot.minute);setRequestKey(crypto.randomUUID());}} aria-pressed={slot.startAt===selected?.startAt} className="ab-time">{displayTime(slot.minute)}</button>)}</div>
      {selected?<section className="rounded-lg border border-stone-200 bg-white p-4"><h3 className="font-semibold">Review the change</h3><p className="mt-2">{appointment.serviceName} → {result.service.name}<br/>{new Intl.DateTimeFormat('en-US',{timeZone:result.timezone,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(selected.startAt))}<br/>{displayTime(selected.minute)}–{displayTime(selected.minute+result.service.durationMinutes)} · {result.service.durationMinutes} minutes<br/>{(appointment.priceCents/100).toLocaleString('en-US',{style:'currency',currency:appointment.currency})} → {(result.service.priceCents/100).toLocaleString('en-US',{style:'currency',currency:result.service.currency})}</p></section>:<p role="status" className="text-sm text-stone-600">Tap a time to review the service, price, and duration before saving.</p>}
      <p className="text-sm text-stone-600">The calendar is checked again when you save. No payment is processed; contact your client about the service change.</p>
      <PopupActions><button form={formId} disabled={pending||!selected} className="min-h-11 rounded-lg bg-[#382b3c] px-5 py-3 text-white disabled:opacity-60">{pending?'Saving…':'Save service change'}</button></PopupActions>
      {state.message&&<div><p role="alert">{state.message}</p><button type="button" disabled={pending} className="ac-button mt-3" onClick={times.retry}>Refresh times</button></div>}
     </form>
    </>}
   </>}
  </>}
 </div>;
}
