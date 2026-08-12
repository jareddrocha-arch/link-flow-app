import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  decodeSession,
  SHOP_SESSION_COOKIE,
} from "@/lib/shop-session";
import {
  isShopifySessionTokenForShop,
  verifyShopifySessionToken,
} from "@/lib/session-token";
import { getStoreByShop, normalizeShop } from "@/lib/stores";
import { getTrackingScriptUrl } from "@/lib/tracking-url";
import type { Sale, Store } from "@prisma/client";

export type DashboardSale = {
  id: string;
  orderId: string | null;
  amount: string;
  commission: string;
  status: string;
  referralCode: string | null;
  productName: string | null;
  createdAt: string;
};

export type MerchantDashboardData = {
  shop: string | null;
  /** True when shop is known but caller is not authorized to see merchant data */
  authRequired: boolean;
  store: {
    id: string;
    shop: string;
    name: string;
    brandKey: string | null;
    status: string;
    scopes: string;
    scriptTagId: string | null;
    trackingInstalledAt: string | null;
    webhooksInstalledAt: string | null;
    webPixelId: string | null;
    webPixelInstalledAt: string | null;
    installedAt: string;
  } | null;
  trackingScriptUrl: string | null;
  tracking: {
    scriptTag: "ok" | "missing" | "unknown";
    webhooks: "ok" | "missing" | "unknown";
    webPixel: "ok" | "missing" | "unknown";
  };
  sales: {
    totalCount: number;
    totalAmount: string;
    recent: DashboardSale[];
  };
  needsInstall: boolean;
};

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function mapSale(s: Sale): DashboardSale {
  return {
    id: s.id,
    orderId: s.orderId,
    amount: money(Number(s.amount)),
    commission: money(Number(s.commission)),
    status: s.status,
    referralCode: s.referralCode,
    productName: s.productName,
    createdAt: s.createdAt.toISOString(),
  };
}

function emptyDashboard(
  partial: Partial<MerchantDashboardData> = {},
): MerchantDashboardData {
  return {
    shop: null,
    authRequired: false,
    store: null,
    trackingScriptUrl: null,
    tracking: {
      scriptTag: "unknown",
      webhooks: "unknown",
      webPixel: "unknown",
    },
    sales: { totalCount: 0, totalAmount: money(0), recent: [] },
    needsInstall: true,
    ...partial,
  };
}

/**
 * Resolve shop + whether the request is allowed to see merchant data.
 *
 * Production allows sensitive data only when:
 * 1. Valid Shopify session JWT (`id_token` query) for that shop, or
 * 2. Signed `lf_shop_session` cookie for that shop
 *
 * Bare `?shop=` without either is not enough (prevents scraping sales/brand keys).
 * Local development still allows shop param for easier testing.
 */
async function resolveDashboardAuth(options: {
  shopParam?: string | null;
  idToken?: string | null;
  requestUrl?: string;
}): Promise<{ shop: string | null; authorized: boolean }> {
  const shopFromParam = normalizeShop(options.shopParam || "");
  const idToken = options.idToken?.trim() || null;
  const isDev = process.env.NODE_ENV !== "production";

  // 1) App Bridge / Admin document load: id_token JWT
  if (idToken) {
    const verified = await verifyShopifySessionToken(
      idToken,
      options.requestUrl,
    );
    if (verified?.shop) {
      if (shopFromParam && shopFromParam !== verified.shop) {
        return { shop: shopFromParam, authorized: false };
      }
      return { shop: verified.shop, authorized: true };
    }
  }

  // 2) Signed first-party / SameSite=None session cookie
  let cookieShop: string | null = null;
  try {
    const raw = (await cookies()).get(SHOP_SESSION_COOKIE)?.value;
    cookieShop = decodeSession(raw);
  } catch {
    cookieShop = null;
  }

  if (cookieShop) {
    if (shopFromParam && shopFromParam !== cookieShop) {
      return { shop: shopFromParam, authorized: false };
    }
    return { shop: cookieShop, authorized: true };
  }

  // 3) Dev convenience: allow ?shop= without token
  if (isDev && shopFromParam) {
    return { shop: shopFromParam, authorized: true };
  }

  // 4) Shop known from query but not authenticated
  if (shopFromParam) {
    return { shop: shopFromParam, authorized: false };
  }

  return { shop: null, authorized: false };
}

