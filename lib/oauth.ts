import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Session } from "@shopify/shopify-api";
import { isValidBrandKey } from "@/lib/brand-key";
import {
  orderedShopifyCredentials,
  resolveShopifyCredentials,
  type ShopifyAppCredentials,
} from "@/lib/shopify-credentials";
import { getShopify, getOAuthRedirectUri, OAUTH_CALLBACK_PATH } from "@/lib/shopify";

const STATE_COOKIE = "lf_shopify_oauth_state";
const SHOP_COOKIE = "lf_shopify_oauth_shop";
const BRAND_COOKIE = "lf_shopify_oauth_brand";
/** 10 minutes — Shopify library default is only 60s and often expires mid-install. */
const OAUTH_COOKIE_MAX_AGE = 60 * 10;

export { OAUTH_CALLBACK_PATH };

function signState(body: string, apiSecret: string): string {
  return createHmac("sha256", apiSecret).update(body).digest("base64url");
}

/**
 * Minimal scopes for App Store review.
 * - write_pixels + read_customer_events: Web Pixel (primary conversion path)
 * - write_script_tags: storefront first-click ScriptTag
 * - read_orders: optional orders/paid|create webhook backup (order id/amount only)
 * Product names come from pixel/webhook payloads — we do not need read_products.
 */
const REQUIRED_SCOPES = [
  "read_orders",
  "write_script_tags",
  "write_pixels",
  "read_customer_events",
] as const;

