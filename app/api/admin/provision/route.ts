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
 * POST /api/admin/provision?shop=…
 * Auth (production): Authorization: Bearer <shop action token>
 *   or lf_shop_session cookie, or DEBUG_SECRET
 *
 * Uses Store.accessToken from DB (refreshed/migrated as needed).
 */
export async function POST(request: NextRequest) {
  // Clone body once — request.json() can only be read once
  let body: { shop?: string; actionToken?: string } = {};
  try {
    body = (await request.json()) as { shop?: string; actionToken?: string };
  } catch {
    /* query-only */
  }

  const shopParam =
    request.nextUrl.searchParams.get("shop") || body.shop || null;
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
          "No Shopify access token stored. Please reinstall the app so OAuth can save an expiring offline token.",
        code: "missing_access_token",
      },
      { status: 401 },
    );
  }

  const authorized = await isAuthorizedForShop(shop, request, {
    actionToken: body.actionToken,
  });
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          "Unauthorized — open the app from Shopify Admin so a valid action token is issued, or reinstall after updating scopes.",
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

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST with shop + Authorization: Bearer <actionToken>",
      method: "POST",
    },
    { status: 405 },
  );
}
