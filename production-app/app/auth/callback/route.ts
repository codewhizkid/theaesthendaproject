import { NextResponse } from "next/server";

import { hasVerifiedSession } from "@/lib/auth-session";
import { createServerClientForRequest } from "@/lib/supabase/server";

function redirectTo(path: "/business" | "/auth/update-password" | "/auth/confirmation-error") {
  // Relative locations preserve the browser's host and its session cookies.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code && !url.searchParams.has("error")) {
    try {
      const supabase = await createServerClientForRequest();
      let recovery = false;
      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") recovery = true;
      });
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && await hasVerifiedSession(supabase.auth, data.session)) {
          return redirectTo(recovery ? "/auth/update-password" : "/business");
        }
      } finally {
        listener.subscription.unsubscribe();
      }
    } catch {
      // Do not expose provider errors, authorization codes, or tokens.
    }
  }

  return redirectTo("/auth/confirmation-error");
}
