import { NextRequest, NextResponse } from "next/server";
import { beginOAuthRedirect } from "@/lib/oauth";
import { getOAuthRedirectUri, sanitizeShopDomain } from "@/lib/shopify";

/**
 * Begin Shopify OAuth.
 * GET /api/auth?shop=example.myshopify.com
 */
export async function GET(request: NextRequest) {
  const shopParam = request.nextUrl.searchParams.get("shop");
  const shop = sanitizeShopDomain(shopParam, request.url);

  if (!shop) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "missing_shop");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const redirectUri = getOAuthRedirectUri(request.url);
    console.info("[oauth/begin]", {
      shop,
      redirectUri,
      hostEnv: process.env.HOST ?? null,
    });

    return beginOAuthRedirect({
      shop,
      requestUrl: request.url,
    });
  } catch (error) {
    console.error("OAuth begin failed:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_begin_failed");
    return NextResponse.redirect(loginUrl);
  }
}
