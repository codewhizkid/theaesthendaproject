import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {readBookingPageTheme} from '@/lib/booking-theme/persistence';
import {readBookingPreviewCatalog} from '@/lib/appointments/booking-preview-catalog';
import {BookingThemeEditor} from '@/components/booking-preview/booking-theme-editor';
import {WorkspacePage} from '@/components/layout/workspace-page';

export const dynamic = 'force-dynamic';

export default async function BookingPageDesignPage() {
  const user = await requireUser();
  const business = await readBusinessSetup(user.id);
  if (!business) redirect('/business');

  const [design, services] = await Promise.all([
    readBookingPageTheme(user.id),
    readBookingPreviewCatalog(user.id),
  ]);
  if (!design) throw new Error('Booking page design is unavailable for this salon.');

  return (
    <WorkspacePage
      title="Booking page design"
      businessName={business.businessName}
      description="Choose the colors and type your clients will see when they book."
      action={<Link className="aw-secondary" href="/booking-preview">Preview booking page</Link>}
      wide
    >
      <BookingThemeEditor design={design} salonName={business.businessName}
        professionalName={business.professionalName} services={services}/>
    </WorkspacePage>
  );
}
