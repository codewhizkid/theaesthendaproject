'use client';
import Link from 'next/link';
import {useActionState} from 'react';
import {saveClientPassword} from '@/app/client/password/actions';
export function ClientPasswordForm({destination}:{destination:string}){
 const [state,action,pending]=useActionState(saveClientPassword,{message:'',complete:false});
 return state.complete?<><p role="status">{state.message}</p><Link className="bp-primary ca-workspace-link" href={destination}>Continue</Link></>:<form action={action}><fieldset disabled={pending} className="bp-details-fields"><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label><p>Use 12–128 characters. Your password is never stored in this browser by Aesthenda.</p><button className="bp-primary" type="submit">{pending?'Saving…':'Save password'}</button></fieldset><p role="status">{state.message}</p></form>;
}
