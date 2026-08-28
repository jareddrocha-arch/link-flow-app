import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runOrderReconciliation } from "@/lib/reconcile-orders";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function handleReconcileCron(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return unauthorized();
  }

  const started = Date.now();
  try {
    const summary = await runOrderReconciliation();
    console.info("[reconcile] job complete", {
      ...summary,
      results: summary.results,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - started,
      ...summary,
    });
  } catch (error) {
    console.error("[reconcile] job failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "reconcile_failed",
      },
      { status: 500 },
    );
  }
}
