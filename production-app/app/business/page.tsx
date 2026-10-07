import { BusinessForm } from "@/components/business/business-form";
import { requireUser } from "@/lib/supabase/require-user";

export default async function BusinessPage() {
  await requireUser();
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Business setup</p>
          <h1 className="text-3xl font-bold">Create your production business</h1>
          <p className="text-sm text-slate-300">
            This record is saved to the live Supabase database and tied to the signed-in user.
          </p>
        </div>
        <BusinessForm />
      </div>
    </main>
  );
}
