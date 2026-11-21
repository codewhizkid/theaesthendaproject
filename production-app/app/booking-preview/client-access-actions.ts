 'use server';
import {randomBytes,createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {createClientSigninInvite,isClientSigninEnabled} from '@/lib/client-access/persistence';
export async function openClientSigninTest(){
 const user=await requireUser();if(!await isClientSigninEnabled())redirect('/client/sign-in');const token=randomBytes(32).toString('hex');
 await createClientSigninInvite(user.id,createHash('sha256').update(token).digest('hex'));
 redirect(`/client/sign-in?invite=${token}`);
}
