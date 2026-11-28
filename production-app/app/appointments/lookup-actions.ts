/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
'use server';
import {requireUser} from '@/lib/supabase/require-user';
import {readClients,clientContactMatches} from '@/lib/clients/persistence';
import {readSlots,readRescheduleSlots,readServiceChangeSlots,readCalendar} from '@/lib/appointments/persistence';
import {uuid,validDate,type SlotResult} from '@/lib/appointments/input';
export type BookingClient={id:string;firstName:string;lastName:string;email:string;phone:string};
export type ClientChoices={clients:BookingClient[];hasMore:boolean;message:string};
export type AvailableTimes={result:(SlotResult&{revision?:number;moveToken?:string;changeToken?:string})|null;message:string};
export async function searchBookingClients(query:string):Promise<ClientChoices>{
 const user=await requireUser();
 if(typeof query!=='string'||query.length>160)return {clients:[],hasMore:false,message:'Search by name, email or phone (up to 160 characters).'};
 try{
  const term=query.trim();const phoneSearch=term.length<=40&&/^[+0-9 ().-]+$/.test(term)&&term.replace(/\D/g,'').length>=7;
  const [result,contacts]=await Promise.all([readClients(user.id,null,term),phoneSearch?clientContactMatches(user.id,'',term):Promise.resolve([])]);
  // Existing owner-scoped contact matching ignores phone punctuation. Re-read
  // only those bounded matches so search cards use the same client contract.
  const extra=await Promise.all(contacts.filter(match=>!result.clients.some(client=>client.id===match.id)).map(match=>readClients(user.id,match.id)));
  const clients=[...result.clients,...extra.flatMap(directory=>directory.clients)];
  return {clients:clients.map(({id,firstName,lastName,email,phone})=>({id,firstName,lastName,email,phone})),hasMore:result.hasMore,message:''};
 }
 catch{return {clients:[],hasMore:false,message:'Clients could not be loaded. Try again.'};}
}
export async function loadBookingTimes(mode:'book'|'reschedule',id:string,date:string,clientId?:string):Promise<AvailableTimes>{
 const user=await requireUser();
 if(clientId!==undefined&&(typeof clientId!=='string'||!uuid(clientId)))return {result:null,message:'Choose a client again.'};
 if(!['book','reschedule'].includes(mode)||typeof id!=='string'||!uuid(id)||typeof date!=='string'||!validDate(date))return {result:null,message:mode==='reschedule'?'Refresh the appointment and choose a valid date.':'Choose a service and a valid date.'};
 try{return {result:mode==='reschedule'?await readRescheduleSlots(user.id,id,date):await readSlots(user.id,id,date,clientId??null),message:''};}
 catch{return {result:null,message:'Available times could not be loaded. Try again, or check your saved hours.'};}
}
export async function loadServiceChangeTimes(id:string,serviceId:string,date:string):Promise<AvailableTimes>{
 const user=await requireUser();
 if(typeof id!=='string'||!uuid(id)||typeof serviceId!=='string'||!uuid(serviceId)||typeof date!=='string'||!validDate(date))return {result:null,message:'Choose a service and a valid date.'};
 try{return {result:await readServiceChangeSlots(user.id,id,serviceId,date),message:''};}
 catch(error){const message=error instanceof Error?error.message:'';return {result:null,message:message.includes('APPOINTMENT_REQUIRES_REVIEW')?'This appointment can no longer be changed. Reload its current details.':message.includes('NO_SERVICE_CHANGE')?'Choose a different service.':'Available times could not be loaded. Try again, or check your saved hours.'};}
}

export async function loadBookingDay(date:string){const user=await requireUser();if(typeof date!=='string'||!validDate(date))return {day:null,processingEnabled:false,message:'Choose a valid date.'};try{const result=await readCalendar(user.id,[date]);return {day:result.days[0],processingEnabled:result.processingEnabled,message:''};}catch{return {day:null,processingEnabled:false,message:'Could not load this day. Try again.'};}}
