import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  getStoreAccessToken,
  getStoreByShop,
  normalizeShop,
  requireStoreAccessToken,
} from "@/lib/stores";
import type { Store } from "@prisma/client";

export const SHOP_SESSION_COOKIE = "lf_shop_session";
/** 30 days */
const SHOP_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function signingSecret(): string {
  const secret =
    process.env.SHOPIFY_API_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Missing SHOPIFY_API_SECRET (or SESSION_SECRET) for shop session cookies",
    );
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret())
    .update(value)
    .digest("base64url");
}

/**
 * Encode shop session. Must not use bare dots as delimiters for the shop
 * domain (myshopify.com contains dots).
 * Format: base64url({shop,t}).signature
 */
function encodeSession(shop: string): string {
  const payload = Buffer.from(
    JSON.stringify({ shop, t: Date.now() }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Decode and verify shop session cookie. Supports:
 * - New format: base64url(json).sig
 * - Legacy broken format: shop.with.dots.timestamp.sig (best-effort)
 */
export function decodeSession(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const payload = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  if (!payload || !sig) return null;

  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  // New JSON payload
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { shop?: string; t?: number };
    if (json?.shop) {
      return normalizeShop(json.shop);
    }
  } catch {
    /* try legacy */
  }

  // Legacy: "lftesting.myshopify.com.<timestamp>"
  const legacyParts = payload.split(".");
  if (legacyParts.length >= 4) {
    // last segment is timestamp
    const maybeTs = legacyParts[legacyParts.length - 1];
    if (/^\d+$/.test(maybeTs)) {
      const shop = legacyParts.slice(0, -1).join(".");
      return normalizeShop(shop);
    }
  }

  return null;
}

export function setShopSessionCookie(
  response: NextResponse,
  shop: string,
): void {
  const normalized = normalizeShop(shop);
  if (!normalized) return;

  response.cookies.set(SHOP_SESSION_COOKIE, encodeSession(normalized), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SHOP_SESSION_MAX_AGE,
  });
}

export function clearShopSessionCookie(response: NextResponse): void {
  response.cookies.set(SHOP_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Short-lived signed action token for embedded Admin iframes.
 * Cookies often fail as third-party in Shopify Admin; this token is passed
 * as Authorization: Bearer and does not rely on cookies.
 * Format: base64url({shop,exp}).sig  — valid ~2 hours
 */
export function createShopActionToken(
  shop: string,
  ttlSeconds = 2 * 60 * 60,
): string {
  const normalized = normalizeShop(shop);
  if (!normalized) {
    throw new Error("Invalid shop for action token");
  }
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = Buffer.from(
    JSON.stringify({ shop: normalized, exp }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyShopActionToken(
  token: string | null | undefined,
  expectedShop: string,
): boolean {
  if (!token) return false;
  const normalized = normalizeShop(expectedShop);
  if (!normalized) return false;

  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { shop?: string; exp?: number };
    if (!json.shop || !json.exp) return false;
    if (json.exp < Date.now()) return false;
    return normalizeShop(json.shop) === normalized;
  } catch {
    return false;
  }
}

function extractBearerToken(request?: NextRequest): string | null {
  if (!request) return null;
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return (
    request.headers.get("x-shop-action-token") ||
    request.nextUrl.searchParams.get("actionToken")
  );
}

/**
 * True if request is allowed to manage this shop:
 * - non-production, or
 * - DEBUG_SECRET key matches, or
 * - valid signed action token (Bearer / header / options.actionToken) for this shop, or
 * - valid signed lf_shop_session cookie for this shop
 */
export async function isAuthorizedForShop(
  shop: string,
  request?: NextRequest,
  options?: { actionToken?: string | null },
): Promise<boolean> {
  const normalized = normalizeShop(shop);
  if (!normalized) return false;

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const key =
    request?.nextUrl.searchParams.get("key") ||
    request?.headers.get("x-debug-secret");
  if (
    process.env.DEBUG_SECRET?.trim() &&
    key === process.env.DEBUG_SECRET.trim()
  ) {
    return true;
  }

  // Preferred for embedded Admin (no third-party cookies)
  const actionToken =
    options?.actionToken || extractBearerToken(request) || null;
  if (verifyShopActionToken(actionToken, normalized)) {
    return true;
  }

  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SHOP_SESSION_COOKIE)?.value;
    const sessionShop = decodeSession(raw);
    return sessionShop === normalized;
  } catch {
    return false;
  }
}

/**
 * Resolve shop domain from (in order):
 * 1. ?shop= query param
 * 2. Signed session cookie set after OAuth
 * 3. X-Shopify-Shop-Domain header
 */
export async function resolveShopFromRequest(
  request: NextRequest,
): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get("shop");
  if (fromQuery) {
    const n = normalizeShop(fromQuery);
    if (n) return n;
  }

  const headerShop =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain");
  if (headerShop) {
    const n = normalizeShop(headerShop);
    if (n) return n;
  }

  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SHOP_SESSION_COOKIE)?.value);
}

export async function getCurrentStore(
  request: NextRequest,
): Promise<Store | null> {
  const shop = await resolveShopFromRequest(request);
  if (!shop) return null;
  return getStoreByShop(shop);
}

export async function getCurrentStoreAccessToken(
  request: NextRequest,
): Promise<string | null> {
  const shop = await resolveShopFromRequest(request);
  if (!shop) return null;
  return getStoreAccessToken(shop);
}

export async function requireCurrentStore(request: NextRequest): Promise<{
  shop: string;
  store: Store;
  accessToken: string;
}> {
  const shop = await resolveShopFromRequest(request);
  if (!shop) {
    throw new Error("No shop in session — reinstall the app");
  }
  const { store, accessToken } = await requireStoreAccessToken(shop);
  return { shop, store, accessToken };
}
