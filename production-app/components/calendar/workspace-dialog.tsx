'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {DialogActionLayout} from './dialog-actions';
import {CalendarWorkspaceBusy} from './workspace-busy';
import {SalonBrand} from '@/components/layout/salon-brand';
import {useRouter} from 'next/navigation';
export function CalendarWorkspaceDialog({children,closeHref,title,businessName}:{children:ReactNode;closeHref:string;title:string;businessName:string}){
 const [busy,setBusy]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const router=useRouter();
 useEffect(()=>{dialog.current?.showModal();},[]);
 function close(){if(busy)return;router.push(closeHref,{scroll:false});}
 return <dialog ref={dialog} className="ac-dialog ac-workspace-dialog" aria-label={title} onCancel={event=>{event.preventDefault();close();}}><div className="sn-dialog-brand"><SalonBrand businessName={businessName} disabled={busy}/></div><DialogActionLayout onClose={close} disabled={busy} closeLabel={busy?'Saving…':'Close · Back to calendar'}><CalendarWorkspaceBusy.Provider value={setBusy}>{children}</CalendarWorkspaceBusy.Provider></DialogActionLayout></dialog>;
}
