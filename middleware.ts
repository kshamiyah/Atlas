import type { NextRequest } from "next/server";
import { handleAuthMiddleware } from "./lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return handleAuthMiddleware(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/callback",
    "/auth/extension-done",
  ],
};

