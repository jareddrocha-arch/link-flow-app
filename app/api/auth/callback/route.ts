import { NextRequest, NextResponse } from "next/server";
import { clearOAuthCookies, completeOAuth } from "@/lib/oauth";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import { buildEmbeddedAdminAppUrl } from "@/lib/session-token";
import { setShopSessionCookie } from "@/lib/shop-session";
import { upsertStoreFromOAuth } from "@/lib/stores";

/**
 * Complete Shopify OAuth, persist Store, inject tracking ScriptTag + webhooks.
 * Redirect URI: {HOST}/api/auth/callback
 *
 * After install, redirect into Shopify Admin embedded app URL so App Bridge
 * and session tokens work (required for App Store embedded checks).
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

    const { session, tokenMeta, brandKey } = result;

    const store = await upsertStoreFromOAuth({
      shop: session.shop,
      accessToken: session.accessToken!,
      scopes: session.scope ?? process.env.SCOPES ?? "",
      expiresIn: tokenMeta.expiresIn,
      refreshToken: tokenMeta.refreshToken,
      refreshTokenExpiresIn: tokenMeta.refreshTokenExpiresIn,
      brandKey,
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

    const apiKey = process.env.SHOPIFY_API_KEY?.trim() || "";
    const host = request.nextUrl.searchParams.get("host");
    const extraParams: Record<string, string | undefined | null> = {
      shop: store.shop,
      installed: "1",
      onboarding: "1",
      brandKey: store.brandKey,
      scriptTag: provision?.scriptTagId ? "1" : undefined,
      webPixel: provision?.webPixelId ? "1" : undefined,
      webhooks: provision?.webhooks?.length
        ? provision.webhooks.join(",")
        : undefined,
    };

    // Prefer landing inside Admin iframe so App Bridge initializes
    let redirectTarget: string;
    if (apiKey) {
      redirectTarget = buildEmbeddedAdminAppUrl({
        shop: store.shop,
        apiKey,
        host,
        searchParams: extraParams,
      });
    } else {
      const fallback = new URL("/", request.url);
      for (const [k, v] of Object.entries(extraParams)) {
        if (v != null && v !== "") fallback.searchParams.set(k, v);
      }
      redirectTarget = fallback.toString();
    }

    const response = NextResponse.redirect(redirectTarget);
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
