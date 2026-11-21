"use client";

import { useActionState, useEffect } from "react";
import { signOut } from "@/app/auth/actions";

export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, { complete: false, message: "" });
  useEffect(() => {
    // A fresh document also drops the previous account's in-memory client state.
    if (state.complete) window.location.replace("/auth/sign-in");
  }, [state.complete]);

  return <form action={action}>
    <button type="submit" disabled={pending || state.complete}
      className="ae-button ae-sign-out rounded-xl border border-current px-4 py-2 text-sm disabled:opacity-60">
      {pending || state.complete ? "Signing out…" : "Sign out"}
    </button>
    {state.message && <p role="alert">{state.message}</p>}
  </form>;
}
