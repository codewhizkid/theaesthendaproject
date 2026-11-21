"use server";

import { createServerClientForRequest } from "@/lib/supabase/server";

export async function signOut() {
  try {
    const supabase = await createServerClientForRequest();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) return { complete: true, message: "" };
  } catch {
    // Keep provider details and session credentials out of the UI.
  }
  return { complete: false, message: "Could not sign out. Please try again." };
}
