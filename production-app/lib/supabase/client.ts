import { requireSupabasePublicConfig } from "./config";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const { url: supabaseUrl, key: supabaseAnonKey } = requireSupabasePublicConfig();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
