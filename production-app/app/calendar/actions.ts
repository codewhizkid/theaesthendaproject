'use server';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/supabase/require-user';
import {checkedRuntime} from '@/lib/business/persistence';
import {parseCalendarChange,type CalendarPreview,type PreviewResult} from '@/lib/calendar/changes';
import {uuid} from '@/lib/appointments/input';
function feedback(error:unknown){const message=error instanceof Error?error.message:'';if(message.includes('SEGMENT_CHOICE_REQUIRED'))return 'Choose which service step to extend, then review the timing.';if(message.includes('SLOT_UNAVAILABLE'))return 'That change does not fit your hours or conflicts with reserved time. The appointment has not changed.';if(message.includes('STALE_'))return 'This appointment changed elsewhere. Reload the calendar and review the latest time.';if(message.includes('AMBIGUOUS_OR_MISSING_TIME'))return 'That local time is affected by a daylight-saving change. Choose another time.';if(message.includes('NO_CHANGE'))return 'Choose a different time to move this appointment.';if(message.includes('INVALID_EXTENSION'))return 'Drag the end later to extend this appointment.';return 'Could not complete this change. Your appointment has not changed. Refresh and try again.';}
export async function previewCalendarChange(form:FormData):Promise<PreviewResult>{
 const user=await requireUser();let input;try{input=parseCalendarChange(form);}catch(error){return {message:feedback(error),preview:null};}
 let db;try{db=await checkedRuntime();const result=await db.query('select aesthenda_private.preview_calendar_change_v2($1::uuid,$2::uuid,$3::integer,$4::text,$5::date,$6::integer,$7::integer,$8::integer) as result',[user.id,input.id,input.revision,input.mode,input.date,input.minute,input.duration,input.step??null]);return {message:'',preview:result.rows[0].result as CalendarPreview};}catch(error){return {message:feedback(error),preview:null};}finally{db?.release();}
}
export async function saveCalendarChange(_previous:{message:string;saved:boolean},form:FormData){
 const user=await requireUser();let input;try{input=parseCalendarChange(form);}catch(error){return {message:feedback(error),saved:false};}
 const key=String(form.get('requestKey')??''),token=String(form.get('reviewToken')??'');
 if(!uuid(key)||!/^[0-9a-f]{32}$/.test(token)||form.get('confirmed')!=='yes')return {message:'Review and confirm the new time before saving.',saved:false};
 let db;try{db=await checkedRuntime();await db.query('select aesthenda_private.save_calendar_change_v2($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::date,$7::integer,$8::integer,$9::text,$10::integer)',[user.id,key,input.id,input.revision,input.mode,input.date,input.minute,input.duration,token,input.step??null]);}catch(error){return {message:feedback(error),saved:false};}finally{db?.release();}
 revalidatePath('/calendar');revalidatePath('/appointments');revalidatePath('/dashboard');revalidatePath(`/appointments/${input.id}`);revalidatePath(`/appointments/${input.id}/reschedule`);return {message:'',saved:true};
}
export async function undoCalendarChange(_previous:{message:string;saved:boolean},form:FormData){
 const user=await requireUser();const id=String(form.get('changeId')??'');
 if(!/^[1-9]\d{0,17}$/.test(id))return {message:'Refresh the calendar before using Undo.',saved:false};
 let db;try{db=await checkedRuntime();await db.query('select aesthenda_private.undo_calendar_change_v1($1::uuid,$2::bigint)',[user.id,id]);}
 catch(error){const text=error instanceof Error?error.message:'';return {saved:false,message:text.includes('STALE_')?'The calendar changed elsewhere. Refresh before using Undo.':text.includes('UNDO_CONFLICT')?'That time is no longer available. Nothing was changed.':text.includes('REVIEW')?'That change needs review and cannot be undone automatically.':'Could not undo this change. Refresh and try again.'};}finally{db?.release();}
 revalidatePath('/calendar');revalidatePath('/appointments','layout');revalidatePath('/dashboard');return {message:'Last calendar change undone.',saved:true};
}

