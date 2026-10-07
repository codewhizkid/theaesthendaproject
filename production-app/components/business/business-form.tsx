"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function BusinessForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Sign in to create your production business account.");

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You must sign in before creating a business account.");
        return;
      }

      setEmail(user.email ?? "professional");
      setMessage(`Signed in as ${user.email}. You can create your business account.`);
    }

    checkSession();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setMessage("A business name is required before the account can be saved.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("Your session is not active. Please sign in again.");
        setLoading(false);
        return;
      }

      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .insert({
          name: name.trim(),
          owner_user_id: user.id,
          status,
        })
        .select("id")
        .single();

      if (businessError) {
        throw businessError;
      }

      const { error: professionalError } = await supabase.from("professionals").insert({
        business_id: business.id,
        user_id: user.id,
        full_name: user.user_metadata?.full_name || email.split("@")[0] || "Professional",
        email: user.email ?? email,
        status: "active",
      });

      if (professionalError) {
        throw professionalError;
      }

      setMessage(`Business account created: ${name.trim()}. Redirecting to dashboard.`);
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
            ? error.message
            : "Business creation failed. Please try again.";
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <div>
        <label htmlFor="business-name" className="mb-2 block text-sm font-medium text-slate-200">
          Business name
        </label>
        <input
          id="business-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400"
          placeholder="Your salon or studio name"
        />
      </div>

      <div>
        <label htmlFor="business-status" className="mb-2 block text-sm font-medium text-slate-200">
          Account status
        </label>
        <select
          id="business-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400"
        >
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300">
        Signed in as: <span className="font-medium text-white">{email || "not signed in"}</span>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating business..." : "Create business account"}
      </button>

      <p className="text-sm text-slate-300">{message}</p>
    </form>
  );
}
