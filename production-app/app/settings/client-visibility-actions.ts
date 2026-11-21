 'use server';
import {requireUser} from '@/lib/supabase/require-user';
import {saveClientBookingVisibility} from '@/lib/appointments/client-visibility-persistence';
import {isVisibilityPercent} from '@/lib/appointments/client-visibility';
import {revalidatePath} from 'next/cache';
export async function saveClientVisibilitySettings(_previous:{message:string},form:FormData){
 const user=await requireUser();const raw=String(form.get('revision')??'');const revision=Number(raw);const percent=Number(form.get('showPercent'));
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(revision)||revision<0||revision>2147483646)return {message:'Refresh settings before saving.'};
 if(!isVisibilityPercent(percent))return {message:'Choose 20%, 50%, 80%, or 100%.'};
 try{await saveClientBookingVisibility(user.id,revision,percent);}catch{return {message:'Client booking settings could not be saved. Refresh to check for changes from another tab.'};}
 revalidatePath('/settings');revalidatePath('/booking-preview');return {message:'Client booking settings saved.'};
}
