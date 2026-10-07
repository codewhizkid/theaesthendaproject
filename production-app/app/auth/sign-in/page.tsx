import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Production access</p>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-sm text-slate-300">
            Sign in to your live Aesthenda account or create a new one for the production backend.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
