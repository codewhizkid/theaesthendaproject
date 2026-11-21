import 'server-only';
import {appCookieSecure} from '@/lib/app-origin';
import {clientRememberCookie,clientSessionCookieOptions} from './session';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {requireSupabasePublicConfig} from '@/lib/supabase/config';
import {clientAuthCookieName,verifiedClientIdentity} from './identity';
export async function createClientAuthForRequest(remember?:boolean){
 const config=requireSupabasePublicConfig();const store=await cookies();const remembered=remember??store.get(clientRememberCookie)?.value!=='0';
 return createServerClient(config.url,config.key,{
  cookieOptions:{name:clientAuthCookieName,path:'/client',sameSite:'lax',httpOnly:true,secure:appCookieSecure(process.env)},
  cookies:{
   getAll(){return store.getAll();},
   setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,clientSessionCookieOptions(options,remembered)));}catch{/* Server component refresh is handled by middleware. */}},
  },
 });
}
export async function requireClientIdentity(){const auth=await createClientAuthForRequest();const {data,error}=await auth.auth.getUser();const identity=!error?verifiedClientIdentity(data.user):null;if(!identity)redirect('/client/sign-in');return identity;}
