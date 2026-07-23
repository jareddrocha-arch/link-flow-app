import { prisma } from "@/lib/prisma";
import { getStoreByBrandKey, getStoreByShop } from "@/lib/stores";
import type { Store } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/client";

export type RecordSaleInput = {
  brandKey?: string | null;
  shop?: string | null;
  amount: number;
  orderId?: string | null;
  productId?: string | null;
  productName?: string | null;
  referralCode?: string | null;
  pageUrl?: string | null;
  currency?: string | null;
  source?: "script" | "webhook" | "pixel" | "manual";
};

export type RecordSaleResult =
  | {
      ok: true;
      duplicate: boolean;
      saleId: string;
      storeId: string;
      shop: string;
      commission: number;
      affiliateId: string | null;
    }
  | { ok: false; error: string; status: number };

async function resolveStore(input: RecordSaleInput): Promise<Store | null> {
  if (input.brandKey) {
    const byKey = await getStoreByBrandKey(input.brandKey);
    if (byKey) return byKey;
  }
  if (input.shop) {
    return getStoreByShop(input.shop);
  }
  return null;
}

/**
 * Persist a tracked sale for a Store (by brandKey or shop).
 * Attributes to Affiliate when referralCode matches an active affiliate.
 */
export async function recordStoreSale(
  input: RecordSaleInput,
): Promise<RecordSaleResult> {
  const store = await resolveStore(input);
  if (!store || store.status === "UNINSTALLED") {
    return {
      ok: false,
      error: "Unknown or inactive brand/store for tracking",
      status: 401,
    };
  }

  if (!(input.amount > 0)) {
    return { ok: false, error: "amount must be positive", status: 400 };
  }

  const orderId = input.orderId?.trim() || null;
  const productId =
    input.productId && input.productId !== "auto"
      ? String(input.productId).slice(0, 128)
      : null;
  const referralCode = input.referralCode?.trim() || null;

  if (orderId) {
    const existing = await prisma.sale.findUnique({
      where: {
        storeId_orderId: { storeId: store.id, orderId },
      },
    });
    if (existing) {
      return {
        ok: true,
        duplicate: true,
        saleId: existing.id,
        storeId: store.id,
        shop: store.shop,
        commission: Number(existing.commission),
        affiliateId: existing.affiliateId,
      };
    }
  }

  let affiliateId: string | null = null;
  let commissionRate = 0;

  if (referralCode) {
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        storeId: store.id,
        referralCode,
        status: "ACTIVE",
      },
    });
    if (affiliate) {
      affiliateId = affiliate.id;
      commissionRate = Number(affiliate.commissionRate);
    }
  }

  const commission =
    affiliateId && commissionRate > 0
      ? Math.round(input.amount * (commissionRate / 100) * 100) / 100
      : 0;

  const sale = await prisma.sale.create({
    data: {
      storeId: store.id,
      affiliateId,
      orderId: orderId ?? undefined,
      amount: new Decimal(input.amount.toFixed(2)),
      commission: new Decimal(commission.toFixed(2)),
      currency: (input.currency || "USD").slice(0, 3).toUpperCase(),
      status: "PENDING",
      productId: productId ?? undefined,
      productName: input.productName?.slice(0, 200) ?? undefined,
      referralCode: referralCode ?? undefined,
      pageUrl: input.pageUrl?.slice(0, 2000) ?? undefined,
    },
  });

  return {
    ok: true,
    duplicate: false,
    saleId: sale.id,
    storeId: store.id,
    shop: store.shop,
    commission,
    affiliateId,
  };
}
