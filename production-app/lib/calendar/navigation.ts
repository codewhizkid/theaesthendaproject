import {validDate,uuid} from '../appointments/input.ts';
export type CalendarContext={date:string;view:'day'|'week'};
export type AppointmentSearch={date?:string;client?:string;service?:string;q?:string;minute?:string;saved?:string;rescheduled?:string;section?:string;page?:string;returnAppointment?:string};
export type CalendarSearch=AppointmentSearch&{view?:string;calendarDate?:string;calendarView?:string;panel?:string;id?:string};
export function readCalendarContext(date:unknown,view:unknown):CalendarContext|undefined{
 return typeof date==='string'&&validDate(date)&&(view==='day'||view==='week')?{date,view}:undefined;
}
export function calendarHref(context:CalendarContext,panel?:'book'|'appointment'|'reschedule'|'client'|'newclient',fields:AppointmentSearch&{id?:string}={}){
 const params=new URLSearchParams({view:context.view});
 if(!panel){params.set('date',context.date);return `/calendar?${params}`;}
 params.set('calendarDate',context.date);params.set('panel',panel);
 for(const key of ['date','client','service','q','minute','saved','rescheduled','section','page','returnAppointment','id'] as const){const value=fields[key];if(typeof value==='string')params.set(key,value);}
 return `/calendar?${params}`;
}
export function calendarActionContext(form:FormData){return readCalendarContext(form.get('calendarDate'),form.get('calendarView'));}
export function calendarPanel(params:CalendarSearch){return params.panel==='book'||params.panel==='newclient'?params.panel:(params.panel==='appointment'||params.panel==='reschedule'||params.panel==='client')&&typeof params.id==='string'&&uuid(params.id)?params.panel:null;}
