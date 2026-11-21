"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword } from "@/app/auth/update-password/actions";

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, { message: "", complete: false });
  return (
    <form action={action} className="space-y-5">
      {!state.complete && <>
        <label className="block" htmlFor="password">New password</label>
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        <label className="block" htmlFor="confirmation">Confirm new password</label>
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        <button className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60" disabled={pending}>{pending ? "Saving…" : "Save new password"}</button>
      </>}
      <p role="status" className="text-sm text-slate-300">{state.message}</p>
      <div className="flex gap-4 text-cyan-400">
        <Link href="/auth/sign-in">Sign in</Link>
        {!state.complete && <Link href="/auth/recover">Request a new reset link</Link>}
      </div>
    </form>
  );
}
