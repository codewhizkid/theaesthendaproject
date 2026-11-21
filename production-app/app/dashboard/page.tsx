import {readAppointments} from "@/lib/appointments/persistence";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/supabase/require-user";
import { readBusinessSetup } from "@/lib/business/persistence";

export default async function DashboardPage() {
  const user = await requireUser();
  let business;
  try { business = await readBusinessSetup(user.id); }
  catch { throw new Error("Your business could not be loaded. Please try again shortly."); }
  if (!business) redirect('/business');
  const schedule=await readAppointments(user.id);
  return <Dashboard schedule={schedule} name={business.professionalName} businessName={business.businessName} />;
}
