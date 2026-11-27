import 'server-only';
import {checkedRuntime} from '@/lib/business/persistence';
import {parseBookingTheme,type BookingThemeState} from './input';
export async function readBookingPageTheme(actor:string):Promise<BookingThemeState>{
 const db=await checkedRuntime();
 try{
  const result=await db.query('select aesthenda_private.read_booking_page_theme_v1($1::uuid) as result',[actor]);
  const value=result.rows[0]?.result;
  if(!value) throw new Error('Booking page settings are unavailable.');
  return {theme:parseBookingTheme(value.theme),revision:Number(value.revision)};
 }finally{db.release();}
}
export async function saveBookingPageTheme(actor:string,revision:number,theme:unknown):Promise<void>{
 const value=parseBookingTheme(theme);
 const db=await checkedRuntime();
 try{
  await db.query('select aesthenda_private.save_booking_page_theme_v1($1::uuid,$2::integer,$3::jsonb)',[actor,revision,JSON.stringify(value)]);
 }finally{db.release();}
}
