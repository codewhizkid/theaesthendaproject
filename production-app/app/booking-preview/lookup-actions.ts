 'use server';
import {requireUser} from '@/lib/supabase/require-user';
import {readSlots} from '@/lib/appointments/persistence';
import {readClientBookingVisibility} from '@/lib/appointments/client-visibility-persistence';
import {visibleClientSlots} from '@/lib/appointments/client-visibility';
import {uuid,validDate} from '@/lib/appointments/input';
import type {AvailableTimes} from '@/app/appointments/lookup-actions';
export async function loadClientPreviewTimes(serviceId:string,date:string):Promise<AvailableTimes>{
 const user=await requireUser();
 if(typeof serviceId!=='string'||!uuid(serviceId)||typeof date!=='string'||!validDate(date))return {result:null,message:'Choose a service and a valid date.'};
 try{
  const [result,visibility]=await Promise.all([readSlots(user.id,serviceId,date),readClientBookingVisibility(user.id)]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:result.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(date<today)return {result:null,message:'Choose today or a future date.'};
  // Full slot lists stay server-side; client cannot choose a different percentage.
  return {result:{...result,slots:visibleClientSlots(result.slots.filter(slot=>Date.parse(slot.startAt)>Date.now()),visibility.showPercent)},message:''};
 }catch{return {result:null,message:'Available times could not be loaded. Please try again.'};}
}
