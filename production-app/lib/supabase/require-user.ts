import { redirect } from "next/navigation";

import { createServerClientForRequest } from "./server";

export async function requireUser() {
  const supabase = await createServerClientForRequest();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) redirect("/auth/sign-in");

  return data.user;
}
