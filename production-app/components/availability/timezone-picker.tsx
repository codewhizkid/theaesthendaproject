'use client';
import {useState} from 'react';
const common = [
 ['America/New_York','Eastern — New York, Washington, DC'],
 ['America/Chicago','Central — Chicago, Dallas'],
 ['America/Denver','Mountain — Denver'],
 ['America/Phoenix','Arizona — Phoenix'],
 ['America/Los_Angeles','Pacific — Los Angeles, Seattle'],
 ['America/Anchorage','Alaska — Anchorage'],
 ['Pacific/Honolulu','Hawaii — Honolulu'],
];
export function timezoneLabel(zone:string){return common.find(([value])=>value===zone)?.[1]??zone.replaceAll('_',' ');}
export function TimezonePicker({saved,timezones}:{saved:string|null;timezones:string[]}){
 const [zone,setZone]=useState(saved??'');const [other,setOther]=useState(false);const [query,setQuery]=useState('');
 const choices=common.map(([value,label])=>({value,label}));
 if(saved&&!choices.some(c=>c.value===saved))choices.push({value:saved,label:timezoneLabel(saved)+' (saved)'});
 const matches=timezones.filter(z=>z.replaceAll('_',' ').toLowerCase().includes(query.trim().toLowerCase()));
 const visible=[...new Set([...(zone?[zone]:[]),...matches.slice(0,20)])];
 const field='min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900';
 return <div className="space-y-3"><input type="hidden" name="timezone" value={zone}/>
  <label className="block font-medium" htmlFor="timezone-choice">Salon time zone</label>
  <select className={field} id="timezone-choice" required value={other?'other':zone} onChange={e=>{if(e.target.value==='other'){setOther(true);}else{setZone(e.target.value);setOther(false);setQuery('');}}}>
   <option value="" disabled>Choose your time zone</option>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}<option value="other">Another location…</option>
  </select>
  {other&&<div className="space-y-3"><label className="block text-sm" htmlFor="timezone-search">Find a city or region</label><input className={field} id="timezone-search" type="search" placeholder="e.g. London or Toronto" value={query} onChange={e=>setQuery(e.target.value)}/>
   <label className="block text-sm" htmlFor="timezone-result">Matching time zones</label><select className={field} id="timezone-result" required value={zone} onChange={e=>setZone(e.target.value)}><option value="" disabled>Choose a matching location</option>{visible.map(z=><option key={z} value={z}>{timezoneLabel(z)}</option>)}</select>
   <p className="text-sm text-stone-600">{matches.length===0?'No matches. Try a nearby city.':matches.length>20?'Showing the first 20 matches. Type a city to narrow the list.':'Choose the location that matches your salon.'}</p>
  </div>}
 </div>;
}
