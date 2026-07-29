import { prisma } from "@/lib/prisma";
import { normalizeShop } from "@/lib/stores";
import { cleanupShopUninstall } from "@/lib/uninstall";

type CompliancePayload = {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
  orders_requested?: Array<number | string>;
  orders_to_redact?: Array<number | string>;
  customer_id?: number | string;
  data_request?: {
    id?: number | string;
  };
};

async function logComplianceEvent(
  type: string,
  shop: string,
  detail: unknown,
): Promise<void> {
  try {
    await prisma.appEvent.create({
      data: {
        shop,
        type,
        detail: detail as object,
      },
    });
  } catch (e) {
    console.error("[compliance] AppEvent log failed", e);
  }
}

/**
 * Shopify mandatory compliance webhooks.
 * We do not store customer name/email/address/phone — handlers log and
 * acknowledge, and shop/redact purges store-linked data.
 */
export async function handleComplianceWebhook(options: {
  topic: string;
  shopDomain: string;
  payload: unknown;
}): Promise<{ ok: boolean; detail: string }> {
  const topic = options.topic.toLowerCase();
  const body = (options.payload || {}) as CompliancePayload;
  const shop =
    normalizeShop(options.shopDomain) ||
    normalizeShop(body.shop_domain || "") ||
    options.shopDomain;

  if (topic === "customers/data_request") {
    // We only store order/referral aggregates, not customer PII.
    const detail = {
      shop,
      customerId: body.customer?.id ?? body.customer_id ?? null,
      ordersRequested: body.orders_requested ?? [],
      note: "No customer name, email, address, or phone is stored by Link Flow. Order IDs and amounts may exist without customer identity fields.",
    };
    await logComplianceEvent("CUSTOMERS_DATA_REQUEST", shop, detail);
    console.info("[compliance] customers/data_request", detail);
    return {
      ok: true,
      detail:
        "acknowledged_data_request_no_customer_pii",
    };
  }

  if (topic === "customers/redact") {
    // We store no customer contact PII. If Shopify lists order IDs to redact,
    // remove matching sale rows for this shop so order linkage is gone too.
    const ordersToRedact = (body.orders_to_redact ?? []).map(String).filter(Boolean);
    let salesRedacted = 0;
    if (ordersToRedact.length > 0) {
      try {
        const store = await prisma.store.findUnique({ where: { shop } });
        if (store) {
          const result = await prisma.sale.deleteMany({
            where: {
              storeId: store.id,
              orderId: { in: ordersToRedact },
            },
          });
          salesRedacted = result.count;
        }
      } catch (e) {
        console.error("[compliance] customers/redact sale cleanup failed", e);
      }
    }

    const detail = {
      shop,
      customerId: body.customer?.id ?? body.customer_id ?? null,
      ordersToRedact,
      salesRedacted,
      note: "No customer name/email/address/phone stored. Matching order-id sale rows redacted when provided.",
    };
    await logComplianceEvent("CUSTOMERS_REDACT", shop, detail);
    console.info("[compliance] customers/redact", detail);
    return {
      ok: true,
      detail: `acknowledged_customer_redact_sales=${salesRedacted}`,
    };
  }

  if (topic === "shop/redact") {
    // 48h after uninstall — purge remaining store data we hold
    const detailBase = {
      shop,
      shopId: body.shop_id ?? null,
    };

    // Best-effort full cleanup + hard delete of store row (cascades children)
    try {
      await cleanupShopUninstall(shop, { payload: body });
    } catch (e) {
      console.error("[compliance] shop/redact cleanup failed", e);
    }

    try {
      const store = await prisma.store.findUnique({ where: { shop } });
      if (store) {
        await prisma.store.delete({ where: { id: store.id } });
      }
    } catch (e) {
      // May already be gone
      console.warn("[compliance] shop/redact store delete", e);
    }

    await logComplianceEvent("SHOP_REDACT", shop, {
      ...detailBase,
      purged: true,
    });
    console.info("[compliance] shop/redact complete", detailBase);
    return { ok: true, detail: "shop_data_purged" };
  }

  return { ok: true, detail: `ignored_compliance_topic_${topic}` };
}
