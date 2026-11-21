'use server';
import {appCookieSecure} from '@/lib/app-origin';
import {clientRememberCookie,clientPasswordFlowCookie} from '@/lib/client-access/session';
import {cookies} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {createClientAuthForRequest,requireClientIdentity} from '@/lib/client-access/auth';
import {isClientSigninEnabled} from '@/lib/client-access/persistence';
import {clientPublicOrigin} from '@/lib/client-access/identity';
import {accountBookingConfigured,guestHash,guestQuery,guestError,type GuestStatus} from '@/lib/guest-booking/runtime';
import {normalizeGuestEmail} from '@/lib/guest-booking/verification';
import {dispatchBookingConfirmation} from '@/lib/guest-booking/confirmation';
export async function requestBookingAccount(_previous:{message:string},form:FormData){
 try{
  if(!accountBookingConfigured()||!await isClientSigninEnabled())return {message:'Account checkout is being prepared. No sign-in email has been requested.'};
  const booking=await guestQuery<GuestStatus>('guest_booking_v1',[await guestHash(),'status','{}']);
  if(!['signin','create'].includes(booking.entryMode)||['expired','released','booked'].includes(booking.state))return {message:'Return to booking and choose an available time.'};
  if(booking.entryMode==='create'&&form.get('createAccount')!=='on')return {message:'Choose whether to create an account before continuing.'};
  const email=normalizeGuestEmail(String(form.get('email')||''));
  const remember=form.get('remember')==='on',store=await cookies();store.set(clientRememberCookie,remember?'1':'0',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),...(remember?{maxAge:30*86400}:{})});if(booking.entryMode==='create')store.set(clientPasswordFlowCookie,'1',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),maxAge:3600});
  const auth=await createClientAuthForRequest(remember);const origin=clientPublicOrigin({AESTHENDA_HOSTED_PREVIEW:process.env.AESTHENDA_HOSTED_PREVIEW,VERCEL:process.env.VERCEL,AESTHENDA_STAGING:process.env.AESTHENDA_STAGING,AESTHENDA_PUBLIC_ORIGIN:process.env.AESTHENDA_PUBLIC_ORIGIN});
  const {error}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:booking.entryMode==='create',emailRedirectTo:`${origin}/client/auth/callback`}});
  if(error)return {message:'If an account can use this email, request a new link shortly. You can also return to booking and continue as a guest.'};
  (await cookies()).set('ae-booking-return','1',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),maxAge:600});
  return {message:'If this email can continue, check your inbox and open the link in this browser. Your time hold still expires at the original deadline.'};
 }catch{return {message:'Sign-in could not be started. Check your time hold before trying again.'};}
}
export async function confirmAccountBooking(_previous:{message:string},form:FormData){
 const identity=await requireClientIdentity();
 if(!accountBookingConfigured()||!await isClientSigninEnabled())return {message:'Account checkout is being prepared.'};
 if(!identity.email)return {message:'Use an account with a verified email address for this booking.'};
 try{const result=await guestQuery<{state:string}>('confirm_account_booking_v1',[await guestHash(),identity.id,identity.email,identity.phone,JSON.stringify({firstName:String(form.get('firstName')||''),lastName:String(form.get('lastName')||''),phone:String(form.get('phone')||''),updatesEmail:form.get('updatesEmail')==='on',policyId:String(form.get('policyId')||''),accepted:form.get('acceptTerms')==='on'})]);
 if(result.state!=='booked')return {message:result.state==='review_required'?'Contact your salon to review your profile. No additional profile or appointment was saved.':'Your time, service or terms changed. Return to booking to review current availability.'};
 await dispatchBookingConfirmation();(await cookies()).set('ae-booking-return','',{path:'/client',maxAge:0,httpOnly:true,sameSite:'lax'});
 for(const path of ['/client/booking','/client','/calendar','/appointments','/clients'])revalidatePath(path);
 return {message:'Your appointment was saved.'};
 }catch(error){return {message:guestError(error)};}
}
