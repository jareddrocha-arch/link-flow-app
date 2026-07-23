import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookies, completeOAuth } from "@/lib/oauth";
import { setShopSessionCookie } from "@/lib/shop-session";
import { upsertStoreFromOAuth } from "@/lib/stores";

/**
 * Complete Shopify OAuth, persist Store in Postgres (Supabase via Prisma),
 * and set a signed shop session cookie.
 *
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

    const { session } = result;

    // Persist offline token + shop metadata in Supabase
    const store = await upsertStoreFromOAuth({
      shop: session.shop,
      accessToken: session.accessToken!,
      scopes: session.scope ?? process.env.SCOPES ?? "",
    });

    console.info("[oauth/callback] store upserted", {
      storeId: store.id,
      shop: store.shop,
      brandKey: store.brandKey,
      status: store.status,
    });

    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.searchParams.set("shop", store.shop);
    redirectUrl.searchParams.set("installed", "1");
    if (store.brandKey) {
      redirectUrl.searchParams.set("brandKey", store.brandKey);
    }

    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    setShopSessionCookie(response, store.shop);
    return response;
  } catch (error) {
    console.error("OAuth callback unexpected error:", error);
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("error", "oauth_callback_failed");
    loginUrl.searchParams.set(
      "reason",
      error instanceof Error && /DATABASE_URL|Prisma|connect/i.test(error.message)
        ? "database_error"
        : "unexpected",
    );
    loginUrl.searchParams.set(
      "detail",
      error instanceof Error ? error.message.slice(0, 120) : "unknown",
    );
    return NextResponse.redirect(loginUrl);
  }
}
