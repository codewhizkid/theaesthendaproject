import type {DaySchedule} from '../appointments/input.ts';
export function dashboardOverview(schedule:DaySchedule){
 const now=Date.parse(schedule.asOf);
 const visits=schedule.appointments.filter(a=>a.status!=='cancelled').sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)||a.id.localeCompare(b.id));
 const remaining=visits.filter(a=>['pending','confirmed'].includes(a.status)&&Date.parse(a.endAt)>now);
 const pending=visits.filter(a=>a.status==='pending');
 const completed=visits.filter(a=>a.status==='completed').length;
 const values=new Map<string,number>();
 for(const a of visits){if(a.status==='no_show'||!Number.isSafeInteger(a.priceCents)||a.priceCents<0)continue;values.set(a.currency,(values.get(a.currency)||0)+a.priceCents);}
 const serviceValue=[...values].map(([currency,cents])=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:cents%100===0?0:2}).format(cents/100)).join(' + ');
 const next=remaining[0];
 return {visits,remaining,pending,completed,serviceValue:serviceValue||'—',next,inProgress:!!next&&Date.parse(next.startAt)<=now};
}
