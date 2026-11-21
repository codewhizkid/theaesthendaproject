'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {searchBookingClients,type BookingClient,type ClientChoices} from '@/app/appointments/lookup-actions';
import type {Service} from '@/lib/services/input';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import {validDate} from '@/lib/appointments/input';
import {BookingDayCalendar} from './booking-day-calendar';
import {AppointmentForm} from './appointment-form';
import {useAvailableTimes} from './use-available-times';
const field='mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2';
export function BookingPicker({initialClients,initialQuery,initialClient,services,initialService,initialDate,preferredMinute,calendar,requestKey:initialKey}:{initialClients:ClientChoices;initialQuery:string;initialClient?:BookingClient;services:Service[];initialService:string;initialDate:string;preferredMinute?:number;calendar?:CalendarContext;requestKey:string}){
 const [client,setClient]=useState(initialClient);const [query,setQuery]=useState(initialQuery);const [clientRetry,setClientRetry]=useState(0);
 const [directory,setDirectory]=useState<ClientChoices&{key:string}>({...initialClients,key:JSON.stringify([initialQuery,0])});
 const searchKey=JSON.stringify([query,clientRetry]);const [visibleCount,setVisibleCount]=useState(8);
 const [category,setCategory]=useState<string|null>(null);
 const categories=[...new Set(services.map(item=>item.serviceType||''))].sort((a,b)=>(a||'Uncategorized').localeCompare(b||'Uncategorized'));
 const [serviceId,setServiceId]=useState(initialService);const [serviceQuery,setServiceQuery]=useState('');const [choosingService,setChoosingService]=useState(!initialService);
 const [chosenMinute,setChosenMinute]=useState(preferredMinute);
 const [date,setDate]=useState(initialDate);const [requestKey,setRequestKey]=useState(initialKey);const [saving,setSaving]=useState(false);
 const times=useAvailableTimes('book',serviceId,date,client?.id);const service=services.find(item=>item.id===serviceId);
 const selectedService=times.result?.service.id===serviceId?times.result.service:service;
 const matches=services.filter(item=>(category===null||(item.serviceType||'')===category)&&`${item.name} ${item.description} ${item.serviceType??''}`.toLocaleLowerCase().includes(serviceQuery.trim().toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
 const groups=categories.map(category=>({category,services:matches.filter(item=>(item.serviceType||'')===category)})).filter(group=>group.services.length);
 useEffect(()=>{
  if(client)return;
  let active=true;const timer=setTimeout(()=>{searchBookingClients(query).then(result=>{if(active)setDirectory({...result,key:searchKey});}).catch(()=>{if(active)setDirectory({key:searchKey,clients:[],hasMore:false,message:'Clients could not be loaded. Try again.'});});},200);
  return()=>{active=false;clearTimeout(timer);};
 },[client,query,searchKey]);
 const clientsLoading=!client&&directory.key!==searchKey;
 const resetSave=()=>setRequestKey(crypto.randomUUID());
 return <div className={calendar?'space-y-6':'ab-booking-layout'}><div className="space-y-6">
 <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
 <section className="ab-step" aria-labelledby="booking-client-title"><h2 id="booking-client-title" className="font-serif text-2xl">1. Client</h2>
 {client?<div className="ab-selected"><div><strong>{client.firstName} {client.lastName}</strong><p className="text-sm text-stone-600">{client.email||client.phone}</p></div><button type="button" className="ac-button" onClick={()=>{setClient(undefined);setQuery('');resetSave();}}>Change<span className="sr-only"> client</span></button></div>:<>
 <label className="block"><span className="sr-only">Find a client</span><input type="search" className={field} maxLength={160} value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(8);}} placeholder="Search name, phone or email" autoComplete="off"/></label>
 <div aria-live="polite" aria-busy={clientsLoading}>{clientsLoading?<p className="py-4 text-sm">Searching clients…</p>:directory.message?<p role="alert">{directory.message} <button type="button" className="underline" onClick={()=>setClientRetry(value=>value+1)}>Try again</button></p>:<>
 <div className="ab-choices">{directory.clients.slice(0,visibleCount).map(item=><button type="button" className="ab-choice" key={item.id} onClick={()=>{setClient(item);resetSave();}}><strong>{item.firstName} {item.lastName}</strong><span>{item.email||item.phone}</span><span className="ab-choice-arrow" aria-hidden="true">＋</span></button>)}</div>
 {!directory.clients.length&&<p className="py-4 text-sm">{query?'No matching clients. Create a profile below.':'No clients yet. Create your first profile below.'}</p>}
 {directory.clients.length>visibleCount&&<button type="button" className="min-h-11 underline" onClick={()=>setVisibleCount(count=>count+8)}>Show more clients</button>}{directory.hasMore&&<p className="mt-2 text-sm text-stone-600">Keep typing to narrow the results.</p>}
 </>}</div></>}
 <Link className={`mt-2 inline-flex min-h-11 items-center underline ${saving?'pointer-events-none opacity-50':''}`} aria-disabled={saving||undefined} tabIndex={saving?-1:undefined} scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'newclient',{client:client?.id,date,service:serviceId,minute:chosenMinute===undefined?undefined:String(chosenMinute)}):'/clients?new=1'}>＋ New client</Link>
 </section>
 <section className="ab-step" aria-labelledby="booking-service-title"><h2 id="booking-service-title" className="font-serif text-2xl">2. Service</h2>
 {selectedService&&!choosingService?<div className="ab-selected"><div><strong>{selectedService.name}</strong><p className="text-sm text-stone-600">{selectedService.durationMinutes} min · {(selectedService.priceCents/100).toLocaleString('en-US',{style:'currency',currency:selectedService.currency})}</p></div><button type="button" className="ac-button" onClick={()=>setChoosingService(true)}>Change<span className="sr-only"> service</span></button></div>:<>
 {services.length>0&&<label className="block"><span className="sr-only">Find a service</span><input type="search" className={field} value={serviceQuery} onChange={event=>setServiceQuery(event.target.value)} placeholder="Search services"/></label>}
 <div className="aw-categories mt-3" role="group" aria-label="Service categories"><button type="button" className="aw-category" aria-pressed={category===null} onClick={()=>setCategory(null)}>All services</button>{categories.map(type=><button type="button" key={type} className="aw-category" aria-pressed={category===type} onClick={()=>setCategory(type)}>{type||'Uncategorized'}</button>)}</div>
 <div className="aw-service-groups">{groups.map(group=><section className="aw-service-group" key={group.category} aria-label={group.category||'Uncategorized'}><h3>{group.category||'Uncategorized'} <span className="ml-2 text-sm font-normal text-stone-600">({group.services.length})</span></h3><div className="ab-service-choices">{group.services.map(item=><button type="button" aria-pressed={serviceId===item.id} className="ab-choice" key={item.id} onClick={()=>{setServiceId(item.id);setChoosingService(false);resetSave();}}><strong>{item.name}</strong><span>{item.durationMinutes} min · {(item.priceCents/100).toLocaleString('en-US',{style:'currency',currency:item.currency})}</span></button>)}</div></section>)}</div>

 {!matches.length&&<p className="py-3 text-sm">{services.length?'No matching services.':'Add a service before booking.'} <Link className="underline" href="/services">Manage services</Link></p>}
 </>}
 </section>
 <label className="block font-semibold">3. Date<input className={field} type="date" value={date} min="2000-01-01" max="2100-12-31" required onChange={event=>{setDate(event.target.value);resetSave();}}/></label>
 </fieldset>
 <section className="ab-step" aria-labelledby="booking-times-title"><h2 id="booking-times-title" className="font-serif text-2xl">4. Available times</h2>
 {!serviceId?<p className="text-sm text-stone-600">Choose a service to see times.</p>:!validDate(date)?<p role="status">Choose a valid date.</p>:times.loading?<p role="status" className="ab-loading">Checking availability…</p>:times.message?<p role="alert">{times.message} <button type="button" className="ac-button" onClick={times.retry}>Try again</button></p>:times.result&&<AppointmentForm key={`${client?.id??''}-${serviceId}-${date}-${times.result.service.token}-${chosenMinute??''}`} calendar={calendar} requestKey={requestKey} clientId={client?.id??''} clientName={client?`${client.firstName} ${client.lastName}`:''} date={date} result={times.result} preferredMinute={chosenMinute} compact onPendingChange={setSaving} onTimeChange={setChosenMinute} onRefresh={times.retry}/>}
 </section>
 </div>{!calendar&&<BookingDayCalendar date={date} disabled={saving} onSelectTime={(nextDate,minute)=>{if(saving)return;setDate(nextDate);setChosenMinute(minute);resetSave();}}/>}</div>;
}
