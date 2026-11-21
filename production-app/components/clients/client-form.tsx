'use client';
import Link from 'next/link';
import {useActionState,useState,useId,useEffect} from 'react';
import {saveClientAction} from '@/app/clients/actions';
import {emptyPreferences,clientEmailError,clientPhoneError,type ClientRecord,type CommunicationPreferences} from '@/lib/clients/input';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {useCalendarWorkspaceBusy} from '@/components/calendar/workspace-busy';
import {CalendarContextFields} from '@/components/calendar/context-fields';
import {calendarHref,type CalendarContext,type AppointmentSearch} from '@/lib/calendar/navigation';
const field='mt-2 w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900';
export function ClientForm({requestKey,client,calendar,appointmentId,booking,onPendingChange}:{onPendingChange?:(pending:boolean)=>void;requestKey:string;client?:ClientRecord;calendar?:CalendarContext;appointmentId?:string;booking?:AppointmentSearch}) {
 const [state,action,pending]=useActionState(saveClientAction,{message:''});const formId=useId();useCalendarWorkspaceBusy(pending);
 useEffect(()=>{onPendingChange?.(pending);return()=>onPendingChange?.(false);},[pending,onPendingChange]);
 const [email,setEmail]=useState(client?.email??'');const [phone,setPhone]=useState(client?.phone??'');
 const [preferences,setPreferences]=useState<CommunicationPreferences>(client?.preferences??emptyPreferences);
 const [touched,setTouched]=useState({email:false,phone:false});const emailError=touched.email?clientEmailError(email.trim()):'';const phoneError=touched.phone?clientPhoneError(phone.trim()):'';
 const contactChanged=!!client&&(email.trim()!==client.email||phone.trim()!==client.phone);
 function changeEmail(value:string){setEmail(value);setPreferences(p=>({...p,updatesEmail:false,marketingEmail:false,preferredContact:p.preferredContact==='email'?'none':p.preferredContact}));}
 function changePhone(value:string){setPhone(value);setPreferences(p=>({...p,updatesText:false,marketingText:false,preferredContact:['phone','text'].includes(p.preferredContact)?'none':p.preferredContact}));}
 function choice(key:'updatesEmail'|'updatesText'|'marketingEmail'|'marketingText',label:string,available:boolean){return <label className="cp-channel"><span className="sr-only">{label}</span><input type="checkbox" name={key} aria-label={label} title={available?label:`Add ${key.endsWith('Email')?'email':'phone'} to enable this channel`} disabled={!available} checked={preferences[key]&&available} onChange={e=>setPreferences(p=>({...p,[key]:e.target.checked}))}/></label>;}
 const permissionNeeded=(['updatesEmail','updatesText','marketingEmail','marketingText'] as const).some(key=>preferences[key]&&(!client||!client.preferences?.[key]||(key.endsWith('Email')?email.trim()!==client.email:phone.trim()!==client.phone)));
 return <form id={formId} action={action} className="space-y-5">
 <CalendarContextFields context={calendar}/>{booking&&<><input type="hidden" name="returnToBooking" value="yes"/><input type="hidden" name="bookDate" value={booking.date??''}/><input type="hidden" name="bookService" value={booking.service??''}/><input type="hidden" name="bookMinute" value={booking.minute??''}/></>}{appointmentId&&<input type="hidden" name="returnAppointment" value={appointmentId}/>}
 <input type="hidden" name="actionVersion" value="1"/><input type="hidden" name="requestKey" value={requestKey}/><input type="hidden" name="clientId" value={client?.id??''}/><input type="hidden" name="revision" value={client?.revision??0}/>
 <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
 <div className="grid gap-5 sm:grid-cols-2"><label className="block">First name<input name="firstName" className={field} defaultValue={client?.firstName} required maxLength={80} autoComplete="given-name"/></label><label className="block">Last name (optional)<input name="lastName" className={field} defaultValue={client?.lastName} maxLength={80} autoComplete="family-name"/></label></div>
 <p className="text-sm text-stone-600">Add at least one contact method: phone number or email.</p>
 <label className="block">Email<input name="email" className={field} value={email} onChange={e=>changeEmail(e.target.value)} onBlur={()=>setTouched(t=>({...t,email:true}))} aria-invalid={!!emailError} aria-describedby={emailError?`${formId}-email-error`:undefined} required={!phone.trim()} type="email" maxLength={254} autoComplete="email"/>{emailError&&<span id={`${formId}-email-error`} role="status" className="mt-2 block text-sm text-red-800">{emailError}</span>}</label>
 <label className="block">Phone<input name="phone" className={field} value={phone} onChange={e=>changePhone(e.target.value)} onBlur={()=>setTouched(t=>({...t,phone:true}))} aria-invalid={!!phoneError} aria-describedby={phoneError?`${formId}-phone-error`:undefined} required={!email.trim()} type="tel" maxLength={40} autoComplete="tel"/>{phoneError&&<span id={`${formId}-phone-error`} role="status" className="mt-2 block text-sm text-red-800">{phoneError}</span>}</label>
 <section className="space-y-3 rounded-xl border border-stone-200 p-4" aria-labelledby={`${formId}-preferences`}>
 <h3 id={`${formId}-preferences`} className="font-serif text-2xl">Messages</h3>
 <p className="text-sm text-stone-600">Choose the channels your client agreed to.</p>
 {contactChanged&&<p role="status" className="rounded-lg bg-amber-50 p-3">Contact details changed. Review permission for the new address or number.</p>}
 <table className="cp-preferences"><thead><tr><th scope="col"><span className="sr-only">Message type</span></th><th scope="col">Email</th><th scope="col">Text</th></tr></thead><tbody>
 <tr><th scope="row">Appointment updates<span>Bookings & reminders</span></th><td>{choice('updatesEmail','Appointment updates by email',!!email.trim())}</td><td>{choice('updatesText','Appointment updates by text',!!phone.trim())}</td></tr>
 <tr><th scope="row">Marketing<span>Offers & news · optional</span></th><td>{choice('marketingEmail','Marketing by email',!!email.trim())}</td><td>{choice('marketingText','Marketing by text',!!phone.trim())}</td></tr>
 </tbody></table>
 {(!email.trim()||!phone.trim())&&<p className="text-sm text-stone-500">Add {!email.trim()&&!phone.trim()?'contact details':!email.trim()?'an email address':'a phone number'} above to enable the other channels.</p>}
 <fieldset><legend className="text-sm font-semibold">Preferred contact</legend><div className="cp-contact-choices">{([['none','No preference'],...(email.trim()?[['email','Email']]:[]),...(phone.trim()?[['phone','Call'],['text','Text']]:[])]).map(([value,label])=><label key={value}><input name="preferredContact" type="radio" value={value} checked={preferences.preferredContact===value} onChange={()=>setPreferences(p=>({...p,preferredContact:value as CommunicationPreferences['preferredContact']}))}/>{label}</label>)}</div></fieldset>
 {permissionNeeded?<label className="block">How did the client give permission?<select name="consentMethod" required defaultValue="" className={field}><option value="" disabled>Choose permission source</option><option value="verbal">Client told me directly</option><option value="written">Client gave written permission</option></select></label>:<input type="hidden" name="consentMethod" value="not_given"/>}
 {client?.preferencesRecordedAt&&<p className="text-sm text-stone-500">Preferences last recorded {new Date(client.preferencesRecordedAt).toLocaleDateString('en-US',{timeZone:'UTC'})}. Source: salon record.</p>}
 <p className="text-sm text-stone-600">Automatic messaging is not connected yet.</p>
 </section>
 <label className="block">Private notes (optional)<textarea name="notes" className={field} defaultValue={client?.notes} rows={4} maxLength={2000}/></label>
 {state.matches&&state.matches.length>0&&<section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">Existing client found</h3>{state.matches.map(match=><Link className="block underline" key={match.id} href={calendar?booking?calendarHref(calendar,'book',{...booking,client:match.id}):calendarHref(calendar,'client',{id:match.id,returnAppointment:appointmentId}):`/clients/${match.id}`}>{booking?'Use existing client: ': 'Open profile: '}{match.name}</Link>)}<label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="duplicateReviewed"/>Create a separate profile using these shared contact details</label></section>}
 </fieldset><PopupActions><button form={formId} name="afterSave" value="profile" disabled={pending} className="ac-button ac-primary">{pending?'Saving…':"Save client's information"}</button><button form={formId} name="afterSave" value="book" disabled={pending} className="ac-button">Save & book appointment</button></PopupActions><p role="alert">{state.message}</p>
 </form>;
}
