import { redirect } from "next/navigation";
import { createServerClientForRequest } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export default async function UpdatePasswordPage() {
  const supabase = await createServerClientForRequest();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/auth/recover");
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-3xl font-bold">Choose a new password</h1>
        <p className="text-slate-300">Use at least 12 characters. You will sign in again after saving.</p>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
