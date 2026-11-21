export type CalendarHours={source:'weekly'|'closed'|'custom';timezone:string|null;windows:{startMinute:number;endMinute:number}[]};
export type ShadePeriod={start:number;end:number;kind:'closed'|'break'|'unknown'};
// Display complement of the server's effective hours; no booking eligibility logic.
export function shadePeriods(hours:CalendarHours):ShadePeriod[]{
 if(!hours.timezone)return [{start:0,end:1440,kind:'unknown'}];
 const windows=[...hours.windows].sort((a,b)=>a.startMinute-b.startMinute);if(windows.length===0)return [{start:0,end:1440,kind:'closed'}];
 const shades:ShadePeriod[]=[];let cursor=0;
 windows.forEach((window,index)=>{if(window.startMinute>cursor)shades.push({start:cursor,end:window.startMinute,kind:index===0?'closed':'break'});cursor=Math.max(cursor,window.endMinute);});
 if(cursor<1440)shades.push({start:cursor,end:1440,kind:'closed'});return shades;
}
export function parsePreferredMinute(value:unknown):number|null{return typeof value==='string'&&/^\d{1,4}$/.test(value)&&Number(value)<=1439?Number(value):null;}
export function calendarMinute(raw:number):number{
 return Number.isFinite(raw)?Math.max(0,Math.min(1425,Math.floor(raw/15)*15)):540;
}
