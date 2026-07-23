import type { Store, StoreStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export type UpsertStoreInput = {
  shop: string;
  accessToken: string;
  scopes?: string | null;
  name?: string | null;
};

/**
 * Create or update a Store after successful Shopify OAuth.
 * Re-installs refresh the access token and mark the store ACTIVE.
 */
export async function upsertStoreFromOAuth(
  input: UpsertStoreInput,
): Promise<Store> {
  const shop = normalizeShop(input.shop);
  if (!shop) {
    throw new Error("Invalid shop domain");
  }

  const scopes = (input.scopes ?? "").trim();
  const now = new Date();

  const existing = await prisma.store.findUnique({ where: { shop } });

  if (existing) {
    return prisma.store.update({
      where: { shop },
      data: {
        accessToken: input.accessToken,
        scopes,
        name: input.name ?? existing.name,
        status: "ACTIVE",
        uninstalledAt: null,
        tokenUpdatedAt: now,
        // Keep brandKey if already issued
        brandKey: existing.brandKey ?? generateBrandKey(),
      },
    });
  }

  return prisma.store.create({
    data: {
      shop,
      accessToken: input.accessToken,
      scopes,
      name: input.name ?? null,
      status: "ACTIVE",
      installedAt: now,
      tokenUpdatedAt: now,
      brandKey: generateBrandKey(),
    },
  });
}

/**
 * @deprecated Prefer cleanupShopUninstall() for full ScriptTag/pixel/session cleanup.
 * Kept for simple status flips if needed.
 */
export async function markStoreUninstalled(shop: string): Promise<Store | null> {
  const normalized = normalizeShop(shop);
  if (!normalized) return null;

  try {
    return await prisma.store.update({
      where: { shop: normalized },
      data: {
        status: "UNINSTALLED",
        uninstalledAt: new Date(),
        accessToken: "",
        scopes: "",
        scriptTagId: null,
        trackingInstalledAt: null,
        webhooksInstalledAt: null,
        webPixelId: null,
        webPixelInstalledAt: null,
        brandKey: null,
      },
    });
  } catch {
    return null;
  }
}

export async function getStoreByShop(shop: string): Promise<Store | null> {
  const normalized = normalizeShop(shop);
  if (!normalized) return null;
  return prisma.store.findUnique({ where: { shop: normalized } });
}

export async function getStoreByBrandKey(brandKey: string): Promise<Store | null> {
  const key = brandKey.trim();
  if (!key) return null;
  return prisma.store.findUnique({ where: { brandKey: key } });
}

/**
 * Offline Admin API access token for a shop.
 * Returns null if store missing, uninstalled, or token empty.
 */
export async function getStoreAccessToken(
  shop: string,
): Promise<string | null> {
  const store = await getStoreByShop(shop);
  if (!store || store.status === "UNINSTALLED") return null;
  if (!store.accessToken) return null;
  return store.accessToken;
}

export async function requireStoreAccessToken(shop: string): Promise<{
  store: Store;
  accessToken: string;
}> {
  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE" || !store.accessToken) {
    throw new Error(`No active Shopify session for shop: ${shop}`);
  }
  return { store, accessToken: store.accessToken };
}

export function normalizeShop(shop: string): string | null {
  const cleaned = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!cleaned) return null;
  // Basic myshopify.com shape
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    // Allow bare store name
    if (/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
      return `${cleaned}.myshopify.com`;
    }
    return cleaned.includes(".") ? cleaned : null;
  }
  return cleaned;
}

/** Same format as Link Flow main platform brand keys. */
function generateBrandKey(): string {
  return `fb_${randomBytes(16).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
}

export type { Store, StoreStatus };
