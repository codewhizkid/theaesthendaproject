import 'server-only';
import {guestHash,guestQuery} from './runtime';
import {guestMailConfig} from './resend-transport';
import {sendBookingConfirmation,type ConfirmationFacts} from './confirmation-transport';
export async function dispatchBookingConfirmation(){
 // Booking success must survive a sending failure. Queued messages remain durable.
 if(process.env.AESTHENDA_APPOINTMENT_EMAIL_READY!=='1')return;
 const config=guestMailConfig({...process.env,AESTHENDA_GUEST_EMAIL_READY:'1'});if(!config)return;
 try{const hash=await guestHash();const message=await guestQuery<{state:string;id:string;lease:string;email:string;payload:ConfirmationFacts}>('booking_message_v1',[hash,'claim','{}']);if(message.state!=='claimed')return;
 const result=await sendBookingConfirmation(config,message);
 if(result.status==='setup_required')return;
 await guestQuery('booking_message_v1',[hash,'result',JSON.stringify({lease:message.lease,state:result.status,providerId:result.messageId})]);
 }catch{/* The persisted lease and state allow a later explicit retry. */}
}
