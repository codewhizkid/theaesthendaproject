import 'server-only';
import { checkedRuntime } from '@/lib/business/persistence';
import type { Service, ServiceInput } from './input';
export async function readServices(actorId: string, serviceId: string | null = null): Promise<Service[]> {
  const db=await checkedRuntime();
  try { return (await db.query('select aesthenda_private.read_services_v1($1::uuid,$2::uuid) as result',[actorId,serviceId])).rows[0].result; }
  finally { db.release(); }
}
export async function saveService(actorId: string,input: ServiceInput): Promise<string> {
  const db=await checkedRuntime();
  try { return (await db.query('select aesthenda_private.save_service_v3($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::text,$7::bigint,$8::jsonb,$9::text) as result',[actorId,input.requestKey,input.id,input.revision,input.name,input.description,input.priceCents,JSON.stringify(input.steps),input.serviceType])).rows[0].result; }
  finally { db.release(); }
}
export async function archiveServiceRecord(actorId: string,id: string) {
  const db=await checkedRuntime();
  try { await db.query('select aesthenda_private.archive_service_v1($1::uuid,$2::uuid)',[actorId,id]); }
  finally { db.release(); }
}

export async function setServiceDeleted(actor:string,id:string,revision:number,deleted:boolean){const db=await checkedRuntime();try{await db.query('select aesthenda_private.set_service_deleted_v1($1::uuid,$2::uuid,$3::integer,$4::boolean)',[actor,id,revision,deleted]);}finally{db.release();}}
