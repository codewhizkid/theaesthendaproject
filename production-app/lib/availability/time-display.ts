export function timeParts(value:number){
 const hour=Math.floor((value%1440)/60);
 return {hour:hour%12||12,minute:value%60,period:hour>=12?'PM' as const:'AM' as const};
}
export function fromTimeParts(hour:number,minute:number,period:'AM'|'PM',end=false){
 const value=(hour%12+(period==='PM'?12:0))*60+minute;
 return end&&value===0?1440:value;
}
export function displayTime(value:number){
 const {hour,minute,period}=timeParts(value);
 return `${hour}:${String(minute).padStart(2,'0')} ${period}${value===1440?' (midnight)':''}`;
}
