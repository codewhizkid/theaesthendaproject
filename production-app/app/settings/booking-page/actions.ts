'use server';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/supabase/require-user';
import {saveBookingPageTheme} from '@/lib/booking-theme/persistence';
import {parseBookingTheme} from '@/lib/booking-theme/input';
export async function saveBookingPageDesign(_previous:{message:string},form:FormData){
 const user=await requireUser();
 const revision=Number(form.get('revision'));
 if(!Number.isSafeInteger(revision)||revision<0||revision>2147483646)return {message:'Refresh this page before saving.'};
 let theme;
 try{theme=parseBookingTheme(JSON.parse(String(form.get('theme')||'')));}catch(error){return {message:error instanceof Error?error.message:'Choose valid colors before saving.'};}
 try{await saveBookingPageTheme(user.id,revision,theme);}catch(error){
  return {message:error instanceof Error&&error.message.includes('BOOKING_THEME_CONFLICT')?'These settings changed in another tab. Refresh the page before saving.':'Your design could not be saved. Refresh the page to check its current settings.'};
 }
 revalidatePath('/settings/booking-page');revalidatePath('/booking-preview');
 return {message:'Booking page design saved.'};
}
