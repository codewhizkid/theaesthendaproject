"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function EmailLinkForm({ recovery }: { recovery: boolean }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const callback = `${window.location.origin}/auth/callback`;
      const { error } = recovery
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback })
        : await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callback } });
      setMessage(error
        ? "We could not send the email. Wait a few minutes and try again."
        : "If your account is eligible, an email will arrive shortly. Open the latest link in this browser. Check spam too.");
    } catch {
      setMessage("We could not send the email. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-3xl font-bold">{recovery ? "Reset your password" : "Confirm your email"}</h1>
        <p className="text-slate-300">Enter the email address you used for Aesthenda.</p>
        <form onSubmit={submit} className="space-y-5">
          <label className="block" htmlFor="email">Email</label>
          <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60" disabled={loading}>
            {loading ? "Sending…" : recovery ? "Send reset link" : "Send confirmation link"}
          </button>
          <p role="status" className="text-sm text-slate-300">{message}</p>
        </form>
        <Link className="inline-block text-cyan-400" href="/auth/sign-in">Return to sign in</Link>
      </div>
    </main>
  );
}
