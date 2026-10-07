import Link from "next/link";

export default function ConfirmationErrorPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-3xl font-bold">We could not confirm your session</h1>
        <p className="text-slate-300">
          The link may have expired or already been used. Open your latest confirmation
          email in the same browser where you signed up. If your email is already
          confirmed, sign in to continue.
        </p>
        <Link href="/auth/sign-in" className="inline-block rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
