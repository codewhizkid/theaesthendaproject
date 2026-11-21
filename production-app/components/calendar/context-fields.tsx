import type {CalendarContext} from '@/lib/calendar/navigation';
export function CalendarContextFields({context,panel,id}:{context?:CalendarContext;panel?:string;id?:string}){
 return context?<><input type="hidden" name="calendarDate" value={context.date}/><input type="hidden" name="calendarView" value={context.view}/>{panel&&<><input type="hidden" name="view" value={context.view}/><input type="hidden" name="panel" value={panel}/>{id&&<input type="hidden" name="id" value={id}/>}</>}</>:null;
}
