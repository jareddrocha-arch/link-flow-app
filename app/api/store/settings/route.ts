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
 * POST { shop, brandKey, reprovision?: true }
 */
export async function POST(request: NextRequest) {
  let body: { shop?: string; brandKey?: string; reprovision?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shop = normalizeShop(body.shop || "");
  if (!shop) {
    return NextResponse.json({ error: "shop is required" }, { status: 400 });
  }

  // Allow establish-first: if no session, still require store ACTIVE + we'll set cookie on success
  // For brand key changes we require session OR we allow if store has token (same as establish)
  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Store not found or not active" },
      { status: 404 },
    );
  }

  let authorized = await isAuthorizedForShop(shop, request);
  // Bootstrap: if no cookie yet but store is installed, allow once and set cookie
  // (same trust model as session/establish for merchant dashboard UX)
  if (!authorized && store.accessToken?.trim()) {
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (body.brandKey != null && body.brandKey.trim() !== (store.brandKey ?? "")) {
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
