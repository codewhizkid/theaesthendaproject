import { Dashboard } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/supabase/require-user";

export default async function DashboardPage() {
  const user = await requireUser();
  const fullName = user.user_metadata?.full_name;
  return <Dashboard name={typeof fullName === "string" ? fullName : undefined} />;
}
