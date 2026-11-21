'use client';
import {useState} from 'react';
import type {CalendarContext} from '@/lib/calendar/navigation';
import {validDate} from '@/lib/appointments/input';
import {AppointmentForm} from './appointment-form';
import {useAvailableTimes} from './use-available-times';
export function ReschedulePicker({id,initialDate,clientName,calendar,requestKey:initialKey}:{id:string;initialDate:string;clientName:string;calendar?:CalendarContext;requestKey:string}){
 const [date,setDate]=useState(initialDate);const [saving,setSaving]=useState(false);const [requestKey,setRequestKey]=useState(initialKey);
 const times=useAvailableTimes('reschedule',id,date);
 return <div className="space-y-5"><label className="block font-semibold">New date<input type="date" value={date} disabled={saving} required min="2000-01-01" max="2100-12-31" className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2" onChange={event=>{setDate(event.target.value);setRequestKey(crypto.randomUUID());}}/></label><h2 className="font-serif text-2xl">Available times</h2>{!validDate(date)?<p role="status">Choose a valid date.</p>:times.loading?<p role="status" className="ab-loading">Checking availability…</p>:times.message?<p role="alert">{times.message} <button className="ac-button" onClick={times.retry}>Try again</button></p>:times.result&&typeof times.result.revision==='number'&&times.result.moveToken&&<AppointmentForm compact onRefresh={times.retry} onPendingChange={setSaving} calendar={calendar} key={`${date}-${times.result.revision}`} requestKey={requestKey} clientId="" clientName={clientName} date={date} result={times.result} move={{id,revision:times.result.revision,token:times.result.moveToken}}/>}</div>;
}
