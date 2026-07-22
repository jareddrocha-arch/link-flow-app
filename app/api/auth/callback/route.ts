import { NextRequest, NextResponse } from "next/server";
import { shopify, sessionStorage } from "@/lib/shopify";

/**
 * Complete Shopify OAuth and store the offline session.
 * Redirect URI: {HOST}/api/auth/callback
 */
export async function GET(request: NextRequest) {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: request,
    });

    await sessionStorage.storeSession(callback.session);

    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.searchParams.set("shop", callback.session.shop);
    redirectUrl.searchParams.set("installed", "1");

    const response = NextResponse.redirect(redirectUrl);

    // Forward Set-Cookie headers from the OAuth library (state cleanup / session cookie)
    if (callback.headers) {
      const headers =
        callback.headers instanceof Headers
          ? callback.headers
          : new Headers(callback.headers as HeadersInit);

      headers.forEach((value, key) => {
        if (key.toLowerCase() === "set-cookie") {
          response.headers.append("Set-Cookie", value);
        }
      });
    }

    return response;
  } catch (error) {
    console.error("OAuth callback failed:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_callback_failed");
    return NextResponse.redirect(loginUrl);
  }
}
