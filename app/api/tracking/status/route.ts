import { NextRequest, NextResponse } from "next/server";
import { isValidBrandKey } from "@/lib/brand-key";
import { corsHeadersForTracking } from "@/lib/cors-tracking";
import { getStoreByBrandKey } from "@/lib/stores";

/**
 * Public status check for Link Flow website (product-listing gate).
 * GET /api/tracking/status?brandKey=fb_…
 *
 * Does not expose access tokens. CORS open for cross-origin server/browser checks.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersForTracking(),
  });
}

export async function GET(request: NextRequest) {
  const brandKey = request.nextUrl.searchParams.get("brandKey")?.trim() || "";

  if (!brandKey || !isValidBrandKey(brandKey)) {
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: "Valid brandKey required",
      },
      { status: 400, headers: corsHeadersForTracking() },
    );
  }

  try {
    const store = await getStoreByBrandKey(brandKey);
    if (!store || store.status !== "ACTIVE" || !store.accessToken?.trim()) {
      return NextResponse.json(
        {
          ok: true,
          connected: false,
          brandKey,
          reason: "no_active_store",
        },
        { headers: corsHeadersForTracking() },
      );
    }

    const hasScript = Boolean(store.scriptTagId || store.trackingInstalledAt);
    const hasPixel = Boolean(store.webPixelId || store.webPixelInstalledAt);
    // Connected = active install with brand key linked; pixel or script means tracking ready
    const connected = hasScript || hasPixel;

    return NextResponse.json(
      {
        ok: true,
        connected,
        brandKey,
        shop: store.shop,
        hasScript,
        hasPixel,
        status: store.status,
        reason: connected ? "ready" : "installed_but_tracking_pending",
      },
      { headers: corsHeadersForTracking() },
    );
  } catch (e) {
    console.error("[tracking/status]", e);
    return NextResponse.json(
      {
        ok: false,
        connected: false,
        error: "status_check_failed",
      },
      { status: 500, headers: corsHeadersForTracking() },
    );
  }
}
