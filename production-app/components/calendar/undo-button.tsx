'use client';
import {useActionState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {undoCalendarChange} from '@/app/calendar/actions';
export function UndoButton({change}:{change:{id:string;label:string}|null}){
 const router=useRouter();const [state,action,pending]=useActionState(undoCalendarChange,{message:'',saved:false});
 useEffect(()=>{if(state.saved)router.refresh();},[state.saved,router]);
 return <form action={action} className="ac-undo"><input type="hidden" name="changeId" value={change?.id??''}/><button className="ac-button" disabled={!change||pending} title={change?`Undo: ${change.label}`:'No recent calendar change to undo'}>{pending?'Undoing…':'↶ Undo'}</button>{change&&<span className="sr-only">Last change: {change.label}</span>}<span role="status">{state.message}</span></form>;
}
