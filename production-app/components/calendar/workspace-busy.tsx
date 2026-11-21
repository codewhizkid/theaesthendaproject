'use client';
import {createContext,useContext,useEffect,type Dispatch,type SetStateAction} from 'react';
export const CalendarWorkspaceBusy=createContext<Dispatch<SetStateAction<boolean>>|undefined>(undefined);
export function useCalendarWorkspaceBusy(pending:boolean){
 const setBusy=useContext(CalendarWorkspaceBusy);
 useEffect(()=>{setBusy?.(pending);return()=>setBusy?.(false);},[pending,setBusy]);
}
