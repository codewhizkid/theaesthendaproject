import {readAppointments} from "@/lib/appointments/persistence";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/supabase/require-user";
import { readBusinessSetup } from "@/lib/business/persistence";

import {readBookingPageTheme} from '@/lib/booking-theme/persistence';

export default async function DashboardPage() {
  const user = await requireUser();
  let business;
  try { business = await readBusinessSetup(user.id); }
  catch { throw new Error("Your business could not be loaded. Please try again shortly."); }
  if (!business) redirect('/business');
  const [schedule, design] = await Promise.all([readAppointments(user.id), readBookingPageTheme(user.id)]);
  return <Dashboard schedule={schedule} name={business.professionalName} businessName={business.businessName} design={design} />;
}
