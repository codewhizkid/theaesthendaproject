'use client';
import {useEffect,useState} from 'react';
import {loadBookingTimes,type AvailableTimes} from '@/app/appointments/lookup-actions';
import {loadClientPreviewTimes} from '@/app/booking-preview/lookup-actions';
import {validDate} from '@/lib/appointments/input';
export function useAvailableTimes(mode:'book'|'reschedule'|'client-preview',id:string,date:string,clientId?:string){
 const [retry,setRetry]=useState(0);const key=JSON.stringify([mode,id,date,clientId,retry]);
 const [response,setResponse]=useState<AvailableTimes&{key:string}>({key:'',result:null,message:''});
 const enabled=!!id&&validDate(date);
 useEffect(()=>{
  if(!enabled)return;
  let active=true;const timer=setTimeout(()=>{
   (mode==='client-preview'?loadClientPreviewTimes(id,date):loadBookingTimes(mode,id,date,clientId)).then(result=>{if(active)setResponse({...result,key});}).catch(()=>{if(active)setResponse({key,result:null,message:'Could not load times. Please try again.'});});
  },150);
  return()=>{active=false;clearTimeout(timer);};
 },[enabled,mode,id,date,clientId,key]);
 // Never display slots belonging to a previous date/service while a read runs.
 return {loading:enabled&&response.key!==key,result:enabled&&response.key===key?response.result:null,message:enabled&&response.key===key?response.message:'',retry:()=>setRetry(value=>value+1)};
}
