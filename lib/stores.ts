import type { Store, StoreStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { isValidBrandKey } from "@/lib/brand-key";

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
 * Update brandKey for an active store (merchant confirm / link to Link Flow account).
 */
export async function updateStoreBrandKey(
  shop: string,
  brandKey: string,
): Promise<Store> {
  const normalized = normalizeShop(shop);
  if (!normalized) {
    throw new Error("Invalid shop domain");
  }

  const key = brandKey.trim();
  if (!isValidBrandKey(key)) {
    throw new Error(
      "Invalid brand key. It must start with fb_ and be 10–64 characters.",
    );
  }

  const store = await prisma.store.findUnique({ where: { shop: normalized } });
  if (!store || store.status !== "ACTIVE") {
    throw new Error("Store not found or not active");
  }

  const conflict = await prisma.store.findFirst({
    where: {
      brandKey: key,
      NOT: { id: store.id },
    },
  });
  if (conflict) {
    throw new Error("That brand key is already linked to another store");
  }

  return prisma.store.update({
    where: { id: store.id },
    data: { brandKey: key },
  });
}

/**
 * @deprecated Prefer cleanupShopUninstall() for full cleanup.
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
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(cleaned)) {
      return `${cleaned}.myshopify.com`;
    }
    return cleaned.includes(".") ? cleaned : null;
  }
  return cleaned;
}

function generateBrandKey(): string {
  return `fb_${randomBytes(16).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
}

export type { Store, StoreStatus };
