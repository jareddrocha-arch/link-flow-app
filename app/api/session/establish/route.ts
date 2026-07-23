import { NextRequest, NextResponse } from "next/server";
import { setShopSessionCookie } from "@/lib/shop-session";
import { getStoreByShop, normalizeShop } from "@/lib/stores";

/**
 * After OAuth or when opening the app with ?shop=, ensure a valid session cookie.
 *
 * POST { shop } — only succeeds if the shop is ACTIVE in our DB.
 * This does not expose the access token; it only binds the browser session to that shop.
 *
 * Note: anyone who knows a shop domain could establish a session for that shop if
 * the app is installed. For non-embedded installs this is acceptable for
 * "Refresh tracking"; for higher security use App Bridge session tokens later.
 */
export async function POST(request: NextRequest) {
  let shopParam: string | null =
    request.nextUrl.searchParams.get("shop");

  if (!shopParam) {
    try {
      const body = (await request.json()) as { shop?: string };
      shopParam = body.shop ?? null;
    } catch {
      /* ignore */
    }
  }

  const shop = normalizeShop(shopParam || "");
  if (!shop) {
    return NextResponse.json({ error: "shop required" }, { status: 400 });
  }

  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Store not installed or not active" },
      { status: 404 },
    );
  }

  if (!store.accessToken?.trim()) {
    return NextResponse.json(
      {
        error: "Missing access token — reinstall the app",
        code: "missing_access_token",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    shop: store.shop,
    brandKey: store.brandKey,
  });
  setShopSessionCookie(response, store.shop);
  return response;
}
