'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {calendarHref,calendarActionContext} from '@/lib/calendar/navigation';
import {validDate,uuid} from '@/lib/appointments/input';
import {parseClient} from '@/lib/clients/input';
import {saveClient,clientContactMatches,setClientDeleted} from '@/lib/clients/persistence';
export type ClientActionState={message:string;matches?:{id:string;name:string}[]};
export async function saveClientAction(_previous:ClientActionState,form:FormData):Promise<ClientActionState> {
 const user=await requireUser();
 let input;
 try{input=parseClient(form);}catch(error){return {message:error instanceof Error?error.message:'Check the client details.'};}
 let id;
 try{
  if(!input.id&&form.get('duplicateReviewed')!=='on'){const matches=await clientContactMatches(user.id,input.email,input.phone,input.requestKey);if(matches.length)return {message:'This contact is already on a client profile. Open it, or confirm that you need a separate profile.',matches};}
  id=await saveClient(user.id,input);}catch(error){
  if(error instanceof Error&&error.message.includes('STALE_CLIENT'))return {message:'This client was changed in another tab. Refresh to load the latest details before editing again.'};
  if(error instanceof Error&&error.message.includes('CONSENT_REQUIRED'))return {message:'Please record how the client gave permission for the selected messages.'};
  if(error instanceof Error&&error.message.includes('CONTACT_REQUIRED'))return {message:'Add a phone number or email before saving.'};
  return {message:'Could not save this client. Retry with the same details, or refresh to start again.'};
 }
 revalidatePath('/clients');revalidatePath(`/clients/${id}`);
 revalidatePath('/calendar');const calendar=calendarActionContext(form);const returnAppointment=String(form.get('returnAppointment')??'');
 if(form.get('afterSave')==='book'&& !calendar)redirect(`/appointments?client=${id}`);
 if(calendar&&(form.get('afterSave')==='book'||form.get('returnToBooking')==='yes'&&form.get('afterSave')!=='profile')){const date=String(form.get('bookDate')??''),service=String(form.get('bookService')??''),minute=String(form.get('bookMinute')??'');redirect(calendarHref(calendar,'book',{client:id,date:validDate(date)?date:undefined,service:uuid(service)?service:undefined,minute:/^\d{1,4}$/.test(minute)&&Number(minute)<1440?minute:undefined}));}
 redirect(calendar?calendarHref(calendar,'client',{id,saved:'1',returnAppointment}):`/clients/${id}?saved=1`);
}

export async function deleteClientAction(_previous:{message:string},form:FormData){
 const user=await requireUser();const id=String(form.get('clientId')??''),revision=Number(form.get('revision'));if(!uuid(id)||!Number.isSafeInteger(revision)||revision<1)return {message:'Refresh the profile before continuing.'};
 try{await setClientDeleted(user.id,id,revision,form.get('restore')!=='yes');}catch(error){return {message:error instanceof Error&&error.message.includes('UPCOMING_APPOINTMENTS')?'This client has upcoming appointments. Cancel or complete those before deleting the profile.':'This client changed or is unavailable. Refresh and try again.'};}
 revalidatePath('/clients');revalidatePath(`/clients/${id}`);revalidatePath('/calendar');const calendar=calendarActionContext(form);redirect(calendar?calendarHref(calendar):'/clients');
}
