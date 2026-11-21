import {appOrigin,type AppOriginEnv} from '../app-origin.ts';
export const clientAuthCookieName='ae-client-auth';
export const clientInviteCookieName='ae-client-invite';
export function isInviteToken(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);}
export type VerifiedClientIdentity={id:string;email:string;phone:string};
export function verifiedClientIdentity(user:{id?:string;email?:string;phone?:string;email_confirmed_at?:string;phone_confirmed_at?:string;is_anonymous?:boolean}|null):VerifiedClientIdentity|null{
 if(!user||user.is_anonymous||!user.id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))return null;
 const email=user.email_confirmed_at&&Number.isFinite(Date.parse(user.email_confirmed_at))?(user.email??'').trim().toLowerCase():'';
 const rawPhone=user.phone_confirmed_at&&Number.isFinite(Date.parse(user.phone_confirmed_at))?(user.phone??'').trim():'';
 const phone=rawPhone?/^\+[1-9][0-9]{6,14}$/.test(rawPhone)?rawPhone:/^[1-9][0-9]{6,14}$/.test(rawPhone)?`+${rawPhone}`:'':'';
 const validEmail=email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
 return validEmail||phone?{id:user.id,email:validEmail,phone}:null;
}
export function clientPublicOrigin(env:AppOriginEnv){return appOrigin(env);}
