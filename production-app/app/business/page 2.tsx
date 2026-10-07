import { BusinessForm } from "@/components/business/business-form";

export default function BusinessPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Step 2 — business/account foundation
          </p>
          <h1 className="mt-3 text-3xl font-bold">Business account setup</h1>
          <p className="mt-2 text-slate-300">
            This is the first real production layer after auth: business, professional, and account
            ownership boundaries.
          </p>
        </div>

        <BusinessForm />
      </div>
    </main>
  );
}
