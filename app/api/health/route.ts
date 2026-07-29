import { NextRequest, NextResponse } from "next/server";
import {
  debugUnauthorizedResponse,
  isDebugAuthorized,
} from "@/lib/debug-auth";
import { prisma } from "@/lib/prisma";

/**
 * Health check.
 *
 * Public (no secrets): connectivity only — ok + database status.
 * Detailed store inventory: production requires DEBUG_SECRET
 *   GET /api/health?key=YOUR_DEBUG_SECRET&details=1
 */
export async function GET(request: NextRequest) {
  const wantDetails =
    request.nextUrl.searchParams.get("details") === "1" ||
    request.nextUrl.searchParams.get("details") === "true";

  try {
    // Lightweight connectivity probe (no merchant data)
    await prisma.$queryRaw`SELECT 1`;

    if (!wantDetails) {
      return NextResponse.json({
        ok: true,
        database: "connected",
      });
    }

    // Detailed diagnostics are not public in production
    if (!isDebugAuthorized(request)) {
      const { body, status } = debugUnauthorizedResponse();
      return NextResponse.json(body, { status });
    }

    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );

    const storeCount = await prisma.store.count();
    const latestRaw = await prisma.store.findMany({
      take: 5,
      orderBy: { installedAt: "desc" },
      select: {
        shop: true,
        status: true,
        brandKey: true,
        installedAt: true,
        scopes: true,
      },
    });

    return NextResponse.json({
      ok: true,
      database: "connected",
      schema: "public",
      tables: tables.map((t) => t.tablename),
      storeCount,
      // Never return raw brand keys — only whether one is set
      latestStores: latestRaw.map((s) => ({
        shop: s.shop,
        status: s.status,
        hasBrandKey: Boolean(s.brandKey?.trim()),
        installedAt: s.installedAt,
        scopes: s.scopes,
      })),
    });
  } catch (error) {
    console.error("[health]", error);
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        error:
          process.env.NODE_ENV === "production"
            ? "Database unavailable"
            : error instanceof Error
              ? error.message
              : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
