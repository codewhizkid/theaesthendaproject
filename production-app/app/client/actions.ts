 'use server';
import {clientRememberCookie,clientPasswordFlowCookie} from '@/lib/client-access/session';
import {clientPhoneError} from '@/lib/clients/input';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireClientIdentity,createClientAuthForRequest} from '@/lib/client-access/auth';
import {clientInviteCookieName,isInviteToken} from '@/lib/client-access/identity';
import {resolveClientIdentity,isClientSigninEnabled} from '@/lib/client-access/persistence';
export async function connectClientProfile(_previous:{message:string},form:FormData){
 const identity=await requireClientIdentity();if(!await isClientSigninEnabled())return {message:'Client sign-in is being prepared. Please check back shortly.'};const store=await cookies();const hash=store.get(clientInviteCookieName)?.value;
 const phoneHint=String(form.get('phoneHint')??'').trim();if(clientPhoneError(phoneHint))return {message:clientPhoneError(phoneHint)};
 const first=String(form.get('firstName')??'').trim(),last=String(form.get('lastName')??'').trim();
 if(!first||first.length>80||last.length>80)return {message:'Enter your first name and keep each name within 80 characters.'};
 if(!isInviteToken(hash))return {message:'Ask your salon for a new sign-in test link.'};
 try{const result=await resolveClientIdentity(identity,hash,first,last,phoneHint);if(result.state==='review_required')return {message:'Please contact your salon to review your profile before continuing. No additional profile was created.'};}
 catch{return {message:'We couldn’t connect your profile. Your invitation may have expired. Ask your salon for a new link.'};}
 store.set(clientInviteCookieName,'',{path:'/client',httpOnly:true,sameSite:'lax',maxAge:0});revalidatePath('/client');revalidatePath('/clients');redirect('/client');
}
export async function signOutClient(){const auth=await createClientAuthForRequest();const {error}=await auth.auth.signOut({scope:'local'});if(error)return {message:'Could not sign out. Please try again.'};const store=await cookies();for(const name of [clientRememberCookie,clientPasswordFlowCookie,'ae-booking-return',clientInviteCookieName])store.set(name,'',{path:'/client',maxAge:0,httpOnly:true,sameSite:'lax'});redirect('/client/sign-in');}
