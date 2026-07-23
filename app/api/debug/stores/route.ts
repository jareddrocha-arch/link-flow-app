import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * List installed stores (tokens redacted).
 *
 * Local dev: open /api/debug/stores
 * Production: set DEBUG_SECRET on Vercel, then:
 *   /api/debug/stores?key=YOUR_DEBUG_SECRET
 *
 * Prefer /api/health for a simple no-auth check.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.DEBUG_SECRET?.trim();
    const key = request.nextUrl.searchParams.get("key")?.trim();

    if (!expected) {
      return NextResponse.json(
        {
          ok: false,
          error: "DEBUG_SECRET is not set on this deployment",
          hint: "Add DEBUG_SECRET in Vercel env vars, redeploy, then call /api/debug/stores?key=YOUR_SECRET. Or use GET /api/health (no key).",
        },
        { status: 401 },
      );
    }

    if (key !== expected) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid or missing key",
          hint: "Use /api/debug/stores?key=YOUR_DEBUG_SECRET (must match Vercel DEBUG_SECRET).",
        },
        { status: 401 },
      );
    }
  }

  try {
    const stores = await prisma.store.findMany({
      orderBy: { installedAt: "desc" },
      take: 50,
      select: {
        id: true,
        shop: true,
        scopes: true,
        name: true,
        brandKey: true,
        status: true,
        installedAt: true,
        tokenUpdatedAt: true,
        uninstalledAt: true,
        createdAt: true,
        _count: {
          select: { affiliates: true, sales: true, clicks: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      count: stores.length,
      stores,
    });
  } catch (error) {
    console.error("[debug/stores]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database error",
      },
      { status: 500 },
    );
  }
}
