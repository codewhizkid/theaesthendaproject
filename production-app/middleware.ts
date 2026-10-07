import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPrivate = path === "/dashboard" || path.startsWith("/dashboard/") ||
    path === "/business" || path.startsWith("/business/");

  function signInRedirect() {
    const destination = new URL("/auth/sign-in", request.url);
    destination.host = request.headers.get("host") ?? destination.host;
    const redirect = NextResponse.redirect(destination);
    redirect.headers.set("Cache-Control", "no-store");
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return isPrivate ? signInRedirect() : response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getUser();
    if (isPrivate && (error || !data.user)) return signInRedirect();
  } catch {
    if (isPrivate) return signInRedirect();
  }
  if (isPrivate) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/business/:path*", "/login"],
};
