import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

function secrets(): string[] {
  return [process.env.CRON_SECRET, process.env.RECONCILE_SECRET]
    .map((s) => s?.trim() || "")
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function isCronAuthorized(request: NextRequest): boolean {
  const expected = secrets();
  if (expected.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-cron-secret")?.trim() ||
    "";
  const query = request.nextUrl.searchParams.get("secret")?.trim() || "";
  const provided = header || query;
  if (!provided) return false;
  return expected.some((s) => safeEqual(provided, s));
}
