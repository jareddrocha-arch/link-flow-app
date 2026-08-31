import { NextRequest, NextResponse } from "next/server";
import {
  extractSessionTokenFromRequest,
  verifyShopifySessionToken,
} from "@/lib/session-token";
import { setShopSessionCookie } from "@/lib/shop-session";
import { peekShopifySessionToken, resolveShopifyCredentials } from "@/lib/shopify-credentials";
import {
  exchangeSessionTokenForOfflineAccess,
  offlineTokenNeedsRefresh,
} from "@/lib/shopify-tokens";
import { getStoreByShop, normalizeShop, upsertStoreFromOAuth } from "@/lib/stores";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import { isValidBrandKey } from "@/lib/brand-key";

/**
 * Complete install from an embedded Admin session (managed install / App Review).
 *
 * POST Authorization: Bearer <session token from shopify.idToken()>
 * Optional body: { shop?: string, brandKey?: string }
 *
 * - If store already ACTIVE → set session cookie and return status
 * - If not installed → exchange session token for offline access token, upsert
 *   Store, provision tracking, set cookie
 *
 * Avoids a second OAuth authorize hop that breaks inside the Admin iframe
 * ("accounts.shopify.com refused to connect").
 */
export async function POST(request: NextRequest) {
  let bodyShop: string | null = null;
  let brandKeyParam: string | null = null;
  try {
    const body = (await request.json()) as {
      shop?: string;
      brandKey?: string;
      brand_key?: string;
    };
    bodyShop = body.shop ?? null;
    brandKeyParam = body.brandKey || body.brand_key || null;
  } catch {
    /* empty body ok */
  }

  const token = extractSessionTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing session token",
        code: "missing_session_token",
        needsOAuth: true,
      },
      {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      },
    );
  }

  const verified = await verifyShopifySessionToken(token, request.url);
  if (!verified) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid or expired session token",
        code: "invalid_session_token",
        needsOAuth: true,
      },
      {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      },
    );
  }

  const shop = verified.shop;
  if (bodyShop) {
    const expected = normalizeShop(bodyShop);
    if (expected && expected !== shop) {
      return NextResponse.json(
        {
          ok: false,
          error: "Session token shop does not match request",
          code: "shop_mismatch",
          needsOAuth: false,
        },
        { status: 403 },
      );
    }
  }

  const brandKey =
    brandKeyParam && isValidBrandKey(brandKeyParam.trim())
      ? brandKeyParam.trim()
      : null;

  try {
    let store = await getStoreByShop(shop);
    let provisioned = false;

    // Re-exchange when missing, inactive, empty, or expired. Required for
    // private-app swaps (SS2): an old app's leftover token looks "installed"
    // but Admin API 401s and must not skip session-token exchange.
    const needsToken = offlineTokenNeedsRefresh(store);

    if (needsToken) {
      console.info("[auth/bootstrap] exchanging session token for offline access", {
        shop,
        hadStore: Boolean(store),
        status: store?.status ?? null,
      });

      const peek = peekShopifySessionToken(token);
      const credentials = resolveShopifyCredentials({
        clientId: peek?.aud ?? verified.payload.aud,
        shop,
      });
      const tokens = await exchangeSessionTokenForOfflineAccess({
        shop,
        sessionToken: token,
        credentials,
      });

      store = await upsertStoreFromOAuth({
        shop,
        accessToken: tokens.access_token!,
        scopes: tokens.scope ?? process.env.SCOPES ?? "",
        expiresIn: tokens.expires_in ?? null,
        refreshToken: tokens.refresh_token ?? null,
        refreshTokenExpiresIn: tokens.refresh_token_expires_in ?? null,
        brandKey,
      });

      try {
        await provisionStoreTracking(store);
        provisioned = true;
        // Reload after provision may update script/pixel ids
        store = (await getStoreByShop(shop)) ?? store;
      } catch (e) {
        console.error("[auth/bootstrap] provision failed (install still ok)", e);
      }
    } else if (store && brandKey && !store.brandKey) {
      // Warm brand key from Link Flow while already installed
      store = await upsertStoreFromOAuth({
        shop,
        accessToken: store.accessToken,
        scopes: store.scopes,
        brandKey,
        expiresIn: store.accessTokenExpiresAt
          ? Math.max(
              0,
              Math.floor(
                (store.accessTokenExpiresAt.getTime() - Date.now()) / 1000,
              ),
            )
          : null,
        refreshToken: store.refreshToken,
        refreshTokenExpiresIn: store.refreshTokenExpiresAt
          ? Math.max(
              0,
              Math.floor(
                (store.refreshTokenExpiresAt.getTime() - Date.now()) / 1000,
              ),
            )
          : null,
      });
    }

    if (!store || store.status !== "ACTIVE") {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not activate store",
          code: "install_incomplete",
          needsOAuth: true,
        },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      shop: store.shop,
      installed: true,
      brandKey: store.brandKey,
      // Cold install is self-contained in the embedded app (no external connect UI).
      // Kept for backward-compatible clients; always false for review-safe flow.
      needsBrandConnect: false,
      hasBrandKey: Boolean(store.brandKey?.trim()),
      provisioned,
      auth: "session_token",
    });
    setShopSessionCookie(response, store.shop);
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[auth/bootstrap] failed", { shop, message });
    return NextResponse.json(
      {
        ok: false,
        error: message.slice(0, 200),
        code: "bootstrap_failed",
        // Token exchange can fail if scopes not yet granted — fall back to OAuth top-level
        needsOAuth: true,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST with Authorization: Bearer <session token>",
      method: "POST",
    },
    { status: 405 },
  );
}
