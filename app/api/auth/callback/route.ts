import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookies, completeOAuth } from "@/lib/oauth";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import { setShopSessionCookie } from "@/lib/shop-session";
import { upsertStoreFromOAuth } from "@/lib/stores";

/**
 * Complete Shopify OAuth, persist Store, inject tracking ScriptTag + webhooks.
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

    const store = await upsertStoreFromOAuth({
      shop: session.shop,
      accessToken: session.accessToken!,
      scopes: session.scope ?? process.env.SCOPES ?? "",
    });

    // Automatic tracking injection (ScriptTag + order webhooks)
    let provision: Awaited<ReturnType<typeof provisionStoreTracking>> | null =
      null;
    try {
      provision = await provisionStoreTracking(store);
      console.info("[oauth/callback] tracking provisioned", {
        shop: store.shop,
        scriptTagId: provision.scriptTagId,
        webhooks: provision.webhooks,
        errors: provision.errors,
      });
    } catch (e) {
      console.error("[oauth/callback] provision failed (install still ok)", e);
    }

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
    if (provision?.scriptTagId) {
      redirectUrl.searchParams.set("scriptTag", "1");
    }
    if (provision?.webhooks?.length) {
      redirectUrl.searchParams.set("webhooks", provision.webhooks.join(","));
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
      error instanceof Error &&
        /DATABASE_URL|Prisma|connect/i.test(error.message)
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
