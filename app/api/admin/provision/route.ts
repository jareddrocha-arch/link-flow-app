import { NextRequest, NextResponse } from "next/server";
import { getStoreByShop } from "@/lib/stores";
import { provisionStoreTracking } from "@/lib/provision-tracking";

/**
 * Re-run ScriptTag + webhook install for an already-connected shop.
 * Local: free. Production: ?key=DEBUG_SECRET
 *
 * POST /api/admin/provision?shop=lftesting.myshopify.com
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const key = request.nextUrl.searchParams.get("key");
    if (!process.env.DEBUG_SECRET || key !== process.env.DEBUG_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const shop =
    request.nextUrl.searchParams.get("shop") ||
    ((await request.json().catch(() => ({}))) as { shop?: string }).shop;

  if (!shop) {
    return NextResponse.json({ error: "shop required" }, { status: 400 });
  }

  const store = await getStoreByShop(shop);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const result = await provisionStoreTracking(store);
  return NextResponse.json({ ok: true, shop: store.shop, brandKey: store.brandKey, ...result });
}
