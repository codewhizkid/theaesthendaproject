import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {DateHoursForm} from '@/components/availability/date-hours-form';
import {readDateHours,readAvailability} from '@/lib/availability/persistence';
import {AvailabilityForm,SavedHours} from '@/components/availability/availability-form';
import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
export default async function AvailabilityPage({searchParams}:{searchParams:Promise<{saved?:string;dateSaved?:string;edit?:string;section?:string}>}) {
 const user=await requireUser();const business=await readBusinessSetup(user.id);if(!business)redirect('/business');
 const schedule=await readAvailability(user.id);const entries=await readDateHours(user.id);const params=await searchParams;
 const editing=params.edit==='weekly'||schedule.revision===0;const special=params.section==='dates'||params.dateSaved==='1';
 const timezones=[...new Set(['UTC',...Intl.supportedValuesOf('timeZone'),...(schedule.timezone?[schedule.timezone]:[])])].sort();
 return <WorkspacePage title={editing?'Set weekly hours':'Availability'} businessName={business.businessName} description="Manage your regular working hours and exceptions for special dates." narrow={editing} backHref={editing&&schedule.revision>0?'/availability':'/dashboard'} backLabel={editing&&schedule.revision>0?'Availability':'Dashboard'} action={!editing&&!special&&<Link href="/availability?edit=weekly" className="aw-primary">Edit weekly hours</Link>}>
 {params.saved==='1'&&schedule.revision>0&&<p role="status" className="rounded-xl bg-[#e9eee5] p-4">Your weekly hours are saved.</p>}{params.dateSaved==='1'&&<p role="status" className="rounded-xl bg-[#e9eee5] p-4">Date hours saved. Your weekly schedule is unchanged.</p>}
 {editing?<WorkspacePanel title="Weekly schedule" description="Set your time zone and working periods for each day."><AvailabilityForm key={schedule.revision} schedule={schedule} requestKey={randomUUID()} timezones={timezones}/>{schedule.revision>0&&<Link href="/availability" className="aw-back mt-4">Cancel</Link>}</WorkspacePanel>:<><nav className="aw-tabs" aria-label="Availability views"><Link href="/availability" aria-current={!special?'page':undefined}>Weekly hours</Link><Link href="/availability?section=dates" aria-current={special?'page':undefined}>Special dates</Link></nav>{special?schedule.timezone?<DateHoursForm key={JSON.stringify(entries)+schedule.revision} entries={entries} weeklyRevision={schedule.revision} timezone={schedule.timezone} requestKey={randomUUID()}/>:<WorkspacePanel><p>Save weekly hours and a time zone before adding special dates.</p></WorkspacePanel>:<WorkspacePanel title="Your weekly schedule" description="Special dates override these hours. Changing hours does not move existing appointments."><SavedHours schedule={schedule} showHeading={false}/></WorkspacePanel>}</>}
 </WorkspacePage>;
}
