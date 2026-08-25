import { NextRequest, NextResponse } from "next/server";
import { peekShopifySessionToken } from "@/lib/shopify-credentials";

/**
 * Forward shop + session-token Client ID (`aud`) so the root layout can emit
 * the correct App Bridge `shopify-api-key` for this request.
 *
 * Credential lookup itself stays in Node (layout) so extra
 * SHOPIFY_API_KEY_* env vars are not dropped by Edge bundling.
 */
export function middleware(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  const idToken = request.nextUrl.searchParams.get("id_token");
  const peek = idToken ? peekShopifySessionToken(idToken) : null;
  const shopDomain = shop || peek?.destHost || null;

  if (!shopDomain && !peek?.aud) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  if (shopDomain) {
    requestHeaders.set("x-shopify-shop-domain", shopDomain);
  }
  if (peek?.aud) {
    requestHeaders.set("x-shopify-client-id", peek.aud);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|tracking\\.js).*)"],
};
