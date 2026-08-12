import { NextRequest, NextResponse } from "next/server";
import { beginOAuthRedirect } from "@/lib/oauth";
import { getOAuthRedirectUri, sanitizeShopDomain } from "@/lib/shopify";

/**
 * Begin Shopify OAuth.
 * GET /api/auth?shop=example.myshopify.com
 * Optional: &brandKey=fb_… (warm install — signed into OAuth state)
 * Omit brandKey for App Store / cold install → in-app dashboard only (no external connect).
 * Test entry: /test/cold-install
 */
export async function GET(request: NextRequest) {
  const shopParam = request.nextUrl.searchParams.get("shop");
  const brandKeyParam =
    request.nextUrl.searchParams.get("brandKey") ||
    request.nextUrl.searchParams.get("brand_key");
  const cold = request.nextUrl.searchParams.get("cold") === "1";
  const shop = sanitizeShopDomain(shopParam, request.url);

  if (!shop) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "missing_shop");
    if (brandKeyParam) {
      loginUrl.searchParams.set("brandKey", brandKeyParam);
    }
    return NextResponse.redirect(loginUrl);
  }

  try {
    const redirectUri = getOAuthRedirectUri(request.url);
    // Cold install intentionally ignores brandKey even if someone appends one
    const brandKey = cold ? null : brandKeyParam;
    console.info("[oauth/begin]", {
      shop,
      redirectUri,
      hostEnv: process.env.HOST ?? null,
      hasBrandKey: Boolean(brandKey?.trim()),
      cold,
    });

    return beginOAuthRedirect({
      shop,
      requestUrl: request.url,
      brandKey,
    });
  } catch (error) {
    console.error("OAuth begin failed:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_begin_failed");
    return NextResponse.redirect(loginUrl);
  }
}
