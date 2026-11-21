export const visibilityPercentages=[20,50,80,100] as const;
export type VisibilityPercent=typeof visibilityPercentages[number];
export function isVisibilityPercent(value:number):value is VisibilityPercent{return visibilityPercentages.some(percent=>percent===value);}
export type ClientBookingVisibility={showPercent:VisibilityPercent;revision:number;available:boolean};
// This only narrows canonical eligible starts. It never authorizes a booking.
// Use salon-local :00/:30 starts, then deterministic, evenly distributed buckets.
export function visibleClientSlots<T extends {startAt:string;minute:number}>(slots:readonly T[],percent:VisibilityPercent):T[]{
 if(!isVisibilityPercent(percent))throw new Error('Choose 20%, 50%, 80%, or 100%.');
 const seen=new Set<string>();
 const eligible=[...slots].filter(slot=>Number.isInteger(slot.minute)&&slot.minute>=0&&slot.minute<1440&&slot.minute%30===0).sort((a,b)=>a.startAt.localeCompare(b.startAt)).filter(slot=>{if(seen.has(slot.startAt))return false;seen.add(slot.startAt);return true;});
 const count=Math.ceil(eligible.length*percent/100);
 if(count===eligible.length)return eligible;
 return Array.from({length:count},(_,index)=>eligible[Math.floor((index+.5)*eligible.length/count)]);
}
