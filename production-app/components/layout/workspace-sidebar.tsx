'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {SignOutButton} from '@/components/auth/sign-out-button';
import {SalonBrand} from './salon-brand';
import {DashboardIcon,type IconName} from './workspace-icons';
const pages:{href:string;label:string;icon:IconName}[]=[
 {href:'/dashboard',label:'Today',icon:'today'},
 {href:'/calendar',label:'Calendar',icon:'calendar'},
 {href:'/appointments',label:'Appointments',icon:'calendar'},
 {href:'/clients',label:'Clients',icon:'clients'},
 {href:'/services',label:'Services',icon:'services'},
 {href:'/availability',label:'Availability',icon:'clock'},
 {href:'/booking-preview',label:'Booking Page',icon:'link'},
 {href:'/settings',label:'Booking & notifications',icon:'settings'},
];
const upcoming:{label:string;icon:IconName}[]=[{label:'Payments',icon:'payment'},{label:'Communications',icon:'mail'},{label:'Analytics',icon:'chart'}];
function AccountMenu({businessName,professionalName}:{businessName?:string;professionalName?:string}){
 return <details className="sn-account"><summary><span className="sn-avatar" aria-hidden="true">{Array.from(professionalName?.trim()||businessName||'S')[0].toUpperCase()}</span><span><strong>{professionalName||'Your account'}</strong><span>Salon account</span></span><span aria-hidden="true">⌄</span></summary><div className="sn-account-options"><Link href="/dashboard#business-details">Business details</Link><SignOutButton/></div></details>;
}
export function WorkspaceSidebar({businessName,professionalName}:{businessName?:string;professionalName?:string}){
 const pathname=usePathname();const current=pages.find(page=>pathname===page.href||pathname.startsWith(page.href+'/'));
 const navigation=<nav aria-label="Main navigation" className="sn-navigation">{pages.map(page=><Link href={page.href} key={page.href} className="sn-nav-item" aria-current={current?.href===page.href?'page':undefined}><DashboardIcon name={page.icon}/><span>{page.label}</span></Link>)}{upcoming.map(page=><span key={page.label} className="sn-nav-item sn-unavailable" aria-disabled="true"><DashboardIcon name={page.icon}/><span>{page.label}<span className="sr-only"> — not yet available</span></span></span>)}</nav>;
 return <aside className="sn-sidebar" aria-label="Salon workspace"><SalonBrand businessName={businessName}/><div className="sn-desktop-nav">{navigation}</div><details className="sn-mobile-nav" key={pathname}><summary><span>{current?.label||'Your salon'}</span><span>Menu +</span></summary>{navigation}<AccountMenu businessName={businessName} professionalName={professionalName}/></details><div className="sn-desktop-account"><AccountMenu businessName={businessName} professionalName={professionalName}/></div></aside>;
}
