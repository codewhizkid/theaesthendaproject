'use server';
import {requireUser} from '@/lib/supabase/require-user';
import {saveBookingPreferences} from '@/lib/appointments/preferences';
import {revalidatePath} from 'next/cache';
export async function saveBookingSettings(_previous:{message:string},form:FormData){
 const user=await requireUser();const revision=Number(form.get('revision'));
 if(!Number.isSafeInteger(revision)||revision<0||revision>2147483646)return {message:'Refresh settings before saving.'};
 const limit=Number(form.get('maxConcurrentClients'));if(!Number.isInteger(limit)||limit<2||limit>10)return {message:'Choose a limit between 2 and 10 clients.'};
 try{await saveBookingPreferences(user.id,revision,form.get('autoConfirm')==='on',true,limit,form.get('requireClientConfirmation')==='on');}catch(error){return {message:error instanceof Error&&error.message.includes('PROCESSING_POLICY_REVIEW')?'Existing overlapping bookings need review before you lower the client limit.':'Settings could not be saved. Refresh to check for changes from another tab.'};}
 revalidatePath('/settings');revalidatePath('/appointments');revalidatePath('/calendar');return {message:'Booking settings saved. Existing appointments keep their current status.'};
}
