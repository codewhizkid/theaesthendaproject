import {appCookieSecure} from '@/lib/app-origin';
import {previewAccess} from '@/lib/preview-access';
import {clientRememberCookie,clientSessionCookieOptions} from '@/lib/client-access/session';
import {clientAuthCookieName,verifiedClientIdentity} from '@/lib/client-access/identity';
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const access = await previewAccess(request.headers.get('authorization'), process.env);
  if (access !== 'allow') return new NextResponse(access === 'unconfigured' ? 'Testing access is not configured.' : 'Private Aesthenda testing site.', {
    status: access === 'unconfigured' ? 503 : 401,
    headers: {'Cache-Control': 'private, no-store', ...(access === 'deny' ? {'WWW-Authenticate': 'Basic realm="Aesthenda preview", charset="UTF-8"'} : {})},
  });
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  if(path==='/guest'||path.startsWith('/guest/')){response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}
  if(path==='/client'||path.startsWith('/client/')){
    const config=getSupabasePublicConfig();
    const publicPath=path==='/client/sign-in'||path==='/client/auth/callback'||path==='/client/booking';
    if(!publicPath||path==='/client/booking'||path==='/client/sign-in'){
      let verified=false;
      if(config)try{
        const client=createServerClient(config.url,config.key,{cookieOptions:{name:clientAuthCookieName,path:'/client',sameSite:'lax',httpOnly:true,secure:appCookieSecure(process.env)},cookies:{getAll(){return request.cookies.getAll();},setAll(values){values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,clientSessionCookieOptions(options,request.cookies.get(clientRememberCookie)?.value!=='0')));}}});
        const {data,error}=await client.auth.getUser();verified=!error&&!!verifiedClientIdentity(data.user);
      }catch{}
      if(!verified&&!publicPath){const redirect=new NextResponse(null,{status:307,headers:{Location:'/client/sign-in','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});response.cookies.getAll().forEach(cookie=>redirect.cookies.set(cookie));return redirect;}
    }
    response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
  }

  const isPrivate = path === "/booking-preview" || path.startsWith("/booking-preview/") || path === "/settings" || path.startsWith("/settings/") || path === "/dashboard" || path.startsWith("/dashboard/") ||
    path === "/business" || path.startsWith("/business/") || path === "/services" || path.startsWith("/services/") || path === "/calendar" || path.startsWith("/calendar/") || path === "/appointments" || path.startsWith("/appointments/") || path === "/clients" || path.startsWith("/clients/") || path === "/availability" || path.startsWith("/availability/");
  if (!isPrivate && path !== '/login') return response;

  function signInRedirect() {
    const redirect = new NextResponse(null, {status:307, headers:{Location:"/auth/sign-in"}});
    redirect.headers.set("Cache-Control", "no-store");
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const config = getSupabasePublicConfig();
  if (!config) {
    return isPrivate ? signInRedirect() : response;
  }

  const supabase = createServerClient(config.url, config.key, {
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
  matcher: ['/:path*'],
};
