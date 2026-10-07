"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Use your production account to continue.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();

      const request =
        mode === "sign_up"
          ? supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/dashboard`,
              },
            })
          : supabase.auth.signInWithPassword({ email, password });

      const { data, error } = await request;

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        setMessage(
          mode === "sign_up"
            ? "Account created. Continue to set up your business account."
            : "Signed in successfully. Redirecting to the business setup flow.",
        );
        router.push("/business");
      }
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "Authentication is not configured yet.";
      setMessage(fallback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => setMode("sign_in")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === "sign_in" ? "bg-cyan-500 text-slate-950" : "text-slate-300"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign_up")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === "sign_up" ? "bg-cyan-500 text-slate-950" : "text-slate-300"
          }`}
        >
          Sign up
        </button>
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-cyan-400"
          placeholder="professional@business.com"
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-0 transition focus:border-cyan-400"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? mode === "sign_up"
            ? "Creating account..."
            : "Signing in..."
          : mode === "sign_up"
            ? "Create account"
            : "Continue to dashboard"}
      </button>

      <p className="text-sm text-slate-300">{message}</p>
    </form>
  );
}
