import { createHmac, randomBytes, timingSafeEqual } from "crypto";
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
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
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

/**
 * Verify Shopify OAuth callback HMAC (query string minus hmac).
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */
export function verifyOAuthHmac(
  searchParams: URLSearchParams,
  apiSecret: string,
): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const entries: string[] = [];
  searchParams.forEach((value, key) => {
    if (key !== "hmac" && key !== "signature") {
      entries.push(`${key}=${value}`);
    }
  });
  entries.sort();
  const message = entries.join("&");

  const digest = createHmac("sha256", apiSecret).update(message).digest("hex");

  try {
    return safeEqual(digest, hmac);
  } catch {
    return false;
  }
}

export type OAuthCallbackResult =
  | { ok: true; session: Session }
  | { ok: false; code: string; message: string };

export async function completeOAuth(options: {
  requestUrl: string;
}): Promise<OAuthCallbackResult> {
  const url = new URL(options.requestUrl);
  const { apiKey, apiSecret } = getCredentials();
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

  if (!verifyOAuthHmac(url.searchParams, apiSecret)) {
    return {
      ok: false,
      code: "invalid_hmac",
      message: "HMAC validation failed — check SHOPIFY_API_SECRET",
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
