import type { NextRequest } from "next/server";
import { getShopify } from "@/lib/shopify";
import { normalizeShop } from "@/lib/stores";

/**
 * Extract a Bearer token from Authorization header, x-shopify-session-token,
 * or id_token query param (document loads from Admin).
 */
export function extractSessionTokenFromRequest(
  request?: NextRequest,
): string | null {
  if (!request) return null;

  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  const headerToken =
    request.headers.get("x-shopify-session-token") ||
    request.headers.get("X-Shopify-Session-Token");
  if (headerToken?.trim()) return headerToken.trim();

  const fromQuery = request.nextUrl.searchParams.get("id_token");
  if (fromQuery?.trim()) return fromQuery.trim();

  return null;
}

/**
 * Verify a Shopify App Bridge session token (JWT) and return the shop domain.
 * Returns null if the token is missing/invalid/expired.
 */
export async function verifyShopifySessionToken(
  token: string | null | undefined,
  requestUrl?: string,
): Promise<{ shop: string; payload: { dest: string; aud: string; exp: number } } | null> {
  if (!token?.trim()) return null;

  try {
    const shopify = getShopify(requestUrl);
    const payload = await shopify.session.decodeSessionToken(token.trim());
    const dest = new URL(payload.dest);
    const shop = normalizeShop(dest.hostname);
    if (!shop) return null;
    return {
      shop,
      payload: {
        dest: payload.dest,
        aud: String(payload.aud),
        exp: Number(payload.exp),
      },
    };
  } catch {
    return null;
  }
}

/**
 * True when Bearer / id_token is a valid Shopify session token for `expectedShop`.
 */
export async function isShopifySessionTokenForShop(
  token: string | null | undefined,
  expectedShop: string,
  requestUrl?: string,
): Promise<boolean> {
  const verified = await verifyShopifySessionToken(token, requestUrl);
  if (!verified) return false;
  return verified.shop === normalizeShop(expectedShop);
}

/**
 * Build the Admin embedded app URL so the merchant lands inside Shopify Admin
 * (required for App Bridge + session tokens). Prefer `host` from OAuth when present.
 */
export function buildEmbeddedAdminAppUrl(options: {
  shop: string;
  apiKey: string;
  /** Base64 host from Shopify OAuth / app open query */
  host?: string | null;
  /** Extra query params to append (e.g. installed=1) */
  searchParams?: Record<string, string | undefined | null>;
}): string {
  const apiKey = options.apiKey.trim();
  const shop = normalizeShop(options.shop) || options.shop;
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");

  let base: string;
  if (options.host) {
    try {
      const decoded = Buffer.from(options.host, "base64").toString("utf8");
      // host is like "admin.shopify.com/store/store-handle" or "{shop}/admin"
      if (decoded.includes("admin.shopify.com") || decoded.includes("/admin")) {
        base = `https://${decoded.replace(/\/$/, "")}/apps/${apiKey}`;
      } else {
        base = `https://${decoded}/apps/${apiKey}`;
      }
    } catch {
      base = `https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}`;
    }
  } else {
    base = `https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}`;
  }

  const url = new URL(base);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}
