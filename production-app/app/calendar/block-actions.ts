'use server';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/supabase/require-user';
import {checkedRuntime} from '@/lib/business/persistence';
import {parseBlock,type BlockResult} from '@/lib/blocks/input';
export async function saveBlockedTime(_previous:BlockResult,form:FormData):Promise<BlockResult>{
 const user=await requireUser();let db;
 try{
  const input=parseBlock(form);db=await checkedRuntime();
  const result=(await db.query('select aesthenda_private.save_block_v1($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::date,$6::integer,$7::integer,$8::text,$9::boolean) as result',[user.id,input.requestKey,input.id,input.revision,input.date,input.start,input.end,input.name,input.remove])).rows[0].result;
  if(result.conflicts.length)return {saved:false,message:'This time overlaps these appointments. Reschedule or cancel them, then try again. Nothing has changed.',conflicts:result.conflicts};
 }catch(error){
  const text=error instanceof Error?error.message:'';
  const message=text.includes('STALE_')?'This block changed elsewhere. Close this window and refresh before trying again.':text.includes('AMBIGUOUS_OR_MISSING_TIME')?'That time falls in a daylight-saving clock change. Choose another time.':text.includes('ACTIVE_HOLD_CONFLICT')?'A temporary booking hold overlaps this time. Wait for it to expire or choose another time.':text.includes('BLOCK_CONFLICT')?'Another blocked period overlaps this time. Edit that block or choose another time.':text.includes('HOURS_REQUIRED')?'Save your salon time zone in Availability first.':text.includes('INVALID_')?'Enter a name, date, and end time later than the start. The period must end in the future.':'Could not save this change. Refresh and try again.';
  return {message,saved:false,conflicts:[]};
 }finally{db?.release();}
 revalidatePath('/calendar');revalidatePath('/appointments');revalidatePath('/dashboard');
 return {message:'',saved:true,conflicts:[]};
}
