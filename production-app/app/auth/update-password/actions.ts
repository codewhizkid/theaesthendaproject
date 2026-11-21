"use server";

import { createServerClientForRequest } from "@/lib/supabase/server";

export async function updatePassword(_previous: { message: string; complete: boolean }, form: FormData) {
  const password = form.get("password");
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || password !== form.get("confirmation")) {
    return { message: "Use 12–128 characters and make sure both passwords match.", complete: false };
  }
  try {
    const supabase = await createServerClientForRequest();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { message: "Your session has expired. Request a new reset link.", complete: false };
    }
    // Supabase derives the account from the verified session, never form input.
    const result = await supabase.auth.updateUser({ password });
    if (result.error) return { message: "This password could not be saved. Try a different password or request a new reset link.", complete: false };
    await supabase.auth.signOut();
    return { message: "Password saved. Sign in with your new password.", complete: true };
  } catch {
    return { message: "We could not save your password. Please try again.", complete: false };
  }
}
