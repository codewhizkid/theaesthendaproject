import { requireSupabasePublicConfig } from "./config";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerClientForRequest() {
  const { url: supabaseUrl, key: supabaseAnonKey } = requireSupabasePublicConfig();

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The server component may not have access to set cookies in this context.
        }
      },
    },
  });
}
