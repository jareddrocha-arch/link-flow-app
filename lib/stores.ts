import type { Store, StoreStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidBrandKey } from "@/lib/brand-key";

export type UpsertStoreInput = {
  shop: string;
  accessToken: string;
  scopes?: string | null;
  name?: string | null;
  expiresIn?: number | null;
  refreshToken?: string | null;
  refreshTokenExpiresIn?: number | null;
  /**
   * When install is started from Link Flow with brandKey in OAuth state,
   * prefer this key so the store is linked automatically.
   */
  brandKey?: string | null;
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
  const accessTokenExpiresAt =
    input.expiresIn != null
      ? new Date(now.getTime() + input.expiresIn * 1000)
      : null;
  const refreshTokenExpiresAt =
    input.refreshTokenExpiresIn != null
      ? new Date(now.getTime() + input.refreshTokenExpiresIn * 1000)
      : null;

  const preferredKey =
    input.brandKey && isValidBrandKey(input.brandKey.trim())
      ? input.brandKey.trim()
      : null;

  let resolvedPreferred: string | null = preferredKey;
  if (preferredKey) {
    const taken = await prisma.store.findFirst({
      where: {
        brandKey: preferredKey,
        NOT: { shop },
      },
      select: { shop: true },
    });
    if (taken) {
      console.warn(
        "[oauth] brandKey already linked to another shop; generating new key",
        { preferredKey, otherShop: taken.shop, shop },
      );
      resolvedPreferred = null;
    }
  }

  const existing = await prisma.store.findUnique({ where: { shop } });

  if (existing) {
    // Install-from-Link-Flow (signed OAuth brandKey) wins over empty existing.
    // Never auto-generate: locked keys stay put; missing keys stay null until first set.
    let nextBrandKey = existing.brandKey;
    if (resolvedPreferred) {
      if (!existing.brandKey || existing.brandKey === resolvedPreferred) {
        nextBrandKey = resolvedPreferred;
      } else if (existing.brandKey !== resolvedPreferred) {
        // Key already locked to a different value — keep existing (support to change)
        console.warn(
          "[oauth] store already has brandKey; ignoring install brandKey",
          { shop, existing: existing.brandKey, preferred: resolvedPreferred },
        );
      }
    }

    return prisma.store.update({
      where: { shop },
      data: {
        accessToken: input.accessToken,
        scopes,
        name: input.name ?? existing.name,
        status: "ACTIVE",
        uninstalledAt: null,
        tokenUpdatedAt: now,
        accessTokenExpiresAt,
        refreshToken: input.refreshToken ?? existing.refreshToken,
        refreshTokenExpiresAt:
          refreshTokenExpiresAt ?? existing.refreshTokenExpiresAt,
        brandKey: nextBrandKey,
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
      accessTokenExpiresAt,
      refreshToken: input.refreshToken ?? null,
      refreshTokenExpiresAt,
      // Only set from Link Flow install; otherwise merchant sets once in dashboard
      brandKey: resolvedPreferred,
    },
  });
}

/**
 * Set brandKey for an active store.
 * Allowed only when the store has no brandKey yet (first-time link).
 * Once set, the key is locked — changes require support.
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

  if (store.brandKey) {
    if (store.brandKey === key) {
      return store;
    }
    throw new Error(
      "Brand key is locked and cannot be changed from the app. Contact Link Flow support if you need it updated.",
    );
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

export type { Store, StoreStatus };
