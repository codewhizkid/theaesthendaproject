import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import {guestMailConfig} from '@/lib/guest-booking/resend-transport';
import {sendBookingConfirmation,type ConfirmationFacts} from '@/lib/guest-booking/confirmation-transport';
type OwnerMessage={state:string;id:string;lease:string;email:string;payload:ConfirmationFacts};
async function messageOperation(actor:string,id:string,action:'status'|'claim'|'result',data:Record<string,unknown>={}):Promise<OwnerMessage>{
 const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.owner_booking_message_v1($1::uuid,$2::uuid,$3::text,$4::jsonb) as result',[actor,id,action,JSON.stringify(data)])).rows[0].result;}finally{db.release();}
}
export async function readOwnerBookingEmailStatus(actor:string,id:string):Promise<string>{return (await messageOperation(actor,id,'status')).state;}
export async function dispatchOwnerBookingConfirmation(actor:string,id:string){
 // A saved appointment stays saved even when the provider or status write fails.
 if(process.env.AESTHENDA_APPOINTMENT_EMAIL_READY!=='1')return;
 const config=guestMailConfig({...process.env,AESTHENDA_GUEST_EMAIL_READY:'1'});if(!config)return;
 try{
  const message=await messageOperation(actor,id,'claim');if(message.state!=='claimed')return;
  const result=await sendBookingConfirmation(config,message);if(result.status==='setup_required')return;
  await messageOperation(actor,id,'result',{lease:message.lease,state:result.status,providerId:result.messageId});
 }catch{/* Durable queue plus the same provider idempotency key permit safe retry. */}
}
