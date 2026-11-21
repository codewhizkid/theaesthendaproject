import 'server-only';
import {guestMailConfig,sendGuestVerificationEmail} from './resend-transport';
// Not called by a public action until durable challenge storage, guest session,
// atomic verification, and /guest/verify are implemented and verified.
export async function deliverGuestVerification(input:{challengeId:string;email:string;token:string}){
 return sendGuestVerificationEmail(guestMailConfig({AESTHENDA_GUEST_EMAIL_READY:process.env.AESTHENDA_GUEST_EMAIL_READY,RESEND_API_KEY:process.env.RESEND_API_KEY,AESTHENDA_GUEST_EMAIL_FROM:process.env.AESTHENDA_GUEST_EMAIL_FROM,AESTHENDA_PUBLIC_ORIGIN:process.env.AESTHENDA_PUBLIC_ORIGIN,AESTHENDA_HOSTED_PREVIEW:process.env.AESTHENDA_HOSTED_PREVIEW,VERCEL:process.env.VERCEL,AESTHENDA_STAGING:process.env.AESTHENDA_STAGING}),input);
}
