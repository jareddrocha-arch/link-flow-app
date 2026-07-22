import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookies, completeOAuth } from "@/lib/oauth";
import { sessionStorage } from "@/lib/shopify";

/**
 * Complete Shopify OAuth and store the offline session.
 * Redirect URI: {HOST}/api/auth/callback
 */
export async function GET(request: NextRequest) {
  try {
    const result = await completeOAuth({ requestUrl: request.url });

    if (!result.ok) {
      console.error("OAuth callback failed:", result.code, result.message);
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("error", "oauth_callback_failed");
      loginUrl.searchParams.set("reason", result.code);
      loginUrl.searchParams.set("detail", result.message.slice(0, 120));
      return NextResponse.redirect(loginUrl);
    }

    await sessionStorage.storeSession(result.session);

    console.info("[oauth/callback] success", {
      shop: result.session.shop,
      scope: result.session.scope,
    });

    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.searchParams.set("shop", result.session.shop);
    redirectUrl.searchParams.set("installed", "1");

    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("OAuth callback unexpected error:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_callback_failed");
    loginUrl.searchParams.set("reason", "unexpected");
    return NextResponse.redirect(loginUrl);
  }
}
