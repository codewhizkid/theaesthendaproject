import type {Metadata} from 'next';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {readBookingPreferences} from '@/lib/appointments/preferences';
import {readBookingPreviewCatalog} from '@/lib/appointments/booking-preview-catalog';
import {readClientBookingVisibility} from '@/lib/appointments/client-visibility-persistence';
import {readAppointments} from '@/lib/appointments/persistence';
import {readBookingPageTheme} from '@/lib/booking-theme/persistence';
import {bookingThemeCssVariables} from '@/lib/booking-theme/input';
import {readBusinessSetup} from '@/lib/business/persistence';
import {isClientSigninEnabled} from '@/lib/client-access/persistence';
import {requireUser} from '@/lib/supabase/require-user';
import {BookingPreview} from '@/components/booking-preview/booking-preview';
import {WorkspacePage} from '@/components/layout/workspace-page';
import {BookingPageHeader} from '@/components/booking-preview/booking-page-header';
import {openClientSigninTest} from './client-access-actions';
import './booking-preview.css';
import '@/components/booking-preview/booking-theme.css';

export const metadata: Metadata = {title: 'Booking preview | Aesthenda', robots: {index: false, follow: false}};
export const dynamic = 'force-dynamic';

export default async function BookingPreviewPage() {
  const user = await requireUser();
  const business = await readBusinessSetup(user.id);
  if (!business) redirect('/business');

  const [catalog, schedule, visibility, clientReady, preferences, design] = await Promise.all([
    readBookingPreviewCatalog(user.id),
    readAppointments(user.id),
    readClientBookingVisibility(user.id),
    isClientSigninEnabled(),
    readBookingPreferences(user.id),
    readBookingPageTheme(user.id),
  ]);
  const theme = design && design.revision > 0 ? design.theme : null;

  return (
    <WorkspacePage
      title="Booking page preview"
      businessName={business.businessName}
      description="Only you can see this preview. Use it to try the booking flow your clients will see."
      action={<Link className="aw-primary" href="/settings/booking-page">Edit design</Link>}
      wide
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link className="aw-secondary" href="/settings">Booking &amp; notifications</Link>
        <form action={openClientSigninTest}>
          <button className="aw-secondary" type="submit" disabled={!clientReady}>
            {clientReady ? 'Test client sign-in' : 'Client sign-in setup pending'}
          </button>
        </form>
      </div>
      <div className={theme ? 'bp-page bp-themed' : 'bp-page'}
        style={theme ? bookingThemeCssVariables(theme) : undefined}>
        <BookingPageHeader salonName={business.businessName}/>
        <div id="booking-content" className="bp-main">
          <BookingPreview key={`visibility-${visibility.revision}`} salonName={business.businessName}
            professionalName={business.professionalName} services={catalog} initialDate={schedule.date}
            timezone={schedule.timezone} confirmationRequired={preferences.requireClientConfirmation}/>
        </div>
        <footer className="bp-footer">{business.businessName}<span>Booking powered by aesthenda</span></footer>
      </div>
    </WorkspacePage>
  );
}
