import Link from 'next/link';
import {createClientAuthForRequest} from '@/lib/client-access/auth';
import {verifiedClientIdentity} from '@/lib/client-access/identity';
import {accountBookingConfigured,guestHash,guestQuery,type GuestStatus} from '@/lib/guest-booking/runtime';
import {AccountCheckout} from '@/components/booking-preview/account-checkout';
import {GuestCheckout} from '@/components/booking-preview/guest-checkout';
export default async function AccountBookingPage(){
 if(!accountBookingConfigured())return <section><h1>Account checkout is being prepared.</h1><p>No appointment or sign-in email has been created.</p><Link href="/booking-preview">Return to booking</Link></section>;
 let booking:GuestStatus;try{booking=await guestQuery<GuestStatus>('guest_booking_v1',[await guestHash(),'status','{}']);}catch{return <section><h1>Choose an available time first.</h1><Link href="/booking-preview">Return to booking</Link></section>;}
 if(booking.entryMode==='guest')return <section><h1>Continue your guest booking.</h1><Link href="/guest">Return to your booking</Link></section>;
 if(booking.state==='booked'||booking.state==='expired'||booking.state==='released')return <GuestCheckout booking={booking}/>;
 const auth=await createClientAuthForRequest();const {data,error}=await auth.auth.getUser();const identity=error?null:verifiedClientIdentity(data.user);
 return <AccountCheckout booking={booking} email={identity?.email||null}/>;
}
