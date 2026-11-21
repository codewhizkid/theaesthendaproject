import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/supabase/require-user';
import { readBusinessSetup } from '@/lib/business/persistence';
import { readServices } from '@/lib/services/persistence';
import {WorkspacePage} from '@/components/layout/workspace-page';
import { ServiceForm } from '@/components/services/service-form';
export default async function ServicesPage({searchParams}:{searchParams:Promise<{deleted?:string;type?:string;q?:string;new?:string}>}) {
 const user=await requireUser();
 const business=await readBusinessSetup(user.id);
 if(!business) redirect('/business');
 let services;
 try { services=await readServices(user.id); }
 catch { return <main className="p-8"><h1>Services are temporarily unavailable</h1><p>Please try again shortly.</p><Link href="/dashboard">Return to dashboard</Link></main>; }
 const params=await searchParams;
 const deleted=params.deleted==='1', adding=params.new==='1';
 const selectedType=typeof params.type==='string'?params.type.slice(0,80):'';
 const query=typeof params.q==='string'?params.q.slice(0,160):'';
 const catalog=services.filter(s=>(s.status==='archived')===deleted);
 const serviceTypes=[...new Set(services.map(s=>s.serviceType).filter(Boolean))].sort();
 const savedCategories=[...new Set(catalog.map(s=>s.serviceType).filter(Boolean))].sort();
 function categoryHref(type:string){const search=new URLSearchParams();if(query)search.set('q',query);if(type)search.set('type',type);if(deleted)search.set('deleted','1');return '/services'+(search.size?'?'+search.toString():'');}
 const visible=catalog.filter(s=>(!selectedType||s.serviceType===selectedType)&&(!query||`${s.name} ${s.serviceType}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b)=>a.name.localeCompare(b.name));
 const groups=[...new Set(visible.map(service=>service.serviceType))]
  .sort((a,b)=>(a||'Uncategorized').localeCompare(b||'Uncategorized'))
  .map(category=>({category,services:visible.filter(service=>service.serviceType===category)}));
 return <WorkspacePage title={adding?'Add a service':'Services'} description={adding?'Set the basics, then plan the time you need.':'Manage what you offer, how long it takes, and what you charge.'} businessName={business.businessName} narrow={adding} backHref={adding?'/services':'/dashboard'} backLabel={adding?'Services':'Dashboard'} action={!adding&&<Link className="aw-primary" href="/services?new=1">＋ Add service</Link>}>
 {adding?<section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-8"><ServiceForm requestKey={randomUUID()} serviceTypes={serviceTypes}/></section>:<section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
 <div className="space-y-5 border-b border-stone-200 p-5 sm:p-6"><nav aria-label="Service catalog" className="flex gap-6"><Link className={`inline-flex min-h-11 items-center border-b-2 ${!deleted?'border-[#382b3c] font-semibold':'border-transparent text-stone-500'}`} aria-current={!deleted?'page':undefined} href="/services">Your services <span className="ml-2 text-sm">({services.filter(s=>s.status==='draft').length})</span></Link><Link className={`inline-flex min-h-11 items-center border-b-2 ${deleted?'border-[#382b3c] font-semibold':'border-transparent text-stone-500'}`} aria-current={deleted?'page':undefined} href="/services?deleted=1">Deleted</Link></nav>
 <form method="get" className="flex flex-wrap items-end gap-3">{deleted&&<input type="hidden" name="deleted" value="1"/>}<label className="min-w-0 flex-1 basis-56 text-sm font-medium">Search services<input className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 px-3" type="search" name="q" defaultValue={query} placeholder="Search services"/></label>{selectedType&&<input type="hidden" name="type" value={selectedType}/>}<button className="min-h-11 rounded-lg border border-stone-300 px-5">Search</button>{(query||selectedType)&&<Link className="inline-flex min-h-11 items-center underline" href={deleted?'/services?deleted=1':'/services'}>Clear</Link>}</form>
 <nav aria-label="Saved categories" className="flex flex-wrap gap-2">{['',...savedCategories].map(type=><Link key={type} href={categoryHref(type)} aria-current={selectedType===type?'page':undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm ${selectedType===type?'border-[#382b3c] bg-[#382b3c] text-white':'border-stone-300 bg-white'}`}>{type||'All services'}</Link>)}</nav>
 {deleted&&<p className="text-sm text-stone-600">Open a service to restore it. Existing appointments keep their booked details.</p>}</div>
 {visible.length===0?<div className="space-y-3 p-8 text-center"><h2 className="font-serif text-2xl">{query||selectedType?'No matching services':deleted?'No deleted services':'Add your first service'}</h2><p className="text-stone-600">{query||selectedType?'Try another name or category.':deleted?'Services you delete will appear here.':'Start with a name, price, and appointment length.'}</p>{!deleted&&!query&&!selectedType&&<Link className="inline-flex min-h-11 items-center underline" href="/services?new=1">Add service</Link>}</div>:<div className="divide-y divide-stone-200">{groups.map(group=><section key={group.category} aria-label={group.category||'Uncategorized'}><header className="flex items-center gap-3 bg-[#f7f3ed] px-5 py-4 sm:px-6"><h2 className="break-words font-serif text-2xl">{group.category||'Uncategorized'}</h2><span className="shrink-0 text-sm text-stone-600">{group.services.length} {group.services.length===1?'service':'services'}</span></header><ul className="divide-y divide-stone-100">{group.services.map(s=><li key={s.id} className="flex flex-wrap items-center justify-between gap-4 p-5 sm:px-6"><div className="min-w-0 flex-1 basis-48"><Link className="break-words text-lg font-semibold underline decoration-stone-300 underline-offset-4" href={`/services/${s.id}`}>{s.name}</Link><p className="mt-2 text-sm">{s.durationMinutes} min{s.steps.some(step=>step.kind==='processing')?' · Includes processing time':''}</p></div><p className="font-semibold">{(s.priceCents/100).toLocaleString('en-US',{style:'currency',currency:s.currency})}</p><Link className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm" href={`/services/${s.id}${deleted?'':'?edit=1'}`}>{deleted?'View & restore':'Edit service'}</Link></li>)}</ul></section>)}</div>}
 </section>}
 </WorkspacePage>;
}
