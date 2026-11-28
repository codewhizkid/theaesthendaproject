/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
'use client';
import {useEffect,useState} from 'react';
import {loadServiceChangeTimes,type AvailableTimes} from '@/app/appointments/lookup-actions';
import {validDate} from '@/lib/appointments/input';
export function useServiceChangeTimes(appointmentId:string,serviceId:string,date:string){
 const [retry,setRetry]=useState(0);const key=JSON.stringify([appointmentId,serviceId,date,retry]);
 const [response,setResponse]=useState<AvailableTimes&{key:string}>({key:'',result:null,message:''});
 const enabled=!!appointmentId&&!!serviceId&&validDate(date);
 useEffect(()=>{if(!enabled)return;let active=true;const timer=setTimeout(()=>{loadServiceChangeTimes(appointmentId,serviceId,date).then(result=>{if(active)setResponse({...result,key});}).catch(()=>{if(active)setResponse({key,result:null,message:'Could not load times. Please try again.'});});},150);return()=>{active=false;clearTimeout(timer);};},[enabled,appointmentId,serviceId,date,key]);
 return {loading:enabled&&response.key!==key,result:enabled&&response.key===key?response.result:null,message:enabled&&response.key===key?response.message:'',retry:()=>setRetry(value=>value+1)};
}
