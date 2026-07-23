import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public health check — confirms DB connectivity and table presence.
 * Does not expose access tokens or secrets.
 *
 * GET /api/health
 */
export async function GET() {
  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );

    const storeCount = await prisma.store.count();
    const latest = await prisma.store.findMany({
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
      latestStores: latest,
      tip: "In Supabase Table Editor, open schema public and look for capitalized tables: Store, Affiliate, Sale, Click, Payout.",
    });
  } catch (error) {
    console.error("[health]", error);
    return NextResponse.json(
      {
        ok: false,
        database: "error",
        error: error instanceof Error ? error.message : "Unknown database error",
        tip: "Check DATABASE_URL on Vercel (pooler :6543 with pgbouncer=true). Tables are created by local `npx prisma db push`, not by Vercel redeploy.",
      },
      { status: 500 },
    );
  }
}
