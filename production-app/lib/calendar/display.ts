import type {Appointment} from '../appointments/input';
export function shiftDate(date:string,days:number){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function weekDates(date:string){const dow=new Date(date+'T12:00:00Z').getUTCDay();const first=shiftDate(date,-dow);return Array.from({length:7},(_,i)=>shiftDate(first,i));}
export function dateLabel(date:string,long=false){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:long?'long':'short',month:long?'long':'short',day:'numeric',...(long?{year:'numeric'}:{})}).format(new Date(date+'T12:00:00Z'));}
export function localDate(instant:string,zone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));const get=(type:string)=>parts.find(p=>p.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
function minute(instant:string,zone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));return Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);}
export type CalendarItem={appointment:Appointment;start:number;end:number;column:number;columns:number};
// Presentation geometry only. This never calculates booking eligibility.
export function layoutDay(appointments:Appointment[]):CalendarItem[]{
 const items=appointments.filter(a=>a.status!=='cancelled').map(a=>{const start=minute(a.startAt,a.timezone),endDate=localDate(a.endAt,a.timezone),startDate=localDate(a.startAt,a.timezone);const wallEnd=endDate>startDate?1440:minute(a.endAt,a.timezone);return {appointment:a,start,end:Math.min(1440,Math.max(start+1,wallEnd)),column:0,columns:1};}).sort((a,b)=>a.start-b.start||a.end-b.end||a.appointment.id.localeCompare(b.appointment.id));
 let group:CalendarItem[]=[];let ends:number[]=[];let groupEnd=-1;
 function finish(){for(const item of group)item.columns=ends.length;group=[];ends=[];}
 for(const item of items){if(item.start>=groupEnd){finish();groupEnd=-1;}let column=ends.findIndex(end=>end<=item.start);if(column<0)column=ends.length;ends[column]=item.end;item.column=column;group.push(item);groupEnd=Math.max(groupEnd,item.end);}finish();return items;
}
export function calendarRange(days:CalendarItem[][]){const all=days.flat();return {start:Math.min(8, ...all.map(a=>Math.floor(a.start/60)))*60,end:Math.min(1440,Math.max(20,...all.map(a=>Math.ceil(a.end/60)))*60)};}
