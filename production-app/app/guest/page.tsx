import Link from 'next/link';
import {guestOperation,type GuestStatus} from '@/lib/guest-booking/runtime';
import {GuestCheckout} from '@/components/booking-preview/guest-checkout';
export default async function GuestPage(){let booking:GuestStatus|null=null;try{booking=await guestOperation<GuestStatus>('status');}catch{}return booking?<GuestCheckout booking={booking}/>:<section className="bp-content"><h1>Start with an available time.</h1><p>Your guest booking session is unavailable, or checkout is still being prepared.</p><Link href="/booking-preview">Return to the booking preview</Link></section>;}
