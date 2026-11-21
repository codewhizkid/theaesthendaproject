import type {GuestMailConfig,GuestMailResult} from './resend-transport';
export type ConfirmationFacts={appointmentId:string;status:'pending'|'confirmed';salonName:string;professionalName:string;serviceName:string;priceCents:number;currency:string;startAt:string;endAt:string;timezone:string};
export function confirmationMessage(f:ConfirmationFacts){
 if(!['pending','confirmed'].includes(f.status)||!Number.isSafeInteger(f.priceCents)||f.priceCents<0)throw Error('Invalid confirmation facts');
 const date=new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:f.timezone}).format(new Date(f.startAt));
 const price=new Intl.NumberFormat('en-US',{style:'currency',currency:f.currency}).format(f.priceCents/100);
 const subject=f.status==='confirmed'?'Your appointment is confirmed':'Your appointment request was received';
 const text=`${subject}.\n\n${f.serviceName} with ${f.professionalName||f.salonName}\n${f.salonName}\n${date} (${f.timezone})\nService price: ${price}\n\n${f.status==='confirmed'?'Your appointment is confirmed.':'Your salon will review your request. It is not confirmed yet.'}\n\nBooking reference: ${f.appointmentId}`;
 return {subject,text};
}
export async function sendBookingConfirmation(config:GuestMailConfig|null,input:{id:string;email:string;payload:ConfirmationFacts},send:typeof fetch=fetch):Promise<GuestMailResult>{
 if(!config)return {status:'setup_required'};
 if(!/^[0-9a-f-]{36}$/.test(input.id)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))throw Error('Invalid confirmation recipient');
 const content=confirmationMessage(input.payload);
 try{const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`booking-confirmation/${input.id}`},body:JSON.stringify({from:config.from,to:[input.email],...content}),signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!response.ok)return {status:response.status>=500||response.status===429?'pending':'failed'};
 const result=await response.json() as {id?:unknown};return typeof result.id==='string'&&result.id.length>0&&result.id.length<=128?{status:'accepted',messageId:result.id}:{status:'pending'};
 }catch{return {status:'pending'};}
}
