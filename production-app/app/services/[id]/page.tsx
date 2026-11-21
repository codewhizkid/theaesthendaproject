import {WorkspacePage,WorkspacePanel} from '@/components/layout/workspace-page';
import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/supabase/require-user';
import { readServices } from '@/lib/services/persistence';
import { isUuid } from '@/lib/services/input';
import { DeleteServiceForm,ServiceForm } from '@/components/services/service-form';
export default async function ServicePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{edit?:string}>}) {
 const user=await requireUser();const edit=(await searchParams).edit==='1';
 const {id}=await params;
 if(!isUuid(id)) notFound();
 const catalog=await readServices(user.id);const service=catalog.find(item=>item.id===id);
 if(!service) notFound();
 return <WorkspacePage title={service.name} description={service.serviceType||'Uncategorized'} backHref="/services" backLabel="Services" narrow><WorkspacePanel>
<p>{service.status==='draft'?'Private draft':'Archived service'}</p><p className="whitespace-pre-wrap">{service.description}</p><p>{service.serviceType||'Uncategorized'} · {service.durationMinutes} minutes · {(service.priceCents/100).toLocaleString('en-US',{style:'currency',currency:service.currency})} fixed price</p><ol className="divide-y divide-stone-200 rounded-xl border border-stone-200">{service.steps.map((step,index)=><li className="flex flex-wrap justify-between gap-2 p-4" key={index}><strong>{step.label}</strong><span>{step.durationMinutes} min · {step.kind==='processing'?step.released?'Processing · another client can book':'Processing · double booking off':'Hands-on'}</span></li>)}</ol><p className="text-sm text-stone-600">Available for private salon bookings. Public booking is not published yet.</p>{service.steps.some(step=>step.released)&&<Link className="inline-block min-h-11 rounded-lg border border-stone-300 px-4 py-2 underline" href="/settings">Maximum clients at once</Link>}{service.status==='draft'&&<details open={edit}><summary className="cursor-pointer py-3 font-semibold underline">Edit service</summary><ServiceForm key={`${service.id}-${service.revision}`} requestKey={randomUUID()} service={service} serviceTypes={[...new Set(catalog.map(item=>item.serviceType).filter(Boolean))].sort()}/></details>}<details><summary className="cursor-pointer py-3 underline">{service.status==='draft'?'Delete service':'Restore service'}</summary><DeleteServiceForm id={service.id} revision={service.revision} deleted={service.status==='archived'}/></details></WorkspacePanel></WorkspacePage>;
}
