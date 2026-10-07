import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-50">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-xl shadow-slate-950/20">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Step 1 — auth
          </p>
          <h1 className="mt-3 text-3xl font-bold">Professional sign in</h1>
          <p className="mt-2 text-slate-300">
            Use the real production auth flow once the Supabase environment is configured.
          </p>
        </div>

        <SignInForm />
      </div>
    </main>
  );
}
