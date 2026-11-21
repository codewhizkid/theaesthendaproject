import type {TimingStep} from '../appointments/input.ts';
import {validDate,uuid} from '../appointments/input.ts';
export type CalendarChange={id:string;revision:number;mode:'move'|'extend';date:string;minute:number;duration:number;step?:number};
export type CalendarPreview=CalendarChange&{oldStartAt:string;oldEndAt:string;startAt:string;endAt:string;timezone:string;priceCents:number;currency:string;reviewToken:string;timingPlan:TimingStep[]};
export type PreviewResult={message:string;preview:CalendarPreview|null};
export function parseCalendarChange(form:FormData):CalendarChange{
 const step=form.get('step');if(step!==null&&(!/^\d+$/.test(String(step))||Number(step)>19))throw new Error('Choose the step to extend.');
 const text=(key:string)=>String(form.get(key)??'');const id=text('id'),revision=text('revision'),mode=text('mode'),date=text('date'),minute=text('minute'),duration=text('duration');
 if(form.get('actionVersion')!=='1'||!uuid(id)||!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision))||Number(revision)<1||Number(revision)>2147483646||(mode!=='move'&&mode!=='extend')||!validDate(date)||!/^\d+$/.test(minute)||Number(minute)>1439||!/^\d+$/.test(duration)||Number(duration)<1||Number(duration)>1440)throw new Error('Check the date and time, or refresh the calendar.');
 return {id,revision:Number(revision),mode,date,minute:Number(minute),duration:Number(duration),...(step===null?{}:{step:Number(step)})};
}
export function gestureTime(start:number,duration:number,delta:number,mode:'move'|'extend'){
 const snapped=Math.round(delta/15)*15;
 return mode==='move'?{minute:Math.max(0,Math.min(Math.floor((1440-duration)/15)*15,Math.round((start+delta)/15)*15)),duration}:{minute:start,duration:Math.max(duration,Math.min(1440-start,duration+snapped))};
}
export function changeForm(change:CalendarChange){const form=new FormData();form.set('actionVersion','1');for(const [key,value]of Object.entries(change)){if(value!==undefined)form.set(key,String(value));};return form;}
