import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedForShop,
  setShopSessionCookie,
} from "@/lib/shop-session";
import { getStoreByShop, normalizeShop } from "@/lib/stores";
import { provisionStoreTracking } from "@/lib/provision-tracking";

/**
 * Re-run ScriptTag + Web Pixel + webhook install for a connected shop.
 *
 * POST /api/admin/provision?shop=lftesting.myshopify.com
 * Auth: signed lf_shop_session cookie (set at OAuth) or DEBUG_SECRET
 *
 * Uses the Store.accessToken from the database (not the session cookie).
 */
export async function POST(request: NextRequest) {
  let shopParam = request.nextUrl.searchParams.get("shop");

  if (!shopParam) {
    try {
      const body = (await request.json()) as { shop?: string };
      shopParam = body.shop ?? null;
    } catch {
      /* no body */
    }
  }

  const shop = normalizeShop(shopParam || "");
  if (!shop) {
    return NextResponse.json({ error: "shop required" }, { status: 400 });
  }

  const store = await getStoreByShop(shop);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  if (store.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Store is not active — reinstall the app" },
      { status: 403 },
    );
  }

  if (!store.accessToken?.trim()) {
    return NextResponse.json(
      {
        error:
          "No Shopify access token stored for this shop. Please reinstall the app from /auth/login.",
        code: "missing_access_token",
      },
      { status: 401 },
    );
  }

  const authorized = await isAuthorizedForShop(shop, request);
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          "Unauthorized — open the app after install (session cookie missing) or reinstall. If this persists, set DEBUG_SECRET and pass ?key=…",
        code: "session_unauthorized",
      },
      { status: 401 },
    );
  }

  try {
    const result = await provisionStoreTracking(store);

    const response = NextResponse.json({
      ok: true,
      shop: store.shop,
      brandKey: store.brandKey,
      hasAccessToken: true,
      ...result,
    });

    // Refresh/fix session cookie (new format) so subsequent calls succeed
    setShopSessionCookie(response, store.shop);
    return response;
  } catch (e) {
    console.error("[provision]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Provision failed",
        code: "provision_failed",
      },
      { status: 500 },
    );
  }
}

/** Helpful if someone hits the URL in a browser */
export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST /api/admin/provision?shop=your-store.myshopify.com",
      method: "POST",
    },
    { status: 405 },
  );
}
