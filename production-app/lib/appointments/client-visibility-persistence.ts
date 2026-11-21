import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import type {ClientBookingVisibility,VisibilityPercent} from './client-visibility';
export async function readClientBookingVisibility(actor:string):Promise<ClientBookingVisibility>{
 const db=await checkedRuntime();try{const result=(await db.query('select aesthenda_private.read_client_booking_visibility_v1($1::uuid) as result',[actor])).rows[0].result;return {...result,available:true};}
 catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='42883')return {showPercent:100,revision:0,available:false};throw error;}finally{db.release();}
}
export async function saveClientBookingVisibility(actor:string,revision:number,percent:VisibilityPercent){const db=await checkedRuntime();try{await db.query('select aesthenda_private.save_client_booking_visibility_v1($1::uuid,$2::integer,$3::integer)',[actor,revision,percent]);}finally{db.release();}}
