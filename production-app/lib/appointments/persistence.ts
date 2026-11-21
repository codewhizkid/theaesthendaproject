import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import type {AppointmentInput,DaySchedule,SlotResult} from './input';
export async function readAppointments(actor:string,date:string|null=null,id:string|null=null):Promise<DaySchedule>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_appointments_v1($1::uuid,$2::date,$3::uuid) as result',[actor,date,id])).rows[0].result;}finally{db.release();}
}
export async function readSlots(actor:string,service:string,date:string,clientId:string|null=null):Promise<SlotResult>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.appointment_slots_v2($1::uuid,$2::uuid,$3::date,$4::uuid) as result',[actor,service,date,clientId])).rows[0].result;}finally{db.release();}
}
export async function createAppointment(actor:string,input:AppointmentInput):Promise<string>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.create_owner_appointment_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::timestamptz,$6::text) as result',[actor,input.requestKey,input.clientId,input.serviceId,input.startAt,input.serviceToken])).rows[0].result;}finally{db.release();}
}
export async function cancelAppointmentRecord(actor:string,id:string,revision:number){const db=await checkedRuntime();try{await db.query('select aesthenda_private.cancel_appointment_v1($1::uuid,$2::uuid,$3::integer)',[actor,id,revision]);}finally{db.release();}}
export async function readRescheduleSlots(actor:string,id:string,date:string):Promise<SlotResult&{revision:number;moveToken:string}>{
 const db=await checkedRuntime();try{const result=(await db.query('select aesthenda_private.reschedule_slots_v1($1::uuid,$2::uuid,$3::date) as result',[actor,id,date])).rows[0].result;return {...result,service:{...result.service,token:result.moveToken}};}finally{db.release();}
}
export async function rescheduleAppointmentRecord(actor:string,input:import('./input').RescheduleInput):Promise<string>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.reschedule_appointment_v1($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::timestamptz,$6::text) as result',[actor,input.requestKey,input.appointmentId,input.revision,input.startAt,input.moveToken])).rows[0].result;}finally{db.release();}
}
export async function readCalendar(actor:string,dates:string[]):Promise<{processingEnabled:boolean;days:(DaySchedule&{hours:import('@/lib/calendar/availability').CalendarHours;blocks:import('@/lib/blocks/input').CalendarBlock[]})[];undo:{id:string;label:string}|null}>{
 const db=await checkedRuntime();
 try{
  // One consistent snapshot prevents a concurrent move appearing on both days.
  await db.query('begin isolation level repeatable read read only');
  const result=await db.query('select aesthenda_private.read_appointments_v1($1::uuid,d) as result, aesthenda_private.effective_date_hours_v1($1::uuid,d) as hours, aesthenda_private.read_blocks_v1($1::uuid,d) as blocks from unnest($2::date[]) with ordinality dates(d,n) order by n',[actor,dates]);
  const undo=(await db.query('select aesthenda_private.read_calendar_undo_v1($1::uuid) as result',[actor])).rows[0].result;
  const preferences=(await db.query('select aesthenda_private.read_booking_preferences_v2($1::uuid) as result',[actor])).rows[0].result;
  await db.query('commit');return {processingEnabled:preferences.processingEnabled,days:result.rows.map(row=>({...row.result,hours:row.hours,blocks:row.blocks})),undo};
 }catch(error){await db.query('rollback');throw error;}finally{db.release();}
}

export async function readClientAppointments(actor:string,id:string,group:'previous'|'upcoming',page=0):Promise<{appointments:import('./input').Appointment[];hasMore:boolean}>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_client_appointments_v1($1::uuid,$2::uuid,$3::text,$4::integer) as result',[actor,id,group,page])).rows[0].result;}finally{db.release();}
}
export async function setAppointmentStatus(actor:string,key:string,id:string,revision:number,status:string){
 const db=await checkedRuntime();try{await db.query('select aesthenda_private.set_appointment_status_v1($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text)',[actor,key,id,revision,status]);}finally{db.release();}
}

export async function readAppointmentNeighbors(actor:string,id:string):Promise<{previous?:import('./input').Appointment;upcoming?:import('./input').Appointment}>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_appointment_neighbors_v1($1::uuid,$2::uuid) as result',[actor,id])).rows[0].result;}finally{db.release();}
}
