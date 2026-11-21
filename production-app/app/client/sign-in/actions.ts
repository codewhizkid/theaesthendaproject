 'use server';
import {appCookieSecure} from '@/lib/app-origin';
import {createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {clientRememberCookie,clientPasswordFlowCookie} from '@/lib/client-access/session';
import {verifiedClientIdentity} from '@/lib/client-access/identity';
import {cookies} from 'next/headers';
import {createClientAuthForRequest} from '@/lib/client-access/auth';
import {isInviteToken,clientInviteCookieName,clientPublicOrigin} from '@/lib/client-access/identity';
import {readClientSigninInvite,isClientSigninEnabled} from '@/lib/client-access/persistence';
export async function requestClientSignin(_previous:{message:string;requested:boolean},form:FormData){
 if(!(form instanceof FormData))return {message:'Enter your email address to request a sign-in link.',requested:false};
 const email=String(form.get('email')??'').trim().toLowerCase();const token=String(form.get('invite')??'');
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {message:'Enter a valid email address.',requested:false};
 try{
  if(!await isClientSigninEnabled())return {message:'Client sign-in is being prepared. Please check back shortly.',requested:false};
  const store=await cookies();
  if(token){if(!isInviteToken(token))return {message:'This salon invitation is unavailable. Ask your salon for a new link.',requested:false};const hash=createHash('sha256').update(token).digest('hex');if(!await readClientSigninInvite(hash))return {message:'This salon invitation is unavailable. Ask your salon for a new link.',requested:false};store.set(clientInviteCookieName,hash,{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),maxAge:86400});}
  const remember=form.get('remember')==='on';store.set(clientRememberCookie,remember?'1':'0',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),...(remember?{maxAge:30*86400}:{})});
  store.set(clientPasswordFlowCookie,'1',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),maxAge:3600});
  const auth=await createClientAuthForRequest(remember);const origin=clientPublicOrigin({AESTHENDA_HOSTED_PREVIEW:process.env.AESTHENDA_HOSTED_PREVIEW,VERCEL:process.env.VERCEL,AESTHENDA_STAGING:process.env.AESTHENDA_STAGING,AESTHENDA_PUBLIC_ORIGIN:process.env.AESTHENDA_PUBLIC_ORIGIN});
  const {error}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:`${origin}/client/auth/callback`}});
  if(error)return {message:'Sign-in is unavailable right now. Please try again later. No salon profile has been created.',requested:false};
  return {message:'Check your email for a sign-in link. Open it in this browser to continue. Requesting a link does not create a salon profile.',requested:true};
 }catch{return {message:'Client sign-in could not be started. Please try again later.',requested:false};}
}

export async function signInClientWithPassword(_previous:{message:string},form:FormData){
 const email=String(form.get('email')||'').trim().toLowerCase(),password=form.get('password');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||!password||password.length>128)return {message:'Enter your email and password.'};
 let destination='/client';
 try{
  if(!await isClientSigninEnabled())return {message:'Client sign-in is being prepared.'};
  const remember=form.get('remember')==='on',store=await cookies();
  const auth=await createClientAuthForRequest(remember);
  const {data,error}=await auth.auth.signInWithPassword({email,password});
  if(error||!data.session)return {message:'Email or password could not be verified. Try again or use email recovery.'};
  const check=await auth.auth.getUser();if(check.error||!verifiedClientIdentity(check.data.user)){await auth.auth.signOut({scope:'local'});return {message:'Verify your email before signing in.'};}
  store.set(clientRememberCookie,remember?'1':'0',{path:'/client',httpOnly:true,sameSite:'lax',secure:appCookieSecure(process.env),...(remember?{maxAge:30*86400}:{})});
  store.set(clientPasswordFlowCookie,'',{path:'/client',httpOnly:true,sameSite:'lax',maxAge:0});
  // Invitation scope remains an independent server-checked capability.
  const token=String(form.get('invite')||'');if(token&&isInviteToken(token)){const hash=createHash('sha256').update(token).digest('hex');if(await readClientSigninInvite(hash))store.set(clientInviteCookieName,hash,{path:'/client',httpOnly:true,sameSite:'lax',maxAge:86400,secure:appCookieSecure(process.env)});}
  destination=store.get('ae-booking-return')?.value==='1'?'/client/booking':'/client';
 }catch{return {message:'Sign-in is unavailable. Please try again.'};}
 redirect(destination);
}
