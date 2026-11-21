import {parseAvailability} from './input.ts';
export type DatePeriod={startMinute:number;endMinute:number};
export type DateHours={date:string;revision:number;mode:'closed'|'custom'|'weekly';windows:DatePeriod[];timezone:string};
export type DateHoursInput={date:string;revision:number;weeklyRevision:number;requestKey:string;mode:DateHours['mode'];windows:DatePeriod[]};
export function parseDateHours(form:FormData):DateHoursInput{
 const date=String(form.get('date')??'');const revision=String(form.get('revision')??'');const weeklyRevision=String(form.get('weeklyRevision')??'');const mode=String(form.get('mode')??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2000-01-01'||date>'2100-12-31'||(!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Choose a valid date.');
 if(!/^\d{1,9}$/.test(revision)||!/^\d{1,9}$/.test(weeklyRevision)||!['closed','custom','weekly'].includes(mode))throw new Error('Reload the saved hours and try again.');
 let rows;const raw=String(form.get('windows')??'');if(raw.length>4000)throw new Error('Use at most 16 periods for this date.');
 try{rows=JSON.parse(raw);}catch{throw new Error('Check the special hours.');}
 if(!Array.isArray(rows)||rows.length>16||(mode==='custom'?rows.length===0:rows.length!==0))throw new Error('Add hours for a custom date, or choose closed or weekly hours.');
 const validate=new FormData();validate.set('actionVersion',String(form.get('actionVersion')??''));validate.set('requestKey',String(form.get('requestKey')??''));validate.set('revision',revision);validate.set('timezone','UTC');validate.set('windows',JSON.stringify(rows.map(w=>({...w,day:0}))));
 const checked=parseAvailability(validate);
 return {date,revision:Number(revision),weeklyRevision:Number(weeklyRevision),requestKey:checked.requestKey,mode:mode as DateHours['mode'],windows:checked.windows.map(({startMinute,endMinute})=>({startMinute,endMinute}))};
}
