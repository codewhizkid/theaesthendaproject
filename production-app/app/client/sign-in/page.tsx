import {redirect} from 'next/navigation';
import {createClientAuthForRequest} from '@/lib/client-access/auth';
import {verifiedClientIdentity} from '@/lib/client-access/identity';
import Link from 'next/link';
import {createHash} from 'node:crypto';
import {isInviteToken} from '@/lib/client-access/identity';
import {readClientSigninInvite,isClientSigninEnabled} from '@/lib/client-access/persistence';
import {ClientSignInForm} from '@/components/booking-preview/client-sign-in-form';
export default async function ClientSigninPage({searchParams}:{searchParams:Promise<{invite?:string;error?:string}>}){
 const ready=await isClientSigninEnabled();
 const params=await searchParams;
 if(ready&&!params.invite&&!params.error){const auth=await createClientAuthForRequest();const {data,error}=await auth.auth.getUser();if(!error&&verifiedClientIdentity(data.user))redirect('/client');}
 const token=isInviteToken(params.invite)?params.invite:'';
 let invitation:null|{businessName:string;expiresAt:string}=null;
 if(ready&&token)try{invitation=await readClientSigninInvite(createHash('sha256').update(token).digest('hex'));}catch{}
 return <><p className="bp-eyebrow">Your salon profile</p><h1 className="ca-title">{invitation?invitation.businessName:'Welcome back.'}</h1><p className="bp-intro">Sign in to connect with your salon. Your verified contact helps us find your existing profile.</p>{params.error&&params.error!=='setup'&&<p role="status" className="bp-test-notice">That sign-in link could not be verified. It may have expired or been opened in another browser. Request a fresh link.</p>}{!ready?<div className="bp-test-notice"><strong>Client sign-in is being prepared.</strong><p>Your salon’s client-profile protections need to be connected before you can sign in here.</p></div>:params.invite&&!invitation?<p className="bp-test-notice">This salon invitation is unavailable. Ask your salon for a fresh sign-in test link.</p>:<><ClientSignInForm invite={token}/>{invitation&&<p className="bp-contact-note">This salon sign-in test invitation expires after 24 hours and connects one verified client account.</p>}</>}<p className="bp-contact-note">Salon sign-in and client sign-in are separate.</p><Link href="/booking-preview" className="bp-back">Back to salon workspace</Link></>;
}
