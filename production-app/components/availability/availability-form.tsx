'use client';
import {useActionState,useState} from 'react';
import {TimePicker} from './time-picker';
import {displayTime} from '@/lib/availability/time-display';
import {TimezonePicker,timezoneLabel} from './timezone-picker';
import {saveAvailability} from '@/app/availability/actions';
import {days,type WeeklySchedule,type AvailabilityWindow} from '@/lib/availability/input';
export function AvailabilityForm({schedule,requestKey,timezones}:{schedule:WeeklySchedule;requestKey:string;timezones:string[]}) {
 const [windows,setWindows]=useState(schedule.windows);
 const [state,action,pending]=useActionState(saveAvailability,{message:''});
 function change(index:number,part:'startMinute'|'endMinute',minute:number){setWindows(windows.map((w,i)=>i===index?{...w,[part]:minute}:w));}
 function add(day:number){
  const last=windows.filter(w=>w.day===day).at(-1);const start=last&&last.endMinute<=1380?last.endMinute:540;
  setWindows([...windows,{day,startMinute:start,endMinute:last&&start!==540?Math.min(start+60,1440):1020}]);
 }
 return <form action={action} className="space-y-6">
  <input type="hidden" name="actionVersion" value="1"/><input type="hidden" name="requestKey" value={requestKey}/><input type="hidden" name="revision" value={schedule.revision}/><input type="hidden" name="windows" value={JSON.stringify(windows)}/>
  <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
   <TimezonePicker saved={schedule.timezone} timezones={timezones}/>
   <p className="text-sm text-stone-600">Hours repeat in this time zone and stay at the same local clock time when daylight saving changes.</p>
   {days.map((day,index)=>{
    const rows=windows.map((w,i)=>({w,i})).filter(({w})=>w.day===index);
    return <fieldset className="space-y-3 border-t border-stone-200 pt-4" key={day}><legend className="pr-3 font-semibold">{day}</legend>
     {rows.length===0&&<p className="text-sm text-stone-600">Closed</p>}
     {rows.map(({w,i},row)=><div key={i} className="flex flex-wrap items-end gap-3"><TimePicker title="Start" label={`${day} period ${row+1} start`} value={w.startMinute} onChange={minute=>change(i,'startMinute',minute)}/><TimePicker title="End" label={`${day} period ${row+1} end`} value={w.endMinute} end onChange={minute=>change(i,'endMinute',minute)}/><button type="button" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" aria-label={`Remove ${day} period ${row+1}`} onClick={()=>setWindows(windows.filter((_,n)=>n!==i))}>Remove</button></div>)}
     <button type="button" disabled={windows.length>=56} className="rounded-lg border border-stone-300 px-3 py-2 text-sm" onClick={()=>add(index)}>Add hours<span className="sr-only"> for {day}</span></button>
    </fieldset>;
   })}
   <p className="text-sm text-stone-600">Add separate periods for breaks or split shifts. An end time of 12:00 AM means midnight at the end of that day. Split overnight hours across two days. Remove every period on a day to mark it closed.</p>
   <button className="rounded-lg bg-[#382b3c] px-5 py-3 text-white">{pending?'Saving…':'Save weekly hours'}</button>
  </fieldset>
  <p role="alert" className="text-sm">{state.message}</p>
  <button type="button" className="text-sm underline" onClick={()=>window.location.reload()}>Reload saved hours</button>
 </form>;
}
export function SavedHours({schedule,showHeading=true}:{schedule:WeeklySchedule;showHeading?:boolean}){
 return <div className="space-y-4">{showHeading&&<h2 className="font-serif text-2xl">Saved weekly hours</h2>}{schedule.revision===0?<p>No weekly hours saved yet.</p>:<><p className="text-sm">{schedule.timezone?timezoneLabel(schedule.timezone):''}</p><dl className="divide-y divide-stone-200">{days.map((day,index)=>{const rows:AvailabilityWindow[]=schedule.windows.filter(w=>w.day===index);return <div key={day} className="flex flex-wrap justify-between gap-3 py-3"><dt className="font-semibold">{day}</dt><dd>{rows.length?rows.map(w=>`${displayTime(w.startMinute)}–${displayTime(w.endMinute)}`).join(', '):'Closed'}</dd></div>;})}</dl></>}</div>;
}
