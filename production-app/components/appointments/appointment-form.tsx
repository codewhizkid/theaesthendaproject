'use client';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {useCalendarWorkspaceBusy} from '@/components/calendar/workspace-busy';
import type {CalendarContext} from '@/lib/calendar/navigation';
import {CalendarContextFields} from '@/components/calendar/context-fields';
import {useActionState,useState,useId,useEffect} from 'react';
import {bookAppointment,rescheduleAppointment} from '@/app/appointments/actions';
import type {SlotResult} from '@/lib/appointments/input';
import {displayTime} from '@/lib/availability/time-display';
export function AppointmentForm({requestKey,clientId,clientName,date,result,move,preferredMinute,calendar,compact=false,onPendingChange,onRefresh,onTimeChange}:{compact?:boolean;onRefresh?:()=>void;onTimeChange?:(minute:number)=>void;onPendingChange?:(pending:boolean)=>void;calendar?:CalendarContext;requestKey:string;clientId:string;clientName:string;date:string;result:SlotResult;preferredMinute?:number;move?:{id:string;revision:number;token:string}}){
 const formId=useId();
 const [state,action,pending]=useActionState(move?rescheduleAppointment:bookAppointment,{message:''});
 useCalendarWorkspaceBusy(pending);
 useEffect(()=>{onPendingChange?.(pending);return()=>onPendingChange?.(false);},[pending,onPendingChange]);
 const [minute,setMinute]=useState<number|null>(preferredMinute!==undefined&&result.slots.some(slot=>slot.minute===preferredMinute)?preferredMinute:null);
 const selected=result.slots.find(s=>s.minute===minute);
 // Prefer quarter-hour starts, retaining an explicitly chosen off-grid start.
 // Short windows with no quarter-hour fit still expose their actual valid times.
 const quarterHours=result.slots.filter(s=>s.minute%15===0||s.minute===preferredMinute);
 const suggested=quarterHours.length?quarterHours:result.slots;
 return <form id={formId} action={action} className="space-y-5"><CalendarContextFields context={calendar}/><input type="hidden" name="actionVersion" value="1"/><input type="hidden" name="requestKey" value={requestKey}/>{move&&<><input type="hidden" name="appointmentId" value={move.id}/><input type="hidden" name="revision" value={move.revision}/><input type="hidden" name="moveToken" value={move.token}/></>}<input type="hidden" name="clientId" value={clientId}/><input type="hidden" name="serviceId" value={result.service.id}/><input type="hidden" name="serviceToken" value={result.service.token}/><input type="hidden" name="startAt" value={selected?.startAt??''}/>
 {!compact&&<p><strong>{clientName}</strong><br/>{result.service.name} · {result.service.durationMinutes} min · {(result.service.priceCents/100).toLocaleString('en-US',{style:'currency',currency:result.service.currency})}<br/>{date} · {result.timezone.replaceAll('_',' ')}</p>}
 {result.slots.length===0?<p role="status">No available times for this service on this date. Choose another date or check your availability.</p>:<>
 <p className="text-sm text-stone-600">{result.timezone.replaceAll('_',' ')} · {result.service.durationMinutes} minutes</p>
 <div className="ab-times" role="group" aria-label="Available appointment start times">{suggested.map(slot=><button type="button" key={slot.startAt} disabled={pending} onClick={()=>{setMinute(slot.minute);onTimeChange?.(slot.minute);}} aria-pressed={slot.minute===minute} className="ab-time">{displayTime(slot.minute)}</button>)}</div>
 {selected?<p role="status" className="ab-time-summary">{displayTime(selected.minute)}–{displayTime(selected.minute+result.service.durationMinutes)}</p>:<p role="status" className="text-sm text-stone-600">Tap a time to select it.</p>}
 {selected&&((result.service.plan?.length??0)>1||result.service.plan?.some(step=>!step.occupied))&&<ol className="space-y-2 rounded-xl bg-[#f7f3ed] p-4" aria-label="Visit steps">{result.service.plan!.map((step,index)=><li key={index} className="text-sm"><strong>{step.label}</strong> · {displayTime(selected.minute+step.startOffset)}–{displayTime(selected.minute+step.startOffset+step.durationMinutes)}<span className="block text-stone-600">{step.occupied?'Hands-on / reserved':'Released processing · another client may fit here'}</span></li>)}</ol>}
 {!move&&!clientId&&<p className="text-sm text-stone-600">Choose a client before saving.</p>}
 <p className="text-sm text-stone-600">{move?'The original time stays reserved until you save.':'Availability is checked again when you save.'}</p>
 <PopupActions><button form={formId} disabled={pending||!selected||(!move&&!clientId)} className="min-h-11 rounded-lg bg-[#382b3c] px-5 py-3 text-white disabled:opacity-60">{pending?'Saving…':move?'Save new time':'Save appointment'}</button></PopupActions></>}
 {state.message&&<div><p role="alert">{state.message}</p>{onRefresh&&<button type="button" disabled={pending} className="ac-button mt-3" onClick={onRefresh}>Refresh times</button>}</div>}</form>;
}
