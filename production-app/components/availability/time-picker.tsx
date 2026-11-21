'use client';
import {timeParts,fromTimeParts} from '@/lib/availability/time-display';
export function TimePicker({label,title,value,end=false,minuteStep=1,wheel=false,onChange}:{wheel?:boolean;minuteStep?:1|15;label:string;title:string;value:number;end?:boolean;onChange:(minute:number)=>void}){
 const parts=timeParts(value);const minutes=Array.from(new Set([...Array.from({length:60/minuteStep},(_,i)=>i*minuteStep),parts.minute])).sort((a,b)=>a-b);const field='min-h-11 rounded-lg border border-stone-300 bg-white px-2 py-2 text-stone-900';
 return <fieldset className="space-y-2 ac-time-picker"><legend>{title}</legend><div className={`ac-time-fields ${wheel?'ac-time-wheel':''}`}>
  <select size={wheel?3:undefined} className={field} aria-label={`${label} hour`} value={parts.hour} onChange={e=>onChange(fromTimeParts(Number(e.target.value),parts.minute,parts.period,end))}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select>
  <span aria-hidden="true">:</span>
  <select size={wheel?3:undefined} className={field} aria-label={`${label} minute`} value={parts.minute} onChange={e=>onChange(fromTimeParts(parts.hour,Number(e.target.value),parts.period,end))}>{minutes.map(i=><option value={i} key={i}>{String(i).padStart(2,'0')}</option>)}</select>
  <select size={wheel?2:undefined} className={`${field} ac-time-period`} aria-label={`${label} AM or PM`} value={parts.period} onChange={e=>onChange(fromTimeParts(parts.hour,parts.minute,e.target.value as 'AM'|'PM',end))}><option>AM</option><option>PM</option></select>
 </div>{wheel&&<p className="ac-time-caption" aria-live="polite">{parts.hour}:{String(parts.minute).padStart(2,'0')} {parts.period}</p>}</fieldset>;
}
