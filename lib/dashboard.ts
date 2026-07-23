import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getStoreByShop, normalizeShop } from "@/lib/stores";
import { getTrackingScriptUrl } from "@/lib/tracking-url";
import type { Sale, Store } from "@prisma/client";

const SHOP_SESSION_COOKIE = "lf_shop_session";

/** Decode shop from signed session cookie (same format as shop-session). */
async function shopFromSessionCookie(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(SHOP_SESSION_COOKIE)?.value;
    if (!raw) return null;
    const parts = raw.split(".");
    if (parts.length < 3) return null;
    return normalizeShop(parts[0]);
  } catch {
    return null;
  }
}

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
  linkFlowDashboardUrl: string;
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

export async function loadMerchantDashboard(
  shopParam?: string | null,
): Promise<MerchantDashboardData> {
  const linkFlowDashboardUrl =
    process.env.LINK_FLOW_DASHBOARD_URL?.trim() ||
    "https://www.linkflowaffiliates.com/brand/setup";

  const shop =
    normalizeShop(shopParam || "") || (await shopFromSessionCookie());

  if (!shop) {
    return {
      shop: null,
      store: null,
      trackingScriptUrl: null,
      tracking: {
        scriptTag: "unknown",
        webhooks: "unknown",
        webPixel: "unknown",
      },
      sales: { totalCount: 0, totalAmount: money(0), recent: [] },
      linkFlowDashboardUrl,
      needsInstall: true,
    };
  }

  let store: Store | null = null;
  try {
    store = await getStoreByShop(shop);
  } catch {
    store = null;
  }

  if (!store) {
    return {
      shop,
      store: null,
      trackingScriptUrl: null,
      tracking: {
        scriptTag: "missing",
        webhooks: "missing",
        webPixel: "missing",
      },
      sales: { totalCount: 0, totalAmount: money(0), recent: [] },
      linkFlowDashboardUrl,
      needsInstall: true,
    };
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
    linkFlowDashboardUrl,
    needsInstall: store.status !== "ACTIVE",
  };
}
