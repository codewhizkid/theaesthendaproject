'use client';
import {useTransition} from 'react';
import {useRouter} from 'next/navigation';
export function RefreshDashboard(){
 const router=useRouter();const [pending,startTransition]=useTransition();
 return <button type="button" className="ae-refresh" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}>{pending?'Refreshing…':'Refresh today'}<span aria-hidden="true"> ↻</span></button>;
}
