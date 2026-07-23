import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Dev/debug: list installed stores (tokens redacted).
 * Disable in production or protect with a secret.
 *
 * GET /api/debug/stores?key=DEBUG_SECRET
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const key = request.nextUrl.searchParams.get("key");
    if (!process.env.DEBUG_SECRET || key !== process.env.DEBUG_SECRET) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
        // accessToken intentionally omitted
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