export type LoadMerchantDashboardOptions = {
  shop?: string | null;
  idToken?: string | null;
  /** Used for session token audience / host checks when available */
  requestUrl?: string;
};

export async function loadMerchantDashboard(
  shopParamOrOptions?: string | null | LoadMerchantDashboardOptions,
): Promise<MerchantDashboardData> {
  const options: LoadMerchantDashboardOptions =
    shopParamOrOptions != null && typeof shopParamOrOptions === "object"
      ? shopParamOrOptions
      : { shop: shopParamOrOptions as string | null | undefined };

  const { shop, authorized } = await resolveDashboardAuth({
    shopParam: options.shop,
    idToken: options.idToken,
    requestUrl: options.requestUrl,
  });

  if (!shop) {
    return emptyDashboard({
      needsInstall: true,
      authRequired: false,
    });
  }

  // Known shop but no session — do not load or return merchant secrets
  if (!authorized) {
    return emptyDashboard({
      shop,
      needsInstall: false,
      authRequired: true,
      tracking: {
        scriptTag: "unknown",
        webhooks: "unknown",
        webPixel: "unknown",
      },
    });
  }

  let store: Store | null = null;
  try {
    store = await getStoreByShop(shop);
  } catch {
    store = null;
  }

  if (!store) {
    return emptyDashboard({
      shop,
      needsInstall: true,
      authRequired: false,
      tracking: {
        scriptTag: "missing",
        webhooks: "missing",
        webPixel: "missing",
      },
    });
  }

  const [totalCount, amountAgg, recent] = await Promise.all([
    prisma.sale.count({ where: { storeId: store.id } }),
    prisma.sale.aggregate({
      where: { storeId: store.id },
      _sum: { amount: true },
    }),
    prisma.sale.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const totalAmount = Number(amountAgg._sum.amount ?? 0);
  const trackingScriptUrl = store.brandKey
    ? getTrackingScriptUrl({ brandKey: store.brandKey })
    : null;

  return {
    shop: store.shop,
    authRequired: false,
    store: {
      id: store.id,
      shop: store.shop,
      name: store.name || store.shop.replace(".myshopify.com", ""),
      brandKey: store.brandKey,
      status: store.status,
      scopes: store.scopes,
      scriptTagId: store.scriptTagId,
      trackingInstalledAt: store.trackingInstalledAt?.toISOString() ?? null,
      webhooksInstalledAt: store.webhooksInstalledAt?.toISOString() ?? null,
      webPixelId: store.webPixelId,
      webPixelInstalledAt: store.webPixelInstalledAt?.toISOString() ?? null,
      installedAt: store.installedAt.toISOString(),
    },
    trackingScriptUrl,
    tracking: {
      scriptTag: store.scriptTagId || store.trackingInstalledAt ? "ok" : "missing",
      webhooks: store.webhooksInstalledAt ? "ok" : "missing",
      webPixel: store.webPixelId || store.webPixelInstalledAt ? "ok" : "missing",
    },
    sales: {
      totalCount,
      totalAmount: money(totalAmount),
      recent: recent.map(mapSale),
    },
    needsInstall: store.status !== "ACTIVE",
  };
}

/**
 * True when a Shopify session JWT is valid for the given shop.
 * Used by page-level helpers when re-checking after client handshake.
 */
export async function isSessionTokenForShop(
  token: string | null | undefined,
  shop: string,
  requestUrl?: string,
): Promise<boolean> {
  return isShopifySessionTokenForShop(token, shop, requestUrl);
}
