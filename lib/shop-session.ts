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

const SHOP_SESSION_COOKIE = "lf_shop_session";
/** 30 days */
const SHOP_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function signingSecret(): string {
  const secret =
    process.env.SHOPIFY_API_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing SHOPIFY_API_SECRET (or SESSION_SECRET) for shop session cookies");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function encodeSession(shop: string): string {
  const payload = `${shop}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function decodeSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop()!;
  const payload = parts.join(".");
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const shop = parts[0];
  return normalizeShop(shop);
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
 * Resolve shop domain from (in order):
 * 1. ?shop= query param
 * 2. Signed session cookie set after OAuth
 * 3. X-Shopify-Shop-Domain header (webhooks / embedded)
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

/**
 * Load Store row for the current request (null if not installed / unknown).
 */
export async function getCurrentStore(
  request: NextRequest,
): Promise<Store | null> {
  const shop = await resolveShopFromRequest(request);
  if (!shop) return null;
  return getStoreByShop(shop);
}

/**
 * Offline access token for the shop on this request.
 */
export async function getCurrentStoreAccessToken(
  request: NextRequest,
): Promise<string | null> {
  const shop = await resolveShopFromRequest(request);
  if (!shop) return null;
  return getStoreAccessToken(shop);
}

/**
 * Throws if the shop is not installed / has no token.
 */
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
