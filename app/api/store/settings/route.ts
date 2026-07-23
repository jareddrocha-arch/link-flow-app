import { NextRequest, NextResponse } from "next/server";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import {
  isAuthorizedForShop,
  setShopSessionCookie,
} from "@/lib/shop-session";
import {
  getStoreByShop,
  normalizeShop,
  updateStoreBrandKey,
} from "@/lib/stores";

/**
 * Update store settings (brandKey) and re-provision tracking.
 * POST { shop, brandKey, reprovision?: true, actionToken?: string }
 */
export async function POST(request: NextRequest) {
  let body: {
    shop?: string;
    brandKey?: string;
    reprovision?: boolean;
    actionToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shop = normalizeShop(body.shop || "");
  if (!shop) {
    return NextResponse.json({ error: "shop is required" }, { status: 400 });
  }

  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Store not found or not active" },
      { status: 404 },
    );
  }

  const authorized = await isAuthorizedForShop(shop, request, {
    actionToken: body.actionToken,
  });
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          "Unauthorized — open the app from Shopify Admin (action token required in embedded mode).",
      },
      { status: 401 },
    );
  }

  if (!store.accessToken?.trim()) {
    return NextResponse.json(
      {
        error: "No Shopify access token — please reinstall the app",
        code: "missing_access_token",
      },
      { status: 401 },
    );
  }

  try {
    let updated = store;
    if (
      body.brandKey != null &&
      body.brandKey.trim() !== (store.brandKey ?? "")
    ) {
      updated = await updateStoreBrandKey(shop, body.brandKey);
    }

    let provision = null;
    if (body.reprovision !== false) {
      provision = await provisionStoreTracking(updated);
    }

    const response = NextResponse.json({
      ok: true,
      shop: updated.shop,
      brandKey: updated.brandKey,
      provision,
    });
    setShopSessionCookie(response, updated.shop);
    return response;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}
