import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/shopify-tokens";
import {
  extractReferralCodeFromOrder,
  fetchPaidOrdersSince,
} from "@/lib/shopify-orders";
import { recordStoreSale } from "@/lib/record-sale";
import { getLinkFlowApiUrl } from "@/lib/link-flow-api";

const OVERLAP_MS = 18 * 60 * 60 * 1000;
const ATTRIBUTION_MS = 90 * 24 * 60 * 60 * 1000;

export type ShopReconcileResult = {
  shop: string;
  fetched: number;
  inserted: number;
  skipped: number;
  attributed: number;
  forwarded: number;
  error?: string;
};

async function latestClickReferralCode(
  storeId: string,
  before: Date,
): Promise<string | null> {
  const windowStart = new Date(before.getTime() - ATTRIBUTION_MS);
  const click = await prisma.click.findFirst({
    where: {
      storeId,
      status: "VALID",
      createdAt: { lte: before, gte: windowStart },
      referralCode: { not: "" },
    },
    orderBy: { createdAt: "desc" },
    select: { referralCode: true },
  });
  return click?.referralCode?.trim() || null;
}

async function forwardToLinkFlow(payload: {
  brandKey: string;
  productId: string;
  amount: number;
  orderId: string;
  productName: string | null;
  referralCode: string | null;
  processedAt: string;
  currency: string;
}): Promise<boolean> {
  const base = getLinkFlowApiUrl();
  if (!base) return false;
  const secret =
    process.env.RECONCILE_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const res = await fetch(`${base}/api/sales/reconcile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(secret
        ? {
            Authorization: `Bearer ${secret}`,
            "x-cron-secret": secret,
          }
        : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[reconcile] link-flow forward failed", {
      orderId: payload.orderId,
      status: res.status,
      body: text.slice(0, 300),
    });
    return false;
  }
  return true;
}

async function reconcileShop(storeRow: {
  id: string;
  shop: string;
  brandKey: string | null;
  lastReconciledAt: Date | null;
  scopes: string;
}): Promise<ShopReconcileResult> {
  const result: ShopReconcileResult = {
    shop: storeRow.shop,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    attributed: 0,
    forwarded: 0,
  };

  const startedAt = new Date();
  const lookbackFrom = storeRow.lastReconciledAt
    ? new Date(storeRow.lastReconciledAt.getTime() - OVERLAP_MS)
    : new Date(startedAt.getTime() - OVERLAP_MS);

  const { store, accessToken } = await getValidAccessToken(
    await prisma.store.findUniqueOrThrow({ where: { id: storeRow.id } }),
  );

  const orders = await fetchPaidOrdersSince({
    shop: store.shop,
    accessToken,
    updatedAtMin: lookbackFrom,
  });
  result.fetched = orders.length;

  for (const order of orders) {
    try {
      const existing = await prisma.sale.findUnique({
        where: {
          storeId_orderId: { storeId: store.id, orderId: order.id },
        },
        select: { id: true, referralCode: true },
      });

      let referralCode =
        extractReferralCodeFromOrder(order)?.trim() || null;
      if (!referralCode) {
        referralCode = await latestClickReferralCode(
          store.id,
          order.processedAt,
        );
        if (referralCode) result.attributed += 1;
      }

      if (existing) {
        result.skipped += 1;
      } else {
        const recorded = await recordStoreSale({
          shop: store.shop,
          amount: order.amount,
          orderId: order.id,
          productId: order.productId || "auto",
          productName: order.productName,
          referralCode,
          currency: order.currency,
          pageUrl: order.landingSite,
          source: "reconcile",
        });
        if (recorded.ok && !recorded.duplicate) {
          result.inserted += 1;
        } else {
          result.skipped += 1;
        }
      }

      if (store.brandKey?.trim()) {
        const forwarded = await forwardToLinkFlow({
          brandKey: store.brandKey.trim(),
          productId: order.productId || "auto",
          amount: order.amount,
          orderId: order.id,
          productName: order.productName,
          referralCode,
          processedAt: order.processedAt.toISOString(),
          currency: order.currency,
        });
        if (forwarded) result.forwarded += 1;
      }
    } catch (err) {
      console.error("[reconcile] order failed", {
        shop: store.shop,
        orderId: order.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { lastReconciledAt: startedAt },
  });

  return result;
}

function hasReadOrders(scopes: string): boolean {
  const list = scopes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Empty scopes on older rows — still try; Shopify will 401/403 if missing.
  if (list.length === 0) return true;
  return list.includes("read_orders");
}

export async function runOrderReconciliation(): Promise<{
  shops: number;
  fetched: number;
  inserted: number;
  skipped: number;
  attributed: number;
  forwarded: number;
  errors: number;
  results: ShopReconcileResult[];
}> {
  const stores = await prisma.store.findMany({
    where: {
      status: "ACTIVE",
      accessToken: { not: "" },
    },
    select: {
      id: true,
      shop: true,
      brandKey: true,
      lastReconciledAt: true,
      scopes: true,
    },
  });

  const results: ShopReconcileResult[] = [];
  let errors = 0;

  for (const store of stores) {
    if (!hasReadOrders(store.scopes)) {
      results.push({
        shop: store.shop,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        attributed: 0,
        forwarded: 0,
        error: "missing_read_orders_scope",
      });
      continue;
    }

    try {
      const shopResult = await reconcileShop(store);
      results.push(shopResult);
      console.info("[reconcile] shop complete", shopResult);
    } catch (err) {
      errors += 1;
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : String(err);
      console.error("[reconcile] shop failed", {
        shop: store.shop,
        status,
        error: message,
      });
      results.push({
        shop: store.shop,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        attributed: 0,
        forwarded: 0,
        error: message.slice(0, 300),
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => {
      acc.fetched += r.fetched;
      acc.inserted += r.inserted;
      acc.skipped += r.skipped;
      acc.attributed += r.attributed;
      acc.forwarded += r.forwarded;
      return acc;
    },
    { fetched: 0, inserted: 0, skipped: 0, attributed: 0, forwarded: 0 },
  );

  return {
    shops: stores.length,
    ...totals,
    errors,
    results,
  };
}