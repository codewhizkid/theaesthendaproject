import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {readBookingPageTheme} from '@/lib/booking-theme/persistence';
import {BookingThemeEditor} from '@/components/booking-preview/booking-theme-editor';
import {WorkspacePage} from '@/components/layout/workspace-page';
import '@/app/booking-preview/booking-preview.css';
export const dynamic='force-dynamic';
export default async function BookingPageDesignPage(){
 const user=await requireUser();
 const [business,theme]=await Promise.all([readBusinessSetup(user.id),readBookingPageTheme(user.id)]);
 if(!business)redirect('/business');
 return <WorkspacePage title="Booking page design" businessName={business.businessName} description="Give your booking page a look that feels like your studio." action={<Link className="aw-secondary" href="/booking-preview">Open full preview</Link>} wide><div className="space-y-6"><p className="bte-note">Your clients will see this design when online booking is published. For now, try it in your private preview.</p><BookingThemeEditor key={theme.revision} theme={theme.theme} revision={theme.revision} businessName={business.businessName}/></div></WorkspacePage>;
}
