import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-xl shadow-slate-950/30">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Production auth
        </p>
        <h1 className="text-3xl font-bold">Professional sign in</h1>
        <p className="mt-3 text-slate-300">
          This app is set up for real Supabase authentication. Add your environment variables before
          wiring the sign-in flow.
        </p>

        <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Required values:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          </ul>
        </div>

        <div className="mt-8 flex gap-3">
          <Link
            href="/"
            className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
          >
            Back home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Dashboard shell
          </Link>
        </div>
      </div>
    </main>
  );
}
