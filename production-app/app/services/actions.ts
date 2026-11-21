'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/require-user';
import { parseService, isUuid } from '@/lib/services/input';
import { saveService, archiveServiceRecord, setServiceDeleted } from '@/lib/services/persistence';
export async function createService(_previous: {message: string},form: FormData) {
  const user=await requireUser();
  let input;
  try { input=parseService(form); }
  catch(error) { return {message:error instanceof Error?error.message:'Check the service details.'}; }
  let id;
  try { id=await saveService(user.id,input); }
  catch(error) { return {message:error instanceof Error&&error.message.includes('STALE_SERVICE')?'This service changed in another tab. Refresh before editing again.':'Could not save this service. Retry with the same details, or refresh to start again.'}; }
  revalidatePath('/services');revalidatePath(`/services/${id}`);revalidatePath('/appointments');revalidatePath('/calendar');
  redirect(`/services/${id}?saved=1`);
}
export async function archiveService(_previous: {message: string},form: FormData) {
  const user=await requireUser();
  const id=String(form.get('serviceId')??'');
  if(!isUuid(id)) return {message:'Service unavailable.'};
  try { await archiveServiceRecord(user.id,id); }
  catch { return {message:'Service unavailable or could not be archived. Please try again.'}; }
  revalidatePath('/services');
  revalidatePath(`/services/${id}`);
  redirect('/services');
}

export async function deleteServiceAction(_previous:{message:string},form:FormData){
 const user=await requireUser();const id=String(form.get('serviceId')??''),revision=Number(form.get('revision'));if(!isUuid(id)||!Number.isSafeInteger(revision)||revision<1)return {message:'Refresh this service before continuing.'};
 try{await setServiceDeleted(user.id,id,revision,form.get('restore')!=='yes');}catch{return {message:'This service changed or is unavailable. Refresh and try again.'};}
 revalidatePath('/services');revalidatePath(`/services/${id}`);revalidatePath('/appointments');revalidatePath('/calendar');redirect('/services');
}
