'use client';
import Link from 'next/link';
export function SalonBrand({businessName,disabled=false}:{businessName?:string;disabled?:boolean}){
 return <Link href="/dashboard" className={`sn-brand ${disabled?'pointer-events-none':''}`} aria-disabled={disabled||undefined} tabIndex={disabled?-1:undefined} onClick={event=>{if(disabled)event.preventDefault();}} aria-label={`${businessName||'Your salon'} home`}><span className="sn-salon-name">{businessName||'Your salon'}</span><span className="sn-platform">aesthenda</span></Link>;
}
