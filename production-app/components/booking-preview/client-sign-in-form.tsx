'use client';
import {useActionState,useState} from 'react';
import {requestClientSignin,signInClientWithPassword} from '@/app/client/sign-in/actions';
export function ClientSignInForm({invite}:{invite:string}){
 const [emailMode,setEmailMode]=useState(false);
 const [state,action,pending]=useActionState(requestClientSignin,{message:'',requested:false});
 const [passwordState,passwordAction,passwordPending]=useActionState(signInClientWithPassword,{message:''});
 return <><form action={emailMode?action:passwordAction}><fieldset disabled={pending||passwordPending} className="bp-details-fields"><input type="hidden" name="invite" value={invite}/><label>Email address<input type="email" name="email" required maxLength={254} autoComplete="username"/></label>{!emailMode&&<label>Password<input name="password" type="password" required maxLength={128} autoComplete="current-password"/></label>}<label className="bp-check-choice"><input type="checkbox" name="remember" defaultChecked/> Remember this device</label><p className="bp-contact-note">Keeps your sign-in session on this browser for up to 30 days of inactivity. Use only on your own device.</p><button className="bp-primary bp-next" type="submit">{pending||passwordPending?'Signing in…':emailMode?'Email me a verification link':'Sign in'}</button></fieldset><p role="status" className="bp-form-message">{emailMode?state.message:passwordState.message}</p></form><button className="bp-back" type="button" onClick={()=>setEmailMode(!emailMode)}>{emailMode?'Use email and password':'First visit or forgot your password?'}</button>{emailMode&&<p className="bp-contact-note">Verify your email to create or reset a password. This can create an account if you are new; it does not create a salon profile or book an appointment.</p>}</>;
}
