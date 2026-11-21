import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

// Server-only primitives for a booking-scoped guest challenge. These do not
// create an Auth user or grant access to a salon/portal account.
export type GuestChallenge={
 sessionHash:string;bookingHash:string;email:string;tokenHash:string;
 expiresAt:string;consumedAt:string|null;
};
export type GuestChallengeResult='valid'|'expired'|'invalid'|'used';
const hashPattern=/^[a-f0-9]{64}$/;
export function guestSecret(){return randomBytes(32).toString('hex');}
export function hashGuestSecret(value:string){
 if(!hashPattern.test(value))throw new Error('Invalid guest secret.');
 return createHash('sha256').update(value).digest('hex');
}
function equalHash(a:string,b:string){return hashPattern.test(a)&&hashPattern.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function normalizeGuestEmail(value:string){
 const email=value.trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');
 return email;
}
export function prepareGuestChallenge(input:{sessionSecret:string;bookingHash:string;email:string;holdExpiresAt:string;now:string}){
 const now=Date.parse(input.now),expiry=Date.parse(input.holdExpiresAt);
 if(!Number.isFinite(now)||!Number.isFinite(expiry)||expiry<=now)throw new Error('Choose an available time again.');
 if(!hashPattern.test(input.bookingHash))throw new Error('Invalid booking binding.');
 const token=guestSecret();
 // The caller supplies the server-held expiry. A resend never extends the hold.
 const challenge:GuestChallenge={sessionHash:hashGuestSecret(input.sessionSecret),bookingHash:input.bookingHash,email:normalizeGuestEmail(input.email),tokenHash:hashGuestSecret(token),expiresAt:input.holdExpiresAt,consumedAt:null};
 return {token,challenge};
}
export function checkGuestChallenge(challenge:GuestChallenge,input:{sessionSecret:string;token:string;bookingHash:string;email:string;now:string}):GuestChallengeResult{
 const now=Date.parse(input.now),expiry=Date.parse(challenge.expiresAt);
 if(!Number.isFinite(now)||!Number.isFinite(expiry))return 'invalid';
 try{
  if(!equalHash(challenge.sessionHash,hashGuestSecret(input.sessionSecret))||!equalHash(challenge.tokenHash,hashGuestSecret(input.token))||!equalHash(challenge.bookingHash,input.bookingHash)||challenge.email!==normalizeGuestEmail(input.email))return 'invalid';
 }catch{return 'invalid';}
 if(challenge.consumedAt)return 'used';
 if(now>=expiry)return 'expired';
 return 'valid';
}
// A valid result is only a predicate. The database must lock and consume the
// challenge atomically, bind proof to the same session/contact/booking, and
// revalidate the active hold before final booking. Never use a browser flag,
// this predicate alone, or the owner's session as guest verification.
