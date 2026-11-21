import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
export type BookingPreferences={requireClientConfirmation:boolean;autoConfirm:boolean;revision:number;processingEnabled:boolean;maxConcurrentClients:number};
export async function readBookingPreferences(actor:string):Promise<BookingPreferences>{const db=await checkedRuntime();try{return (await db.query('select aesthenda_private.read_booking_preferences_v3($1::uuid) as result',[actor])).rows[0].result;}finally{db.release();}}
export async function saveBookingPreferences(actor:string,revision:number,autoConfirm:boolean,processingEnabled:boolean,maxConcurrentClients:number,requireClientConfirmation:boolean){const db=await checkedRuntime();try{await db.query('select aesthenda_private.save_booking_preferences_v3($1::uuid,$2::integer,$3::boolean,$4::boolean,$5::integer,$6::boolean)',[actor,revision,autoConfirm,processingEnabled,maxConcurrentClients,requireClientConfirmation]);}finally{db.release();}}
