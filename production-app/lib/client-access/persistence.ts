import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import type {VerifiedClientIdentity} from './identity';
export type ClientProfile={id:string;firstName:string;lastName:string;businessName:string};
export async function createClientSigninInvite(owner:string,hash:string){const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.create_client_signin_invite_v1($1::uuid,$2::text) r',[owner,hash])).rows[0].r as {expiresAt:string};}finally{db.release();}}
export async function readClientSigninInvite(hash:string):Promise<{businessName:string;expiresAt:string}|null>{const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_client_signin_invite_v1($1::text) r',[hash])).rows[0].r;}finally{db.release();}}
export async function resolveClientIdentity(identity:VerifiedClientIdentity,hash:string,firstName:string,lastName:string,phoneHint=''):Promise<{state:'linked'|'review_required';created?:boolean;profile?:ClientProfile}>{const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.resolve_client_identity_v1($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text) r',[identity.id,identity.email,identity.phone,hash,firstName,lastName,phoneHint])).rows[0].r;}finally{db.release();}}
export async function readClientProfiles(subject:string):Promise<ClientProfile[]>{const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_client_identity_profiles_v1($1::uuid) r',[subject])).rows[0].r;}finally{db.release();}}

export async function isClientAccessReady():Promise<boolean>{
 try{const db=await checkedRuntime();try{return (await db.query("select count(*)=4 and coalesce(bool_and(has_function_privilege(current_user,p.oid,'EXECUTE')),false) as ready from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aesthenda_private' and p.proname=any($1::text[])",[['create_client_signin_invite_v1','read_client_signin_invite_v1','resolve_client_identity_v1','read_client_identity_profiles_v1']])).rows[0].ready===true;}finally{db.release();}}catch{return false;}
}

export async function isClientSigninEnabled():Promise<boolean>{return process.env.AESTHENDA_CLIENT_SIGNIN_READY==='1'&&await isClientAccessReady();}

export async function readClientConnectionPrompt(subject:string,hash:string):Promise<{businessName:string;expiresAt:string}|null>{const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_client_connection_prompt_v1($1::uuid,$2::text) r',[subject,hash])).rows[0].r;}finally{db.release();}}
