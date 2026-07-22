/**
 * Brand tracking keys (brandKey) — same system as Link Flow Affiliates.
 * Format: fb_<alphanumeric/underscore/hyphen>
 */

export const BRAND_KEY_REGEX = /^fb_[a-zA-Z0-9_-]+$/;

export type BrandRecord = {
  id: string;
  brandKey: string;
  brandName: string;
  shop?: string;
};

export type TrackedSale = {
  id: string;
  brandId: string;
  brandKey: string;
  productId: string;
  amount: number;
  orderId?: string;
  productName?: string;
  referralCode?: string;
  pageUrl?: string;
  shop?: string;
  createdAt: string;
  duplicate?: boolean;
};

function isValidBrandKeyFormat(key: string): boolean {
  return BRAND_KEY_REGEX.test(key) && key.length >= 10 && key.length <= 64;
}

/**
 * Optional allowlist from env for local/dev:
 * BRAND_KEYS=fb_abc123:Acme Brand,fb_def456:Other Brand
 * Or: BRAND_KEYS=fb_abc123,fb_def456
 */
function brandsFromEnv(): BrandRecord[] {
  const raw = process.env.BRAND_KEYS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [key, name] = part.split(":").map((s) => s.trim());
      return {
        id: `env_${index}_${key}`,
        brandKey: key,
        brandName: name || key,
      };
    })
    .filter((b) => isValidBrandKeyFormat(b.brandKey));
}

type BrandStore = {
  byKey: Map<string, BrandRecord>;
  sales: TrackedSale[];
};

const globalForBrand = globalThis as unknown as {
  linkFlowBrandStore?: BrandStore;
};

function getStore(): BrandStore {
  if (!globalForBrand.linkFlowBrandStore) {
    globalForBrand.linkFlowBrandStore = {
      byKey: new Map(),
      sales: [],
    };
  }
  return globalForBrand.linkFlowBrandStore;
}

/** Register or update a brand key (e.g. after merchant connects their key). */
export function registerBrandKey(
  brandKey: string,
  options?: { brandName?: string; shop?: string; id?: string },
): BrandRecord | null {
  if (!isValidBrandKeyFormat(brandKey)) return null;

  const store = getStore();
  const existing = store.byKey.get(brandKey);
  const record: BrandRecord = {
    id: options?.id || existing?.id || `brand_${brandKey}`,
    brandKey,
    brandName: options?.brandName || existing?.brandName || brandKey,
    shop: options?.shop || existing?.shop,
  };
  store.byKey.set(brandKey, record);
  return record;
}

/**
 * Resolve a brand by tracking key.
 * Order: in-memory registry → env BRAND_KEYS → open mode (accept valid format).
 */
export function resolveBrandByTrackingKey(brandKey: string): BrandRecord | null {
  if (!isValidBrandKeyFormat(brandKey)) return null;

  const store = getStore();
  const registered = store.byKey.get(brandKey);
  if (registered) return registered;

  const fromEnv = brandsFromEnv().find((b) => b.brandKey === brandKey);
  if (fromEnv) {
    store.byKey.set(brandKey, fromEnv);
    return fromEnv;
  }

  // When LINK_FLOW_API_URL is set, unknown keys are forwarded upstream.
  if (process.env.LINK_FLOW_API_URL) {
    return {
      id: `upstream_${brandKey}`,
      brandKey,
      brandName: "upstream",
    };
  }

  // Dev-friendly: accept any well-formed key and auto-register.
  // Set BRAND_KEYS_STRICT=true to require explicit registration/env allowlist.
  if (process.env.BRAND_KEYS_STRICT === "true") {
    return null;
  }

  return registerBrandKey(brandKey, { brandName: brandKey });
}

export function isValidBrandKey(brandKey: string): boolean {
  return isValidBrandKeyFormat(brandKey);
}

export function recordTrackedSale(input: {
  brand: BrandRecord;
  productId: string;
  amount: number;
  orderId?: string;
  productName?: string;
  referralCode?: string;
  pageUrl?: string;
}): TrackedSale {
  const store = getStore();

  if (input.orderId?.trim()) {
    const existing = store.sales.find(
      (s) =>
        s.brandId === input.brand.id &&
        s.orderId === input.orderId?.trim() &&
        s.productId === input.productId,
    );
    if (existing) {
      return { ...existing, duplicate: true };
    }
  }

  const sale: TrackedSale = {
    id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    brandId: input.brand.id,
    brandKey: input.brand.brandKey,
    productId: input.productId,
    amount: input.amount,
    orderId: input.orderId?.trim() || undefined,
    productName: input.productName,
    referralCode: input.referralCode,
    pageUrl: input.pageUrl,
    shop: input.brand.shop,
    createdAt: new Date().toISOString(),
    duplicate: false,
  };

  store.sales.unshift(sale);
  // Keep memory bounded in long-running dev servers
  if (store.sales.length > 5000) {
    store.sales.length = 5000;
  }

  return sale;
}

export function listTrackedSales(limit = 50): TrackedSale[] {
  return getStore().sales.slice(0, limit);
}
