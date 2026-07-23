import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import {
  getStoreByShop,
  normalizeShop,
  updateStoreBrandKey,
} from "@/lib/stores";

/**
 * Update store settings (brandKey) and optionally re-provision tracking.
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

  // Auth: session cookie for this shop, or DEBUG_SECRET in production
  const authorized = await isAuthorizedForShop(shop, request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Store not found or not active" },
      { status: 404 },
    );
  }

  try {
    let updated = store;
    if (body.brandKey != null && body.brandKey.trim() !== store.brandKey) {
      updated = await updateStoreBrandKey(shop, body.brandKey);
    }

    let provision = null;
    if (body.reprovision !== false) {
      // Always re-provision after brand key change so pixel/script use the new key
      provision = await provisionStoreTracking(updated);
    }

    return NextResponse.json({
      ok: true,
      shop: updated.shop,
      brandKey: updated.brandKey,
      provision,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}

async function isAuthorizedForShop(
  shop: string,
  request: NextRequest,
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;

  const key = request.nextUrl.searchParams.get("key");
  if (process.env.DEBUG_SECRET && key === process.env.DEBUG_SECRET) {
    return true;
  }

  try {
    const raw = (await cookies()).get("lf_shop_session")?.value;
    const sessionShop = raw?.split(".")[0]?.toLowerCase();
    return sessionShop === shop.toLowerCase();
  } catch {
    return false;
  }
}
