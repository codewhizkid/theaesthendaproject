export const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='2100-12-31'&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export type AppointmentInput={requestKey:string;clientId:string;serviceId:string;startAt:string;serviceToken:string};
export type TimingStep={serviceSegmentId:string;label:string;kind:'active'|'processing';durationMinutes:number;occupied:boolean;startOffset:number};
export type AppointmentSegment={index:number;label:string;kind:'active'|'processing';occupied:boolean;durationMinutes:number;startAt:string;endAt:string};
export type Appointment={segments?:AppointmentSegment[];id:string;clientId?:string;clientName:string;serviceName:string;priceCents:number;currency:string;startAt:string;endAt:string;status:string;timezone:string;revision:number;source:string};
export type DaySchedule={asOf:string;date:string;timezone:string|null;appointments:Appointment[]};
export type SlotResult={timezone:string;service:{id:string;name:string;durationMinutes:number;priceCents:number;currency:string;token:string;plan?:TimingStep[]};slots:{startAt:string;minute:number}[]};
export function parseAppointment(form:FormData):AppointmentInput {
 const text=(name:string)=>String(form.get(name)??'');
 const requestKey=text('requestKey'),clientId=text('clientId'),serviceId=text('serviceId'),startAt=text('startAt'),serviceToken=text('serviceToken');
 if(form.get('actionVersion')!=='1'||![requestKey,clientId,serviceId].every(uuid)||!/^[0-9a-f]{32}$/.test(serviceToken))throw new Error('Choose a client, service, and available time again.');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(startAt)||!Number.isFinite(Date.parse(startAt)))throw new Error('Choose an available start time.');
 return {requestKey,clientId,serviceId,startAt:new Date(startAt).toISOString(),serviceToken};
}
export function appointmentTime(a:Appointment){const fmt=new Intl.DateTimeFormat('en-US',{timeZone:a.timezone,hour:'numeric',minute:'2-digit',hour12:true});return `${fmt.format(new Date(a.startAt))}–${fmt.format(new Date(a.endAt))}`;}
export function appointmentDate(a:Appointment){return new Intl.DateTimeFormat('en-US',{timeZone:a.timezone,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(a.startAt));}
export type RescheduleInput={requestKey:string;appointmentId:string;revision:number;startAt:string;moveToken:string};
export function parseReschedule(form:FormData):RescheduleInput{
 const text=(name:string)=>String(form.get(name)??'');
 const requestKey=text('requestKey'),appointmentId=text('appointmentId'),rawRevision=text('revision'),startAt=text('startAt'),moveToken=text('moveToken');
 if(form.get('actionVersion')!=='1'||![requestKey,appointmentId].every(uuid)||!/^\d+$/.test(rawRevision)||!Number.isSafeInteger(Number(rawRevision))||Number(rawRevision)<1||Number(rawRevision)>2147483646||!/^[0-9a-f]{32}$/.test(moveToken))throw new Error('Refresh this appointment and choose an available time again.');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(startAt)||!Number.isFinite(Date.parse(startAt)))throw new Error('Choose an available start time.');
 return {requestKey,appointmentId,revision:Number(rawRevision),startAt:new Date(startAt).toISOString(),moveToken};
}
