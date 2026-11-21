 'use server';
import {requireUser} from '@/lib/supabase/require-user';
import {parseBookingDetails,buildBookingReview,type BookingReviewState} from '@/lib/appointments/client-booking-details';
import {loadClientPreviewTimes} from './lookup-actions';
export async function reviewClientBooking(_previous:BookingReviewState,form:FormData):Promise<BookingReviewState>{
 await requireUser();
 try{
  const input=parseBookingDetails(form);
  // The canonical lookup validates the date in the salon zone and narrows eligible slots.
  const date=String(form.get('date')??'');
  const availability=await loadClientPreviewTimes(input.serviceId,date);
  if(!availability.result)return {review:null,message:availability.message||'Choose an available time again.'};
  return {message:'',review:buildBookingReview(input,availability.result,new Date().toISOString())};
 }catch(error){return {review:null,message:error instanceof Error&&/^(Enter |Choose |This service has changed\.|That time is no longer offered\.)/.test(error.message)?error.message:'We couldn’t review this visit. Please try again.'};}
}