function getScopes(): string {
  const fromEnv = (process.env.SCOPES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = new Set<string>([...fromEnv, ...REQUIRED_SCOPES]);
  return [...merged].join(",");
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

type OAuthStatePayload = {
  n: string;
  bk?: string;
  exp: number;
};

/**
 * Signed OAuth state: CSRF nonce + optional brandKey (HMAC with API secret).
 * Format: base64url(json).base64url(hmac)
 */
export function encodeOAuthState(
  brandKey?: string | null,
  credentials?: ShopifyAppCredentials,
): string {
  const apiSecret =
    credentials?.apiSecret ?? resolveShopifyCredentials().apiSecret;
  const payload: OAuthStatePayload = {
    n: randomBytes(16).toString("hex"),
    exp: Date.now() + OAUTH_COOKIE_MAX_AGE * 1000,
  };
  const key = brandKey?.trim();
  if (key && isValidBrandKey(key)) {
    payload.bk = key;
  }
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signState(body, apiSecret);
  return `${body}.${sig}`;
}

export function decodeOAuthState(
  state: string,
  credentials?: ShopifyAppCredentials,
): OAuthStatePayload | null {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const secrets = credentials
      ? [credentials.apiSecret]
      : orderedShopifyCredentials().map((item) => item.apiSecret);
    const matched = secrets.some((apiSecret) =>
      safeEqual(sig, signState(body, apiSecret)),
    );
    if (!matched) return null;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
    if (!payload?.n || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    if (payload.bk != null && !isValidBrandKey(payload.bk)) {
      delete payload.bk;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Start OAuth: set state cookies on the redirect response, then send merchant to Shopify.
 * Optional brandKey is embedded in signed `state` (+ cookie backup) so install from
 * Link Flow can auto-link the store after OAuth.
 */
export function beginOAuthRedirect(options: {
  shop: string;
  requestUrl: string;
  brandKey?: string | null;
}): NextResponse {
  const credentials = resolveShopifyCredentials({ shop: options.shop });
  const shopify = getShopify(options.requestUrl, credentials);
  const shop = shopify.utils.sanitizeShop(options.shop, true);
  if (!shop) {
    throw new Error("Invalid shop domain");
  }

  const brandKey =
    options.brandKey && isValidBrandKey(options.brandKey.trim())
      ? options.brandKey.trim()
      : null;
  const state = encodeOAuthState(brandKey, credentials);
  const redirectUri = getOAuthRedirectUri(options.requestUrl);
  const scope = getScopes();

  console.info("[oauth/begin] requesting scopes", {
    shop,
    scope,
    redirectUri,
    hasBrandKey: Boolean(brandKey),
    credentialsId: credentials.id,
  });

  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", credentials.apiKey);
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, state, cookieOptions());
  response.cookies.set(SHOP_COOKIE, shop, cookieOptions());
  if (brandKey) {
    response.cookies.set(BRAND_COOKIE, brandKey, cookieOptions());
  } else {
    response.cookies.set(BRAND_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type OAuthTokenMeta = {
  expiresIn: number | null;
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null;
};

export type OAuthCallbackResult =
  | {
      ok: true;
      session: Session;
      tokenMeta: OAuthTokenMeta;
      /** Brand key from signed OAuth state / cookie (Link Flow install). */
      brandKey: string | null;
      /** Client ID of the app that completed this install. */
      clientId: string;
    }
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

  let shopify = getShopify(
    options.requestUrl,
    resolveShopifyCredentials({ shop: shopParam }),
  );
  const shop = shopify.utils.sanitizeShop(shopParam, true);
  if (!shop) {
    return { ok: false, code: "invalid_shop", message: "Invalid shop domain" };
  }

  const query = authQueryFromUrl(url);
  let credentials: ShopifyAppCredentials | null = null;

  // Try preferred (shop / default) first, then other app secrets
  for (const candidate of orderedShopifyCredentials({ shop })) {
    const client = getShopify(options.requestUrl, candidate);
    try {
      if (await client.utils.validateHmac(query)) {
        credentials = candidate;
        shopify = client;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[oauth/callback] hmac error:", message);
      if (/timestamp/i.test(message)) {
        return {
          ok: false,
          code: "hmac_timestamp",
          message:
            "OAuth callback took too long (HMAC timestamp expired). Click install again and approve quickly.",
        };
      }
    }
  }

  if (!credentials) {
    console.error("[oauth/callback] invalid_hmac", {
      shop,
      tried: orderedShopifyCredentials({ shop }).map((item) => item.id),
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

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const savedShop = cookieStore.get(SHOP_COOKIE)?.value;
  const savedBrandKey = cookieStore.get(BRAND_COOKIE)?.value?.trim() || null;

  // Prefer verifying signed state payload (works even if cookie is delayed)
  const decoded =
    decodeOAuthState(state, credentials) ?? decodeOAuthState(state);
  if (!decoded) {
    // Fallback: plain hex state from older installs still in flight
    if (!savedState || !safeEqual(savedState, state)) {
      return {
        ok: false,
        code: "state_mismatch",
        message:
          "OAuth state invalid or expired. Try installing again (complete install within 10 minutes).",
      };
    }
  } else if (savedState && !safeEqual(savedState, state)) {
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

  const brandKeyFromState =
    decoded?.bk && isValidBrandKey(decoded.bk) ? decoded.bk : null;
  const brandKeyFromCookie =
    savedBrandKey && isValidBrandKey(savedBrandKey) ? savedBrandKey : null;
  const brandKey = brandKeyFromState || brandKeyFromCookie;

  // Request **expiring** offline tokens (required by Shopify Admin API 2025+)
  let tokenJson: {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
  try {
    const { exchangeAuthorizationCode } = await import("@/lib/shopify-tokens");
    tokenJson = await exchangeAuthorizationCode({
      shop,
      code,
      credentials,
    });
  } catch (e) {
    return {
      ok: false,
      code: "token_exchange_failed",
      message:
        e instanceof Error
          ? e.message.slice(0, 200)
          : "Token exchange failed",
    };
  }

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
    expires:
      tokenJson.expires_in != null
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : undefined,
  });

  // Attach refresh metadata for upsert (not part of Session class)
  return {
    ok: true,
    session,
    tokenMeta: {
      expiresIn: tokenJson.expires_in ?? null,
      refreshToken: tokenJson.refresh_token ?? null,
      refreshTokenExpiresIn: tokenJson.refresh_token_expires_in ?? null,
    },
    brandKey,
    clientId: credentials.apiKey,
  };
}

/** Clear one-time OAuth cookies on the success redirect response. */
export function clearOAuthCookies(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(SHOP_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(BRAND_COOKIE, "", { path: "/", maxAge: 0 });
}
