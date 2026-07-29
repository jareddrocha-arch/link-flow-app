import { NextRequest, NextResponse } from "next/server";
import {
  debugUnauthorizedResponse,
  isDebugAuthorized,
} from "@/lib/debug-auth";
import { prisma } from "@/lib/prisma";

/**
 * List installed stores (tokens and brand keys redacted).
 *
 * Local dev: open /api/debug/stores
 * Production: /api/debug/stores?key=YOUR_DEBUG_SECRET
 */
export async function GET(request: NextRequest) {
  if (!isDebugAuthorized(request)) {
    const { body, status } = debugUnauthorizedResponse();
    return NextResponse.json(body, { status });
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
      stores: stores.map((s) => ({
        id: s.id,
        shop: s.shop,
        scopes: s.scopes,
        name: s.name,
        // Never expose raw brand keys over debug HTTP
        hasBrandKey: Boolean(s.brandKey?.trim()),
        status: s.status,
        installedAt: s.installedAt,
        tokenUpdatedAt: s.tokenUpdatedAt,
        uninstalledAt: s.uninstalledAt,
        createdAt: s.createdAt,
        _count: s._count,
      })),
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
