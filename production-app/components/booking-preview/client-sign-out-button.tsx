 'use client';
import {useActionState} from 'react';
import {signOutClient} from '@/app/client/actions';
export function ClientSignOutButton(){const [state,action,pending]=useActionState(signOutClient,{message:''});return <form action={action}><button type="submit" className="bp-back" disabled={pending}>{pending?'Signing out…':'Sign out of client account'}</button><p role="status">{state.message}</p></form>;}
