import {requireUser} from '@/lib/supabase/require-user';
import {GuestTermsForm} from '@/components/booking-preview/guest-checkout';
import '@/app/booking-preview/booking-preview.css';
export default async function GuestSettings(){await requireUser();return <main className="bp-page bp-main bp-content"><h1>Guest booking terms</h1><p>Save the actual terms guests must accept. This checkout supports bookings with no online payment requirement. Saving terms does not activate checkout or email sending.</p><GuestTermsForm/></main>;}
