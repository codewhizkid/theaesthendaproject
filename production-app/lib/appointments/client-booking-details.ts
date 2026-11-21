import {clientEmailError,clientPhoneError} from '../clients/input.ts';
import {uuid} from './input.ts';
export type BookingContact={entryMode?:'guest'|'create'|'signin';firstName:string;lastName:string;email:string;phone:string;verificationChannel:'email'|'text';updatesEmail:boolean;updatesText:boolean};
export type BookingReview={contact:BookingContact;service:{id:string;name:string;durationMinutes:number;priceCents:number;currency:string};startAt:string;endAt:string;timezone:string;checkedAt:string};
export type BookingReviewState={message:string;review:BookingReview|null};
export function parseBookingDetails(form:FormData){
 const text=(key:string)=>String(form.get(key)??'').trim();
 const entryMode=text('entryMode')||'guest';
 if(entryMode!=='guest'&&entryMode!=='create'&&entryMode!=='signin')throw new Error('Choose how you would like to continue.');
 const firstName=text('firstName'),lastName=text('lastName'),email=text('email'),phone=text('phone');
 if(!firstName||firstName.length>80||lastName.length>80)throw new Error('Enter your first name and keep each name within 80 characters.');
 const emailError=clientEmailError(email),phoneError=clientPhoneError(phone);
 if(entryMode==='create'&&!email)throw new Error('Enter an email address to create an account.');
 if(emailError)throw new Error(emailError);if(phoneError)throw new Error(phoneError);
 const verificationChannel=text('verificationChannel');
 if(verificationChannel!=='email'&&verificationChannel!=='text')throw new Error('Choose email or text to verify your booking.');
 if(verificationChannel==='email'&&!email)throw new Error('Enter an email address to verify by email.');
 if(verificationChannel==='text'&&!phone)throw new Error('Enter a mobile number to verify by text.');
 const updatesEmail=form.get('updatesEmail')==='on',updatesText=form.get('updatesText')==='on';
 if(updatesEmail&&!email)throw new Error('Enter an email address for appointment emails.');
 if(updatesText&&!phone)throw new Error('Enter a mobile number for appointment texts.');
 const serviceId=text('serviceId'),startAt=text('startAt'),serviceToken=text('serviceToken');
 if(!uuid(serviceId)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(startAt)||!Number.isFinite(Date.parse(startAt))||!/^[0-9a-f]{32}$/.test(serviceToken))throw new Error('Choose your service and an available time again.');
 return {contact:{entryMode,firstName,lastName,email,phone,verificationChannel,updatesEmail,updatesText} as BookingContact,serviceId,startAt:new Date(startAt).toISOString(),serviceToken};
}
export function bookingContactDestination(contact:BookingContact){return contact.verificationChannel==='email'?contact.email:contact.phone;}

export function buildBookingReview(input:ReturnType<typeof parseBookingDetails>,availability:{service:{id:string;name:string;durationMinutes:number;priceCents:number;currency:string;token:string};slots:{startAt:string}[];timezone:string},checkedAt:string):BookingReview{
 const {service,slots,timezone}=availability;
 if(service.id!==input.serviceId||service.token!==input.serviceToken)throw new Error('This service has changed. Choose your service and time again to review the latest details.');
 if(!slots.some(slot=>new Date(slot.startAt).toISOString()===input.startAt))throw new Error('That time is no longer offered. Choose another available time.');
 return {contact:input.contact,service:{id:service.id,name:service.name,durationMinutes:service.durationMinutes,priceCents:service.priceCents,currency:service.currency},startAt:input.startAt,endAt:new Date(Date.parse(input.startAt)+service.durationMinutes*60000).toISOString(),timezone,checkedAt};
}
