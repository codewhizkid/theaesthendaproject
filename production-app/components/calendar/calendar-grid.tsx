'use client';
import {useCallback,useState,type MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import type {DaySchedule} from '@/lib/appointments/input';
import {layoutDay,calendarRange,dateLabel} from '@/lib/calendar/display';
import {shadePeriods,calendarMinute,type CalendarHours} from '@/lib/calendar/availability';
import {displayTime} from '@/lib/availability/time-display';
import type {CalendarBlock} from '@/lib/blocks/input';
import {CalendarEvent} from './calendar-event';
import {CalendarChangeDialog,type CalendarDraft} from './calendar-change-dialog';
import {BlockDialog,type BlockDraft} from './block-dialog';
import {EmptyTimeDialog} from './empty-time-dialog';
import './calendar.css';
export function CalendarGrid({days,today,calendar,onSelectTime,onChanged}:{onSelectTime?:(date:string,minute:number)=>void;onChanged?:()=>void;calendar:CalendarContext;days:(DaySchedule&{hours:CalendarHours;blocks:CalendarBlock[]})[];today:string}){
 const router=useRouter();
 const [bodies]=useState(()=>new Map<string,HTMLDivElement>());
 const [draft,setDraft]=useState<CalendarDraft|null>(null);
 const [blockDraft,setBlockDraft]=useState<BlockDraft|null>(null);
 const [empty,setEmpty]=useState<{date:string;minute:number}|null>(null);
 const [notice,setNotice]=useState('');
 const saved=useCallback(()=>{setDraft(null);setNotice('Appointment updated.');onChanged?.();router.refresh();},[router,onChanged]);
 const blockSaved=useCallback(()=>{setBlockDraft(null);setNotice('Blocked time updated.');onChanged?.();router.refresh();},[router,onChanged]);
 function bookTime(date:string,minute:number){if(onSelectTime)onSelectTime(date,minute);else router.push(calendarHref(calendar,'book',{date,minute:String(minute)}),{scroll:false});}
 function preserveEmptyTimeClick(event:MouseEvent<HTMLDivElement>){
  // Focusing a tall scrollable day can move the grid before click coordinates resolve.
  // Keep pointer clicks stable while retaining normal Tab/Enter keyboard access.
  if(event.button===0&&!(event.target as HTMLElement).closest('a,button,.ac-event,.ac-event-proxy'))event.preventDefault();
 }
 const layouts=days.map(day=>layoutDay(day.appointments));
 const baseRange=calendarRange(layouts);
 const allHours=days.flatMap(day=>[...day.hours.windows,...day.blocks.map(b=>({startMinute:b.startMinute,endMinute:b.endMinute}))]);
 const range={start:Math.min(baseRange.start,...allHours.map(w=>Math.floor(w.startMinute/60)*60)),end:Math.max(baseRange.end,...allHours.map(w=>Math.ceil(w.endMinute/60)*60))};
 const hours=Array.from({length:(range.end-range.start)/60+1},(_,i)=>range.start+i*60);
 const quarters=Array.from({length:(range.end-range.start)/15},(_,i)=>range.start+i*15);
 const height=range.end-range.start;
 return <>
  <div className="ac-scroll" tabIndex={0} role="region" aria-label={days.length===1?'Day calendar':'Week calendar; scroll horizontally to see all days'}>
   <div className={`ac-grid ${days.length>1?'ac-week':''}`} style={{gridTemplateColumns:`96px repeat(${days.length},minmax(0,1fr))`}}>
    <div className="ac-corner">Time</div>
    {days.map(day=><header className="ac-day-heading" key={day.date}><Link href={`/calendar?view=day&date=${day.date}`} aria-current={day.date===today?'date':undefined}>{dateLabel(day.date)}{day.date===today&&<span className="ac-today">Today</span>}</Link></header>)}
    <div className="ac-axis" style={{height}} aria-hidden="true">{hours.map(min=><span key={min} style={{top:min-range.start}}>{displayTime(min%1440)}</span>)}</div>
    {days.map((day,index)=><div key={day.date} className="ac-day-body" style={{height}} ref={element=>{if(element)bodies.set(day.date,element);else bodies.delete(day.date);}} tabIndex={0} role="group" aria-label={`${dateLabel(day.date,true)}. Press Enter to book an appointment or block time.`} onMouseDown={preserveEmptyTimeClick} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(onSelectTime)onSelectTime(day.date,540);else setEmpty({date:day.date,minute:540});}}} onClick={event=>{
     if((event.target as HTMLElement).closest('a,button,.ac-event,.ac-event-proxy'))return;
     const raw=range.start+event.clientY-event.currentTarget.getBoundingClientRect().top;
     if(onSelectTime)onSelectTime(day.date,calendarMinute(raw));else setEmpty({date:day.date,minute:calendarMinute(raw)});
    }}>
     {day.hours.windows.map(w=><div key={`working-${w.startMinute}`} className="ac-working-period" aria-hidden="true" style={{top:Math.max(w.startMinute,range.start)-range.start,height:Math.max(0,Math.min(w.endMinute,range.end)-Math.max(w.startMinute,range.start))}}/>)}
     {shadePeriods(day.hours).map(s=>{const top=Math.max(s.start,range.start),bottom=Math.min(s.end,range.end);return bottom>top?<div key={`${s.kind}-${s.start}`} className={`ac-shade ac-shade-${s.kind}`} style={{top:top-range.start,height:bottom-top}} aria-hidden="true">{bottom-top>=45&&<span>{s.kind==='unknown'?'Hours not set':s.kind==='break'?'Break':'Closed'}</span>}</div>:null;})}
     {quarters.map(min=><div aria-hidden="true" className={min%60===0?'ac-hour-line':'ac-quarter-line'} key={min} style={{top:min-range.start}}/>)}
     {day.blocks.map(b=><button type="button" className="ac-time-block" key={b.id} style={{top:b.startMinute-range.start,height:Math.max(2,b.endMinute-b.startMinute)}} onClick={()=>setBlockDraft({date:day.date,startMinute:b.startMinute,endMinute:b.endMinute,block:b})} aria-label={`Edit blocked time ${b.name}, ${displayTime(b.startMinute)}–${displayTime(b.endMinute)}`}><strong>{b.name}</strong><span>{displayTime(b.startMinute)}–{displayTime(b.endMinute)}</span></button>)}
     {layouts[index].map(item=><CalendarEvent onProcessing={bookTime} asOf={day.asOf} calendar={calendar} detailsHref={calendarHref(calendar,'appointment',{id:item.appointment.id})} key={`${item.appointment.id}-${item.appointment.revision}`} item={item} date={day.date} rangeStart={range.start} bodies={bodies} onChange={setDraft}/>)}
    </div>)}
   </div>
  </div>
  <footer className="ac-calendar-guide">
  <div className="ac-availability-legend" aria-label="Calendar shading legend"><span><i className="ac-working-key"/>Working hours</span><span><i className="ac-break-key"/>Break</span><span><i className="ac-closed-key"/>Closed</span></div>
  <p className="ac-help">Click an empty space to book an appointment or block time. Drag an appointment to move it, or its bottom-right corner to extend it.</p>
  </footer>
  <p role="status">{notice}</p>
  {empty&&<EmptyTimeDialog calendar={calendar} selection={empty} onClose={()=>setEmpty(null)} onBlock={minute=>{setBlockDraft({date:empty.date,startMinute:minute,endMinute:Math.min(1440,minute+30)});setEmpty(null);}}/>}
  {blockDraft&&<BlockDialog key={`${blockDraft.block?.id??'new'}-${blockDraft.date}`} onRepeat={setBlockDraft} draft={blockDraft} onClose={()=>setBlockDraft(null)} onSaved={blockSaved}/>}
  {draft&&<CalendarChangeDialog draft={draft} onClose={()=>setDraft(null)} onSaved={saved}/>}
 </>;
}
