import {appOrigin,type AppOriginEnv} from '../app-origin.ts';
// Server transport only. Never pass this configuration to a Client Component.
export type GuestMailConfig={apiKey:string;from:string;origin:string};
export type GuestMailResult={status:'setup_required'|'accepted'|'pending'|'failed';messageId?:string};
export function guestMailConfig(env:{AESTHENDA_GUEST_EMAIL_READY?:string;RESEND_API_KEY?:string;AESTHENDA_GUEST_EMAIL_FROM?:string;AESTHENDA_PUBLIC_ORIGIN?:string;AESTHENDA_STAGING?:string}&AppOriginEnv):GuestMailConfig|null{
 if(env.AESTHENDA_GUEST_EMAIL_READY!=='1')return null;
 const apiKey=env.RESEND_API_KEY?.trim(),from=env.AESTHENDA_GUEST_EMAIL_FROM?.trim();
 if(!apiKey||!from||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)||/[\r\n]/.test(apiKey))return null;
 try{return {apiKey,from,origin:appOrigin(env)};}catch{return null;}
}
export async function sendGuestVerificationEmail(config:GuestMailConfig|null,input:{challengeId:string;email:string;token:string},send:typeof fetch=fetch):Promise<GuestMailResult>{
 if(!config)return {status:'setup_required'};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.challengeId)||! /^[a-f0-9]{64}$/.test(input.token)||input.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))throw new Error('Invalid verification email request.');
 const url=new URL('/guest/verify',config.origin);url.hash='token='+input.token;
 const text=`Verify your email to continue your guest booking:\n\n${url.href}\n\nThis link is valid only for the booking you started and expires with your time hold. It does not create a portal account or confirm an appointment. If you did not request this, ignore this email.`;
 try{
  const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`guest-verification/${input.challengeId}`},body:JSON.stringify({from:config.from,to:[input.email],subject:'Verify your email for your appointment',text}),signal:AbortSignal.timeout(10000),redirect:'error'});
  // A timeout/server failure is ambiguous. Retry only the same persisted
  // challenge/token with this same idempotency key; never mint another email.
  if(!response.ok)return {status:response.status>=500||response.status===429?'pending':'failed'};
  const receipt=await response.json() as {id?:unknown};
  return typeof receipt.id==='string'&&receipt.id.length>0&&receipt.id.length<=128?{status:'accepted',messageId:receipt.id}:{status:'pending'};
 }catch{return {status:'pending'};}
}
