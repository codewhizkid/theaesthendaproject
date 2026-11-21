'use server';
import {dispatchOwnerBookingConfirmation} from '@/lib/appointments/confirmation';
import {calendarHref,calendarActionContext} from '@/lib/calendar/navigation';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {parseAppointment,parseReschedule,uuid} from '@/lib/appointments/input';
import {createAppointment,cancelAppointmentRecord,rescheduleAppointmentRecord,setAppointmentStatus} from '@/lib/appointments/persistence';
export async function bookAppointment(_previous:{message:string},form:FormData){
 const user=await requireUser();let input;
 try{input=parseAppointment(form);}catch(error){return {message:error instanceof Error?error.message:'Choose the appointment details again.'};}
 let id;
 try{id=await createAppointment(user.id,input);}catch(error){
 const message=error instanceof Error?error.message:'';
 if(message.includes('SLOT_UNAVAILABLE'))return {message:'That time is no longer available. Refresh the available times and choose another.'};
 if(message.includes('SERVICE_CHANGED'))return {message:'The service or time zone has changed. Refresh the available times to review the latest service details.'};
 return {message:'Could not save this appointment. Check that the client and service are available, then try again.'};
 }
 await dispatchOwnerBookingConfirmation(user.id,id);
 revalidatePath('/appointments');revalidatePath('/calendar');revalidatePath('/dashboard');const calendar=calendarActionContext(form);redirect(calendar?calendarHref(calendar,'appointment',{id,saved:'1'}):`/appointments/${id}?saved=1`);
}
export async function cancelAppointment(_previous:{message:string},form:FormData){
 const user=await requireUser();const id=String(form.get('appointmentId')??''),revision=Number(form.get('revision'));
 if(!uuid(id)||!Number.isSafeInteger(revision)||revision<1||revision>2147483646)return {message:'Refresh this appointment before cancelling.'};
 try{await cancelAppointmentRecord(user.id,id,revision);}catch{return {message:'Could not cancel this appointment. Refresh to check its current status.'};}
 revalidatePath('/appointments');revalidatePath('/calendar');revalidatePath('/dashboard');revalidatePath(`/appointments/${id}`);const calendar=calendarActionContext(form);redirect(calendar?calendarHref(calendar,'appointment',{id}):`/appointments/${id}`);
}
export async function rescheduleAppointment(_previous:{message:string},form:FormData){
 const user=await requireUser();let input;
 try{input=parseReschedule(form);}catch(error){return {message:error instanceof Error?error.message:'Refresh the available times.'};}
 let id;
 try{id=await rescheduleAppointmentRecord(user.id,input);}catch(error){
 const message=error instanceof Error?error.message:'';
 if(message.includes('SLOT_UNAVAILABLE'))return {message:'That time is no longer available. Your original appointment is unchanged. Refresh the available times.'};
 if(message.includes('STALE_APPOINTMENT'))return {message:'This appointment changed in another tab. Reload its current details before rescheduling.'};
 return {message:'The appointment could not be moved. Your original appointment is unchanged. Reload its details and try again.'};
 }
 revalidatePath('/appointments');revalidatePath('/calendar');revalidatePath('/dashboard');revalidatePath(`/appointments/${id}`);const calendar=calendarActionContext(form);redirect(calendar?calendarHref(calendar,'appointment',{id,rescheduled:'1'}):`/appointments/${id}?rescheduled=1`);
}

export async function changeAppointmentStatus(_previous:{message:string},form:FormData){
 const user=await requireUser();const id=String(form.get('appointmentId')??''),key=String(form.get('requestKey')??''),revision=Number(form.get('revision')),status=String(form.get('status')??'');
 if(!uuid(id)||!uuid(key)||!Number.isSafeInteger(revision)||revision<1||revision>2147483646||!['confirmed','completed','no_show'].includes(status))return {message:'Refresh the appointment before changing its status.'};
 try{await setAppointmentStatus(user.id,key,id,revision,status);}catch(error){const message=error instanceof Error?error.message:'';return {message:message.includes('STATUS_TIME_REVIEW')?'Confirm before the appointment starts. Mark No-show after its start, or Completed after its end.':'Could not update the status. Refresh to check the appointment’s latest details.'};}
 revalidatePath('/appointments');revalidatePath('/calendar');revalidatePath('/dashboard');revalidatePath(`/appointments/${id}`);const calendar=calendarActionContext(form);redirect(calendar?calendarHref(calendar,'appointment',{id}):`/appointments/${id}`);
}

export async function retryAppointmentEmail(_previous:{message:string},form:FormData){
 const user=await requireUser();const id=String(form.get('appointmentId')??'');
 if(!uuid(id))return {message:'Refresh this appointment before checking its email.'};
 await dispatchOwnerBookingConfirmation(user.id,id);
 revalidatePath('/calendar');revalidatePath(`/appointments/${id}`);
 return {message:'Email status checked. Your appointment is unchanged.'};
}
