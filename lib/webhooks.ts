import { createHmac, timingSafeEqual } from "crypto";
import { recordStoreSale } from "@/lib/record-sale";
import { normalizeShop } from "@/lib/stores";
import { cleanupShopUninstall } from "@/lib/uninstall";

export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
): boolean {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type ShopifyOrderWebhook = {
  id?: number | string;
  name?: string;
  order_number?: number | string;
  total_price?: string | number;
  currency?: string;
  line_items?: Array<{
    product_id?: number | string;
    title?: string;
    name?: string;
  }>;
  note_attributes?: Array<{ name?: string; value?: string }>;
  landing_site?: string;
  referring_site?: string;
};

function moneyToNumber(raw: string | number | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractReferralCode(order: ShopifyOrderWebhook): string | null {
  const attrs = order.note_attributes || [];
  for (const a of attrs) {
    const name = (a.name || "").toLowerCase();
    if (name === "fa_ref" || name === "referral" || name === "ref") {
      return a.value?.trim() || null;
    }
  }
  // landing_site may include ?fa_ref=
  const landing = order.landing_site || "";
  try {
    const q = landing.includes("?")
      ? new URL(landing, "https://example.com").searchParams
      : new URLSearchParams(landing.startsWith("?") ? landing : `?${landing}`);
    return q.get("fa_ref") || q.get("ref");
  } catch {
    return null;
  }
}

export async function handleShopifyWebhook(options: {
  topic: string;
  shopDomain: string;
  payload: unknown;
}): Promise<{ ok: boolean; detail?: string }> {
  const shop = normalizeShop(options.shopDomain);
  if (!shop) return { ok: false, detail: "invalid shop" };

  const topic = options.topic.toLowerCase();

  if (topic === "app/uninstalled") {
    const result = await cleanupShopUninstall(shop, {
      payload: options.payload,
    });
    return {
      ok: true,
      detail: [
        "uninstall_cleanup",
        `scriptTags=${result.scriptTagsDeleted.length}`,
        `webPixel=${result.webPixelDeleted}`,
        `db=${result.dbCleaned}`,
        `api=${result.shopifyApiReachable}`,
        result.errors.length ? `errors=${result.errors.length}` : "ok",
      ].join(" "),
    };
  }

  if (topic === "orders/paid" || topic === "orders/create") {
    const order = options.payload as ShopifyOrderWebhook;
    const amount = moneyToNumber(order.total_price);
    if (!amount) {
      return { ok: true, detail: "ignored order without total" };
    }

    const orderId =
      order.id != null
        ? String(order.id)
        : order.order_number != null
          ? String(order.order_number)
          : order.name != null
            ? String(order.name)
            : null;

    const first = order.line_items?.[0];
    const referralCode = extractReferralCode(order);

    const result = await recordStoreSale({
      shop,
      amount,
      orderId,
      productId: first?.product_id != null ? String(first.product_id) : "auto",
      productName: first?.title || first?.name || null,
      referralCode,
      currency: order.currency || "USD",
      source: "webhook",
      pageUrl: order.landing_site || null,
    });

    if (!result.ok) {
      return { ok: false, detail: result.error };
    }

    return {
      ok: true,
      detail: result.duplicate
        ? `duplicate sale ${result.saleId}`
        : `sale ${result.saleId}`,
    };
  }

  return { ok: true, detail: `ignored topic ${topic}` };
}
