import {readBookingPreferences} from '@/lib/appointments/preferences';
import {isClientSigninEnabled} from '@/lib/client-access/persistence';
import {openClientSigninTest} from './client-access-actions';
import type {Metadata} from 'next';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {readClientBookingVisibility} from '@/lib/appointments/client-visibility-persistence';
import {readServices} from '@/lib/services/persistence';
import {readAppointments} from '@/lib/appointments/persistence';
import {BookingPreview} from '@/components/booking-preview/booking-preview';
import './booking-preview.css';
export const metadata:Metadata={title:'Booking preview | Aesthenda',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function BookingPreviewPage(){
 const user=await requireUser();
 const business=await readBusinessSetup(user.id);if(!business)redirect('/business');
 const [services,schedule,visibility,clientReady,preferences]=await Promise.all([readServices(user.id),readAppointments(user.id),readClientBookingVisibility(user.id),isClientSigninEnabled(),readBookingPreferences(user.id)]);
 // Explicit projection: private service steps, release flags and revision stay on the server.
 const catalog=services.filter(service=>service.status==='draft').map(({id,name,description,serviceType,durationMinutes,priceCents,currency})=>({id,name,description,category:serviceType||'Services',durationMinutes,priceCents,currency}));
 return <div className="bp-page"><div className="bp-preview-note"><span>Salon preview · Only visible to you · <Link href="/settings">Booking settings</Link></span><div className="ca-preview-actions"><form action={openClientSigninTest}><button type="submit" disabled={!clientReady} title={clientReady?'':'Waiting for the staging client-profile update'}>{clientReady?'Test client sign-in ↗':'Client sign-in · Setup pending'}</button></form><Link href="/dashboard">Back to your workspace ↗</Link></div></div><header className="bp-header"><div><p className="bp-salon">{business.businessName}</p><span className="bp-powered">aesthenda</span></div><span className="bp-header-label">Book your next visit</span></header><main id="booking-content" className="bp-main"><BookingPreview key={`visibility-${visibility.revision}`} salonName={business.businessName} professionalName={business.professionalName} services={catalog} initialDate={schedule.date} timezone={schedule.timezone} confirmationRequired={preferences.requireClientConfirmation}/></main><footer className="bp-footer">{business.businessName}<span>Booking powered by aesthenda</span></footer></div>;
}
