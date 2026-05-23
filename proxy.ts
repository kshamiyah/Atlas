import type { NextRequest } from "next/server";
import { handleAuthMiddleware } from "./lib/supabase/middleware";

export function proxy(request: NextRequest) {
  return handleAuthMiddleware(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/auth/callback",
    "/auth/extension-done",
  ],
};
