import Link from 'next/link';
import {ClientVisibilityForm} from '@/components/appointments/client-visibility-form';
import {readClientBookingVisibility} from '@/lib/appointments/client-visibility-persistence';
import {requireUser} from '@/lib/supabase/require-user';
import {readBookingPreferences} from '@/lib/appointments/preferences';
import {readBusinessSetup} from '@/lib/business/persistence';
import {BookingSettingsForm} from '@/components/appointments/booking-settings-form';
import {WorkspacePage} from '@/components/layout/workspace-page';
export default async function SettingsPage(){const user=await requireUser();const [preferences,business,visibility]=await Promise.all([readBookingPreferences(user.id),readBusinessSetup(user.id),readClientBookingVisibility(user.id)]);return <WorkspacePage title="Booking & notifications" businessName={business?.businessName} description="Manage client booking choices, appointment confirmation, and messages." action={<Link href="/settings/booking-page" className="aw-secondary">Booking page design</Link>}><div className="space-y-6"><ClientVisibilityForm key={`visibility-${visibility.revision}`} preferences={visibility}/><BookingSettingsForm key={preferences.revision} preferences={preferences}/></div></WorkspacePage>;}
