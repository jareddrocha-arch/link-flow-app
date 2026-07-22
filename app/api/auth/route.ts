import { NextRequest, NextResponse } from "next/server";
import { shopify, sanitizeShopDomain } from "@/lib/shopify";

/**
 * Begin Shopify OAuth.
 * GET /api/auth?shop=example.myshopify.com
 */
export async function GET(request: NextRequest) {
  const shopParam = request.nextUrl.searchParams.get("shop");
  const shop = sanitizeShopDomain(shopParam);

  if (!shop) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "missing_shop");
    return NextResponse.redirect(loginUrl);
  }

  try {
    return await shopify.auth.begin({
      shop,
      callbackPath: "/api/auth/callback",
      isOnline: false,
      rawRequest: request,
    });
  } catch (error) {
    console.error("OAuth begin failed:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_begin_failed");
    return NextResponse.redirect(loginUrl);
  }
}
