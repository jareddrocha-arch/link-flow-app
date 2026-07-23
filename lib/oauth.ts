import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Session } from "@shopify/shopify-api";
import { getShopify, getOAuthRedirectUri, OAUTH_CALLBACK_PATH } from "@/lib/shopify";

const STATE_COOKIE = "lf_shopify_oauth_state";
const SHOP_COOKIE = "lf_shopify_oauth_shop";
/** 10 minutes — Shopify library default is only 60s and often expires mid-install. */
const OAUTH_COOKIE_MAX_AGE = 60 * 10;

export { OAUTH_CALLBACK_PATH };

function getCredentials() {
  // Trim — Vercel/env pastes often include trailing newlines/spaces and break HMAC
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }
  return { apiKey, apiSecret };
}

function getScopes(): string {
  return (process.env.SCOPES ?? "read_products")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
}

/**
 * Start OAuth: set state cookies on the redirect response, then send merchant to Shopify.
 */
export function beginOAuthRedirect(options: {
  shop: string;
  requestUrl: string;
}): NextResponse {
  const shopify = getShopify(options.requestUrl);
  const shop = shopify.utils.sanitizeShop(options.shop, true);
  if (!shop) {
    throw new Error("Invalid shop domain");
  }

  const { apiKey } = getCredentials();
  const state = randomBytes(16).toString("hex");
  const redirectUri = getOAuthRedirectUri(options.requestUrl);

  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", apiKey);
  authorize.searchParams.set("scope", getScopes());
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, state, cookieOptions());
  response.cookies.set(SHOP_COOKIE, shop, cookieOptions());
  return response;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type OAuthCallbackResult =
  | { ok: true; session: Session }
  | { ok: false; code: string; message: string };

/**
 * Build the query object Shopify's validateHmac expects (string values only).
 */
function authQueryFromUrl(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

export async function completeOAuth(options: {
  requestUrl: string;
}): Promise<OAuthCallbackResult> {
  const url = new URL(options.requestUrl);
  const { apiKey, apiSecret } = getCredentials();
  // Pass trimmed secret into Shopify client for HMAC + any library calls
  const shopify = getShopify(options.requestUrl);

  const shopParam = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!shopParam || !code || !state) {
    return {
      ok: false,
      code: "missing_params",
      message: "Callback missing shop, code, or state",
    };
  }

  const shop = shopify.utils.sanitizeShop(shopParam, true);
  if (!shop) {
    return { ok: false, code: "invalid_shop", message: "Invalid shop domain" };
  }

  // Use official Shopify HMAC (URL-encoded query string + hex digest)
  try {
    const query = authQueryFromUrl(url);
    const valid = await shopify.utils.validateHmac(query);
    if (!valid) {
      console.error("[oauth/callback] invalid_hmac", {
        secretLength: apiSecret.length,
        secretPrefix: apiSecret.slice(0, 6),
        hasHmac: Boolean(query.hmac),
        hasTimestamp: Boolean(query.timestamp),
        keys: Object.keys(query).sort(),
      });
      return {
        ok: false,
        code: "invalid_hmac",
        message:
          "HMAC validation failed — SHOPIFY_API_SECRET does not match this Client ID (or has extra spaces/newlines in Vercel).",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[oauth/callback] hmac error:", message);
    // Timestamp window is only ~90s in the library — surface that clearly
    if (/timestamp/i.test(message)) {
      return {
        ok: false,
        code: "hmac_timestamp",
        message:
          "OAuth callback took too long (HMAC timestamp expired). Click install again and approve quickly.",
      };
    }
    return {
      ok: false,
      code: "invalid_hmac",
      message: `HMAC validation failed: ${message.slice(0, 100)}`,
    };
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const savedShop = cookieStore.get(SHOP_COOKIE)?.value;

  if (!savedState || !safeEqual(savedState, state)) {
    return {
      ok: false,
      code: "state_mismatch",
      message:
        "OAuth state cookie missing or mismatched. Try installing again (cookies must be enabled; complete install within 10 minutes).",
    };
  }

  if (savedShop && shopify.utils.sanitizeShop(savedShop, true) !== shop) {
    return {
      ok: false,
      code: "shop_mismatch",
      message: "Shop in callback does not match the shop that started install",
    };
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    return {
      ok: false,
      code: "token_exchange_failed",
      message: `Token exchange failed (${tokenRes.status}): ${body.slice(0, 200)}`,
    };
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
  };

  if (!tokenJson.access_token) {
    return {
      ok: false,
      code: "no_access_token",
      message: "Shopify did not return an access token",
    };
  }

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state,
    isOnline: false,
    accessToken: tokenJson.access_token,
    scope: tokenJson.scope,
  });

  return { ok: true, session };
}

/** Clear one-time OAuth cookies on the success redirect response. */
export function clearOAuthCookies(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(SHOP_COOKIE, "", { path: "/", maxAge: 0 });
}
