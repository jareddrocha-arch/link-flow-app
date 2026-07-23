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
  const shopParam =
    request.nextUrl.searchParams.get("shop") ||
    ((await request.json().catch(() => ({}))) as { shop?: string }).shop;

  if (!shopParam) {
    return NextResponse.json({ error: "shop required" }, { status: 400 });
  }

  const store = await getStoreByShop(shopParam);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Production: allow if DEBUG_SECRET matches, OR if request carries a valid shop session cookie for this shop
  if (process.env.NODE_ENV === "production") {
    const key = request.nextUrl.searchParams.get("key");
    const secretOk =
      process.env.DEBUG_SECRET && key === process.env.DEBUG_SECRET;

    const { cookies } = await import("next/headers");
    const raw = (await cookies()).get("lf_shop_session")?.value;
    const sessionShop = raw?.split(".")[0];
    const sessionOk =
      sessionShop &&
      sessionShop.toLowerCase() === store.shop.toLowerCase();

    if (!secretOk && !sessionOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await provisionStoreTracking(store);
  return NextResponse.json({
    ok: true,
    shop: store.shop,
    brandKey: store.brandKey,
    ...result,
  });
}
