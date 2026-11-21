'use server';
import {cookies} from 'next/headers';
import {requireClientIdentity,createClientAuthForRequest} from '@/lib/client-access/auth';
import {isClientSigninEnabled} from '@/lib/client-access/persistence';
import {clientPasswordFlowCookie,clientPasswordError} from '@/lib/client-access/session';
export async function saveClientPassword(_previous:{message:string;complete:boolean},form:FormData){
 await requireClientIdentity();if(!await isClientSigninEnabled())return {message:'Client sign-in is being prepared.',complete:false};
 const password=form.get('password'),validation=clientPasswordError(password,form.get('confirmation'));if(validation)return {message:validation,complete:false};
 try{const auth=await createClientAuthForRequest();const result=await auth.auth.updateUser({password:password as string});if(result.error)return {message:'Password could not be saved. Choose a different password, or request a fresh email recovery link.',complete:false};
 const store=await cookies();
 store.set(clientPasswordFlowCookie,'',{path:'/client',httpOnly:true,sameSite:'lax',maxAge:0});
 return {message:'Password saved. You can now sign in with your email and password on any device.',complete:true};
 }catch{return {message:'Password could not be saved. Please try again.',complete:false};}
}
