'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/require-user';
import { parseAvailability } from '@/lib/availability/input';
import {parseDateHours} from '@/lib/availability/date-input';
import {persistDateHours} from '@/lib/availability/persistence';
import { persistAvailability } from '@/lib/availability/persistence';
export async function saveAvailability(_previous: {message:string},form: FormData) {
 const user=await requireUser();let input;
 try {input=parseAvailability(form);}catch(error){return {message:error instanceof Error?error.message:'Check your working hours.'};}
 try {await persistAvailability(user.id,input);}
 catch(error){
  const code=error instanceof Error?error.message:'';
  if(code.includes('STALE_SCHEDULE'))return {message:'Your hours changed in another tab. Reload the saved hours before editing again.'};
  if(code.includes('TIMEZONE_REVIEW_REQUIRED'))return {message:'Future appointments or special dates need review before this time zone can change.'};
  return {message:'Could not save your hours. Retry with the same details, or reload the saved hours.'};
 }
 revalidatePath('/availability');redirect('/availability?saved=1');
}

export async function saveDateHours(_previous:{message:string},form:FormData){
 const user=await requireUser();let input;
 try{input=parseDateHours(form);}catch(error){return {message:error instanceof Error?error.message:'Check the date and hours.'};}
 try{await persistDateHours(user.id,input);}catch(error){
  const code=error instanceof Error?error.message:'';
  if(code.includes('STALE_SCHEDULE'))return {message:'This date or the weekly schedule changed in another tab. Reload saved hours before trying again.'};
  if(code.includes('APPOINTMENT_REVIEW_REQUIRED'))return {message:'This date has future appointments that need review. No hours or appointments were changed.'};
  if(code.includes('SAVE_WEEKLY_HOURS_FIRST'))return {message:'Save your weekly hours and time zone first.'};
  return {message:'Could not save this date. Retry with the same details or reload the saved hours.'};
 }
 revalidatePath('/availability');redirect('/availability?dateSaved=1');
}
