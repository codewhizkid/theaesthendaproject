'use client';
import {useCallback,useEffect,useState} from 'react';
import {loadBookingDay} from '@/app/appointments/lookup-actions';
import {CalendarGrid} from '@/components/calendar/calendar-grid';
import {validDate} from '@/lib/appointments/input';
import {dateLabel,localDate} from '@/lib/calendar/display';
export function BookingDayCalendar({date,onSelectTime,disabled}:{date:string;onSelectTime:(date:string,minute:number)=>void;disabled:boolean}){
 const [retry,setRetry]=useState(0);const key=`${date}-${retry}`;const [response,setResponse]=useState<{key:string;data:Awaited<ReturnType<typeof loadBookingDay>>}|null>(null);const refresh=useCallback(()=>setRetry(value=>value+1),[]);
 useEffect(()=>{if(!validDate(date))return;let active=true;loadBookingDay(date).then(data=>{if(active)setResponse({key,data});}).catch(()=>{if(active)setResponse({key,data:{day:null,processingEnabled:false,message:'Could not load this day. Try again.'}});});return()=>{active=false;};},[date,key]);
 const current=response?.key===key?response.data:null;
 return <aside className="ab-booking-day space-y-4 rounded-2xl border border-stone-200 bg-white p-4" inert={disabled}><h2 className="text-2xl font-semibold">Your day</h2><p>{validDate(date)?dateLabel(date,true):'Choose a date'}</p><p className="text-sm text-stone-600">Tap an empty time or a processing gap to select a start for this booking.</p>{!current?<p role="status">Loading the day…</p>:current.day?<CalendarGrid key={date} calendar={{date,view:'day'}} today={localDate(current.day.asOf,current.day.timezone??'UTC')} days={[current.day]} onSelectTime={onSelectTime} onChanged={refresh}/>:<p role="alert">{current.message} <button type="button" className="underline" onClick={refresh}>Try again</button></p>}</aside>;
}
