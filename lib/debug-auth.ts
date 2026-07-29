import type { NextRequest } from "next/server";

/**
 * Production debug/admin helpers must not be public.
 * Local dev (NODE_ENV !== "production") is open for convenience.
 */
export function isDebugAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const expected = process.env.DEBUG_SECRET?.trim();
  if (!expected) {
    return false;
  }

  const key =
    request.nextUrl.searchParams.get("key")?.trim() ||
    request.headers.get("x-debug-secret")?.trim() ||
    "";

  return key === expected;
}

export function debugUnauthorizedResponse(): {
  body: Record<string, unknown>;
  status: number;
} {
  const hasSecret = Boolean(process.env.DEBUG_SECRET?.trim());
  return {
    status: 401,
    body: {
      ok: false,
      error: hasSecret
        ? "Unauthorized — pass ?key=DEBUG_SECRET (or X-Debug-Secret header)"
        : "Debug endpoints are disabled in production (DEBUG_SECRET is not set)",
    },
  };
}
