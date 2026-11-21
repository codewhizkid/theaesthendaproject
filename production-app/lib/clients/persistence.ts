import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import type {ClientInput,ClientRecord} from './input';
export async function readClients(actor:string,id:string|null=null,search='',page=0,deleted=false):Promise<{clients:ClientRecord[];hasMore:boolean}> {
 const db=await checkedRuntime();
 try{try{return (await db.query('select aesthenda_private.read_clients_v2($1::uuid,$2::uuid,$3::text,$4::integer,$5::boolean) as result',[actor,id,search,page,deleted])).rows[0].result;}catch(error){
  // Preserve owner-scoped reads while an additive migration awaits approval.
  if(!(error instanceof Error)||!('code' in error)||error.code!=='42883'||!error.message.includes('read_clients_v2'))throw error;
  if(deleted)return {clients:[],hasMore:false};
  return (await db.query('select aesthenda_private.read_clients_v1($1::uuid,$2::uuid,$3::text,$4::integer) as result',[actor,id,search,page])).rows[0].result;
 }}
 finally{db.release();}
}
export async function saveClient(actor:string,input:ClientInput):Promise<string> {
 const db=await checkedRuntime();
 try{return (await db.query('select aesthenda_private.save_client_v2($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text) as result',[actor,input.requestKey,input.id,input.revision,input.firstName,input.lastName,input.email,input.phone,input.notes,JSON.stringify(input.preferences),input.consentMethod])).rows[0].result;}
 finally{db.release();}
}

export async function clientContactMatches(actor:string,email:string,phone:string,key?:string):Promise<{id:string;name:string}[]>{
 const db=await checkedRuntime();try{return (await db.query(key?'select aesthenda_private.client_contact_matches_v1($1::uuid,$2::text,$3::text,$4::uuid) as result':'select aesthenda_private.client_contact_matches_v1($1::uuid,$2::text,$3::text) as result',key?[actor,email,phone,key]:[actor,email,phone])).rows[0].result;}finally{db.release();}
}

export async function setClientDeleted(actor:string,id:string,revision:number,deleted:boolean){const db=await checkedRuntime();try{await db.query('select aesthenda_private.set_client_deleted_v1($1::uuid,$2::uuid,$3::integer,$4::boolean)',[actor,id,revision,deleted]);}finally{db.release();}}
