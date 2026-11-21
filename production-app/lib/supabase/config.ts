/** Shared public configuration for the browser, request server, and middleware. */
export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !key) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid project URL.");
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTP(S) project URL without credentials.");
  }
  if (key.startsWith('sb_secret_')) {
    throw new Error("Use a Supabase publishable or anon key. Secret keys must never be used in public configuration.");
  }
  // A legacy JWT can also contain elevated credentials. Inspect only its public
  // role claim; this does not verify the key or replace server authentication.
  if (key.split('.').length === 3) {
    try {
      const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(payload));
      if (claims.role === 'service_role') {
        throw new Error('ELEVATED_KEY');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'ELEVATED_KEY') {
        throw new Error("Use a Supabase publishable or anon key. Service-role keys must never be used in public configuration.");
      }
      // Supabase validates malformed or expired keys; do not expose their value.
    }
  }
  return { url, key };
}

export function requireSupabasePublicConfig() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return config;
}
