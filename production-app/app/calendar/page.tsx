import Link from 'next/link';
import {WorkspacePage} from '@/components/layout/workspace-page';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {readAppointments,readCalendar} from '@/lib/appointments/persistence';
import {validDate} from '@/lib/appointments/input';
import {weekDates,shiftDate,dateLabel} from '@/lib/calendar/display';
import {CalendarGrid} from '@/components/calendar/calendar-grid';
import {calendarHref,calendarPanel,type CalendarSearch} from '@/lib/calendar/navigation';
import {CalendarWorkspaceDialog} from '@/components/calendar/workspace-dialog';
import {AppointmentBookingWorkspace} from '@/components/appointments/booking-workspace';
import {AppointmentDetailsWorkspace} from '@/components/appointments/details-workspace';
import {AppointmentRescheduleWorkspace} from '@/components/appointments/reschedule-workspace';
import {ClientProfileWorkspace,ClientCreateWorkspace} from '@/components/clients/profile-workspace';
import {UndoButton} from '@/components/calendar/undo-button';
export default async function CalendarPage({searchParams}:{searchParams:Promise<CalendarSearch>}){
 const user=await requireUser();const business=await readBusinessSetup(user.id);if(!business)redirect('/business');
 const params=await searchParams;const panel=calendarPanel(params);const current=await readAppointments(user.id);const requestedDate=panel?params.calendarDate??params.date:params.date;const date=typeof requestedDate==='string'&&validDate(requestedDate)?requestedDate:current.date;const view=params.view==='day'?'day':'week';
 const dates=view==='day'?[date]:weekDates(date).filter(validDate);const {days,undo}=await readCalendar(user.id,dates);
 const calendar={date,view} as const;
 const href=(d:string,v=view)=>`/calendar?view=${v}&date=${d}`;const previous=shiftDate(date,view==='day'?-1:-7),next=shiftDate(date,view==='day'?1:7);
 return <WorkspacePage title="Calendar" businessName={business.businessName} description={current.timezone?`Salon time zone · ${current.timezone.replaceAll('_',' ')}`:'Save a time zone in Availability to begin booking.'} wide>
 <section className="ac-calendar-surface" aria-label="Calendar schedule"><div className="ac-toolbar">
   <div className="ac-view-controls">
   <nav aria-label="Calendar view" className="ac-view"><Link href={href(date,'day')} aria-current={view==='day'?'page':undefined}>Day</Link><Link href={href(date,'week')} aria-current={view==='week'?'page':undefined}>Week</Link></nav>
   <nav aria-label="Calendar dates" className="ac-navigation">{validDate(previous)&&<Link href={href(previous)} aria-label={`Previous ${view}`}>← Previous</Link>}<Link href={href(current.date)}>Today</Link>{validDate(next)&&<Link href={href(next)} aria-label={`Next ${view}`}>Next →</Link>}</nav>
  </div>
 <h2 className="ac-range">{view==='day'?dateLabel(date,true):`${dateLabel(dates[0])}${dates[0].slice(0,4)!==dates.at(-1)!.slice(0,4)?`, ${dates[0].slice(0,4)}`:""} – ${dateLabel(dates.at(-1)!)} · ${dates.at(-1)!.slice(0,4)}`}</h2>
  <form action="/calendar" className="ac-date-jump"><input type="hidden" name="view" value={view}/><label>Go to date<input type="date" name="date" required min="2000-01-01" max="2100-12-31" defaultValue={date}/></label><button>Go</button></form>

 </div>
<CalendarGrid days={days} today={current.date} calendar={calendar}/></section><div className="ac-bottom-actions"><UndoButton key={undo?.id??'none'} change={undo}/></div>{panel&&<CalendarWorkspaceDialog businessName={business.businessName} key={`${panel}-${params.id??''}`} closeHref={calendarHref(calendar)} title={panel==='book'?'New appointment':panel==='reschedule'?'Reschedule appointment':panel==='client'?'Client profile':panel==='newclient'?'New client':'Appointment details'}>{panel==='newclient'?<ClientCreateWorkspace searchParams={Promise.resolve(params)} calendar={calendar}/>:panel==='book'?<AppointmentBookingWorkspace searchParams={Promise.resolve(params)} calendar={calendar}/>:panel==='appointment'?<AppointmentDetailsWorkspace params={Promise.resolve({id:params.id!})} searchParams={Promise.resolve(params)} calendar={calendar}/>:panel==='client'?<ClientProfileWorkspace params={Promise.resolve({id:params.id!})} searchParams={Promise.resolve(params)} calendar={calendar}/>:<AppointmentRescheduleWorkspace params={Promise.resolve({id:params.id!})} searchParams={Promise.resolve(params)} calendar={calendar}/>}</CalendarWorkspaceDialog>}</WorkspacePage>;
}
