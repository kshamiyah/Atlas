import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

export async function handleAuthMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);

  if (isDevAuthBypassEnabled()) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options) {
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options) {
        response.cookies.set({
          name,
          value: "",
          ...options,
        });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isLoginPage = path === "/login" || path.startsWith("/login/");
  const isExtensionDone = path === "/auth/extension-done";
  const isOtherAuthRoute =
    path.startsWith("/auth") && !isExtensionDone;

  const isProtectedRoute = path.startsWith("/dashboard");

  if (!session && isProtectedRoute) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (session && isLoginPage) {
    const source = request.nextUrl.searchParams.get("source");
    if (source === "extension") {
      return NextResponse.redirect(
        new URL("/auth/extension-done", request.url)
      );
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && isOtherAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
