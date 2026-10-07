import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";

const modules = [
  "Business account",
  "Professional profile",
  "Clients",
  "Services",
  "Availability",
  "Calendar",
  "Appointments",
  "Audit log",
];

export default async function DashboardPage() {
  await requireUser();
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Production dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold">Aesthenda operating shell</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/auth/sign-in"
              className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              Auth screen
            </Link>
            <Link
              href="/business"
              className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              Business setup
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => (
            <article
              key={module}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20"
            >
              <p className="text-sm text-slate-400">Module</p>
              <h2 className="mt-3 text-lg font-semibold text-white">{module}</h2>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Product direction
          </p>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            This shell is the real production app foundation. The app will hold the actual business
            account, professional, client, service, availability, and appointment layers once the
            Supabase environment is configured and the production data model is connected.
          </p>
        </section>
      </div>
    </main>
  );
}
