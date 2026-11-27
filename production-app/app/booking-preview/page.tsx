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
    <div className={theme ? 'bp-page bp-themed' : 'bp-page'}
      style={theme ? bookingThemeCssVariables(theme) : undefined}>
      <div className="bp-preview-note">
        <span>Salon preview · Only visible to you · <Link href="/settings/booking-page">Edit design</Link> ·{' '}
          <Link href="/settings">Booking settings</Link></span>
        <div className="ca-preview-actions">
          <form action={openClientSigninTest}>
            <button type="submit" disabled={!clientReady} title={clientReady ? '' : 'Waiting for the staging client-profile update'}>
              {clientReady ? 'Test client sign-in ↗' : 'Client sign-in · Setup pending'}
            </button>
          </form>
          <Link href="/dashboard">Back to your workspace ↗</Link>
        </div>
      </div>
      <BookingPageHeader salonName={business.businessName}/>
      <main id="booking-content" className="bp-main">
        <BookingPreview key={`visibility-${visibility.revision}`} salonName={business.businessName}
          professionalName={business.professionalName} services={catalog} initialDate={schedule.date}
          timezone={schedule.timezone} confirmationRequired={preferences.requireClientConfirmation}/>
      </main>
      <footer className="bp-footer">{business.businessName}<span>Booking powered by aesthenda</span></footer>
    </div>
  );
}
