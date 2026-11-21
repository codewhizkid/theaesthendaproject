export type AvailabilityWindow = { day: number; startMinute: number; endMinute: number };
export type WeeklySchedule = { revision: number; timezone: string | null; windows: AvailabilityWindow[] };
export type AvailabilityInput = { requestKey: string; revision: number; timezone: string; windows: AvailabilityWindow[] };
export const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function clock(minute: number) {
 return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
export function parseAvailability(form: FormData): AvailabilityInput {
 const requestKey=String(form.get('requestKey')??'');
 const revision=String(form.get('revision')??'');
 const timezone=String(form.get('timezone')??'');
 if(form.get('actionVersion')!=='1'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)||!/^\d{1,9}$/.test(revision))throw new Error('Refresh this page before saving.');
 if(timezone.length>100||!(timezone==='UTC'||timezone.includes('/'))||timezone.startsWith('posix/')||timezone.startsWith('right/'))throw new Error('Choose a valid location time zone.');
 try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); }
 catch {throw new Error('Choose a valid location time zone.');}
 const raw=String(form.get('windows')??'');
 if(raw.length>10000)throw new Error('Too many working-hour periods.');
 let values;
 try { values=JSON.parse(raw); }catch {throw new Error('Check your working hours.');}
 if(!Array.isArray(values)||values.length>56)throw new Error('Use at most 56 working-hour periods per week.');
 const windows: AvailabilityWindow[]=values.map(w=>{
  if(!w||!Number.isInteger(w.day)||w.day<0||w.day>6||!Number.isInteger(w.startMinute)||!Number.isInteger(w.endMinute)||w.startMinute<0||w.startMinute>1439||w.endMinute<1||w.endMinute>1440||w.startMinute>=w.endMinute)throw new Error('Each period must finish after it starts. Split overnight hours across two days.');
  return {day:w.day,startMinute:w.startMinute,endMinute:w.endMinute};
 }).sort((a,b)=>a.day-b.day||a.startMinute-b.startMinute);
 for(let i=1;i<windows.length;i++)if(windows[i].day===windows[i-1].day&&windows[i].startMinute<windows[i-1].endMinute)throw new Error('Working-hour periods on the same day cannot overlap.');
 return {requestKey,revision:Number(revision),timezone,windows};
}
