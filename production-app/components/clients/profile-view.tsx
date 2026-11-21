'use client';
import {useActionState,useId,useState} from 'react';
import Link from 'next/link';
import type {ClientRecord} from '@/lib/clients/input';
import {ClientForm} from './client-form';
import {PopupActions} from '@/components/calendar/dialog-actions';
import {CalendarContextFields} from '@/components/calendar/context-fields';
import {calendarHref,type CalendarContext} from '@/lib/calendar/navigation';
import {deleteClientAction} from '@/app/clients/actions';
import {useCalendarWorkspaceBusy} from '@/components/calendar/workspace-busy';
export function ClientProfileView({client,requestKey,calendar,appointmentId}:{client:ClientRecord;requestKey:string;calendar?:CalendarContext;appointmentId?:string}){
 const [editingPending,setEditingPending]=useState(false);
 const [editing,setEditing]=useState(false),[removing,setRemoving]=useState(false);const [state,action,pending]=useActionState(deleteClientAction,{message:''});const formId=useId();useCalendarWorkspaceBusy(pending);const deleted=client.status==='archived';
 if(editing)return <><ClientForm requestKey={requestKey} client={client} calendar={calendar} appointmentId={appointmentId} onPendingChange={setEditingPending}/><PopupActions><button className="ac-button" type="button" disabled={editingPending} onClick={()=>setEditing(false)}>Back to profile</button></PopupActions></>;
 return <div className="space-y-5"><dl className="grid gap-4"><div><dt className="text-sm text-stone-600">Phone</dt><dd>{client.phone||'No phone added'}</dd></div><div><dt className="text-sm text-stone-600">Email</dt><dd>{client.email||'No email added'}</dd></div>{client.notes&&<div><dt className="text-sm text-stone-600">Private notes</dt><dd className="whitespace-pre-wrap">{client.notes}</dd></div>}</dl>
 {deleted&&<p role="status" className="rounded-xl bg-stone-100 p-4">This client is deleted from your directory. Their appointment history is kept.</p>}
 {removing||deleted?<form id={formId} action={action} className="space-y-3"><CalendarContextFields context={calendar}/><input type="hidden" name="clientId" value={client.id}/><input type="hidden" name="revision" value={client.revision}/>{deleted&&<input type="hidden" name="restore" value="yes"/>}{!deleted&&<p>Remove this client from your directory? Their past appointments stay saved. You can restore the profile from Deleted clients.</p>}<PopupActions><button form={formId} disabled={pending} className="ac-button ac-primary">{pending?'Saving…':deleted?'Restore client':'Delete client'}</button>{!deleted&&<button type="button" disabled={pending} className="ac-button" onClick={()=>setRemoving(false)}>Keep client</button>}</PopupActions><p role="alert">{state.message}</p></form>:<PopupActions><Link className="ac-button ac-primary" scroll={calendar?false:undefined} href={calendar?calendarHref(calendar,'book',{client:client.id}):`/appointments?client=${client.id}`}>Book appointment</Link><button type="button" className="ac-button" onClick={()=>setEditing(true)}>Edit profile</button><button type="button" className="ac-button" onClick={()=>setRemoving(true)}>Delete client</button></PopupActions>}
 </div>;
}
