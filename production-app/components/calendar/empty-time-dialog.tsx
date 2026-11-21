'use client';
import {useEffect,useRef,useState} from 'react';
import {DialogActionLayout,PopupActions} from './dialog-actions';
import Link from 'next/link';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import {dateLabel} from '@/lib/calendar/display';
import {TimePicker} from '@/components/availability/time-picker';
export function EmptyTimeDialog({selection,onClose,onBlock,calendar}:{calendar:CalendarContext;selection:{date:string;minute:number};onClose:()=>void;onBlock:(minute:number)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [minute,setMinute]=useState(selection.minute);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="ac-dialog" aria-labelledby="empty-time-title" onCancel={event=>{event.preventDefault();onClose();}}><DialogActionLayout onClose={onClose}><h2 id="empty-time-title">Add to calendar</h2><p>{dateLabel(selection.date,true)}</p><TimePicker wheel minuteStep={15} title="Start time" label="Calendar selection" value={minute} onChange={setMinute}/><PopupActions><Link className="ac-button ac-primary" href={calendarHref(calendar,'book',{date:selection.date,minute:String(minute)})} onClick={onClose} scroll={false}>Book appointment</Link><button className="ac-button" onClick={()=>onBlock(minute)}>Block time</button></PopupActions></DialogActionLayout></dialog>;
}
