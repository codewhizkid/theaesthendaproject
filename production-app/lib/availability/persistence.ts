import 'server-only';
import { checkedRuntime } from '@/lib/business/persistence';
import type { AvailabilityInput, WeeklySchedule } from './input';
export async function readAvailability(actorId: string): Promise<WeeklySchedule> {
 const db=await checkedRuntime();
 try { return (await db.query('select aesthenda_private.read_availability_v1($1::uuid) as result',[actorId])).rows[0].result; }
 finally { db.release(); }
}
export async function persistAvailability(actorId: string,input: AvailabilityInput): Promise<WeeklySchedule> {
 const db=await checkedRuntime();
 try { return (await db.query('select aesthenda_private.save_availability_v1($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb) as result',[actorId,input.requestKey,input.revision,input.timezone,JSON.stringify(input.windows)])).rows[0].result; }
 finally { db.release(); }
}

export async function readDateHours(actorId:string):Promise<import('./date-input').DateHours[]>{
 const db=await checkedRuntime();
 try{return (await db.query('select aesthenda_private.read_date_hours_v1($1::uuid) as result',[actorId])).rows[0].result;}finally{db.release();}
}
export async function persistDateHours(actorId:string,input:import('./date-input').DateHoursInput){
 const db=await checkedRuntime();
 try{await db.query('select aesthenda_private.save_date_hours_v1($1::uuid,$2::uuid,$3::date,$4::integer,$5::integer,$6::text,$7::jsonb)',[actorId,input.requestKey,input.date,input.revision,input.weeklyRevision,input.mode,JSON.stringify(input.windows)]);}finally{db.release();}
}
