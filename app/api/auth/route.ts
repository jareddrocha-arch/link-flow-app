import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthRedirectUri,
  getShopify,
  OAUTH_CALLBACK_PATH,
  sanitizeShopDomain,
} from "@/lib/shopify";

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
    const shopify = getShopify(request.url);
    const redirectUri = getOAuthRedirectUri(request.url);

    // Helpful for debugging whitelist mismatches (visible in Vercel function logs)
    console.info("[oauth/begin]", {
      shop,
      redirectUri,
      hostEnv: process.env.HOST ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
    });

    return await shopify.auth.begin({
      shop,
      callbackPath: OAUTH_CALLBACK_PATH,
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
