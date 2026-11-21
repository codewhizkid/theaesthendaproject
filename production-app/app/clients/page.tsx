import '@/components/calendar/calendar.css';
import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {readClients} from '@/lib/clients/persistence';
import {ClientForm} from '@/components/clients/client-form';
import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
export default async function ClientsPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;deleted?:string;new?:string}>}) {
 const user=await requireUser();const business=await readBusinessSetup(user.id);if(!business)redirect('/business');
 const params=await searchParams;const q=(typeof params.q==='string'?params.q:'').trim().slice(0,160);
 const rawPage=Number(params.page??0),page=Number.isSafeInteger(rawPage)&&rawPage>=0&&rawPage<=20000?rawPage:0;
 const deleted=params.deleted==='1',adding=params.new==='1';const {clients,hasMore}=await readClients(user.id,null,q,page,deleted);
 const pageLink=(value:number)=>'/clients?'+new URLSearchParams({q,page:String(value),...(deleted?{deleted:'1'}:{})}).toString();
 return <WorkspacePage title={adding?'Add a client':'Clients'} description={adding?'Save their contact details and preferences.':'Find a client, open their profile, or book their next visit.'} businessName={business.businessName} narrow={adding} backHref={adding?'/clients':'/dashboard'} backLabel={adding?'Clients':'Dashboard'} action={!adding&&<Link className="aw-primary" href="/clients?new=1">＋ Add client</Link>}>
 {adding?<WorkspacePanel title="Client details"><ClientForm requestKey={randomUUID()}/><Link className="aw-back mt-4" href="/clients">Cancel</Link></WorkspacePanel>:<section className="aw-panel"><div className="aw-panel-body space-y-5"><nav className="aw-tabs" aria-label="Client directory"><Link href="/clients" aria-current={!deleted?'page':undefined}>Your clients</Link><Link href="/clients?deleted=1" aria-current={deleted?'page':undefined}>Deleted</Link></nav>
 <form action="/clients" className="flex flex-wrap items-end gap-3">{deleted&&<input type="hidden" name="deleted" value="1"/>}<label className="min-w-0 flex-1 basis-56 text-sm font-medium">Search clients<input type="search" name="q" maxLength={160} defaultValue={q} placeholder="Name, email, or phone" className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 px-3 py-2"/></label><button className="aw-secondary">Search</button>{q&&<Link href={deleted?'/clients?deleted=1':'/clients'} className="aw-back">Clear</Link>}</form></div>
 {clients.length===0?<div className="aw-panel-body space-y-3 border-t border-stone-200 text-center"><h2 className="text-2xl font-semibold">{q?'No matching clients':deleted?'No deleted clients':page?'No more clients':'Add your first client'}</h2><p className="text-stone-600">{q?'Try another name, email, or phone.':deleted?'Deleted profiles will appear here.':page?'Go back to the previous page.':'Keep their details together for future visits.'}</p>{!q&&!deleted&&!page&&<Link className="aw-back" href="/clients?new=1">Add client</Link>}</div>:<ul className="border-t border-stone-200">{clients.map(c=><li key={c.id} className="aw-row"><div className="min-w-0 flex-1 basis-48"><Link className="break-words text-lg font-semibold underline decoration-stone-300 underline-offset-4" href={`/clients/${c.id}`}>{c.firstName} {c.lastName}</Link>{c.email&&<p className="mt-1 text-sm text-stone-600">{c.email}</p>}{c.phone&&<p className="mt-1 text-sm text-stone-600">{c.phone}</p>}</div><Link className="aw-secondary" href={`/clients/${c.id}`}>{deleted?'View & restore':'View profile'}</Link></li>)}</ul>}
 {(page>0||hasMore)&&<nav aria-label="Client pages" className="aw-panel-body flex justify-between gap-5 border-t border-stone-200">{page>0&&<Link className="aw-back" href={pageLink(page-1)}>← Previous</Link>}{hasMore&&<Link className="aw-back" href={pageLink(page+1)}>Next →</Link>}</nav>}</section>}
 </WorkspacePage>;
}
