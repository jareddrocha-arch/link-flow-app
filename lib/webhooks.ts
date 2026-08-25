import { createHmac, timingSafeEqual } from "crypto";
import { handleComplianceWebhook } from "@/lib/compliance";
import { recordStoreSale } from "@/lib/record-sale";
import { orderedShopifyCredentials } from "@/lib/shopify-credentials";
import { normalizeShop } from "@/lib/stores";
import { cleanupShopUninstall } from "@/lib/uninstall";

/**
 * Verify Shopify webhook HMAC (X-Shopify-Hmac-SHA256).
 *
 * Must use the **raw request body bytes** (not re-serialized JSON) and the
 * app Client secret (SHOPIFY_API_SECRET). Digest is base64 HMAC-SHA256.
 *
 * App Store automated check: invalid → false (caller returns 401);
 * valid → true (caller returns 200).
 */
function hmacEqualsBase64(digest: string, hmac: string): boolean {
  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(hmac, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyShopifyWebhookHmac(
  rawBody: string | Buffer,
  hmacHeader: string | null | undefined,
  options?: { shop?: string | null },
): boolean {
  const hmac = typeof hmacHeader === "string" ? hmacHeader.trim() : "";
  if (!hmac) return false;

  let candidates;
  try {
    candidates = orderedShopifyCredentials({ shop: options?.shop });
  } catch {
    console.error(
      "[webhook] SHOPIFY_API_SECRET is missing — cannot verify HMAC",
    );
    return false;
  }
  if (candidates.length === 0) {
    console.error(
      "[webhook] SHOPIFY_API_SECRET is missing — cannot verify HMAC",
    );
    return false;
  }

  // Exact body bytes Shopify signed (Buffer preserves wire encoding)
  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody, "utf8");

  // Preferred secret first (shop match / default), then other app secrets
  for (const creds of candidates) {
    const digest = createHmac("sha256", creds.apiSecret)
      .update(bodyBuf)
      .digest("base64");
    if (hmacEqualsBase64(digest, hmac)) return true;
  }
  return false;
}

/**
 * Optional binary-safe compare (decoded base64 hash bytes).
 * Used in tests / if header ever differs in padding presentation.
 */
export function verifyShopifyWebhookHmacBinary(
  rawBody: string | Buffer,
  hmacHeader: string | null | undefined,
  options?: { shop?: string | null },
): boolean {
  const hmac = typeof hmacHeader === "string" ? hmacHeader.trim() : "";
  if (!hmac) return false;

  let candidates;
  try {
    candidates = orderedShopifyCredentials({ shop: options?.shop });
  } catch {
    return false;
  }

  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody, "utf8");

  let received: Buffer;
  try {
    received = Buffer.from(hmac, "base64");
  } catch {
    return false;
  }
  if (received.length === 0) return false;

  for (const creds of candidates) {
    const computed = createHmac("sha256", creds.apiSecret)
      .update(bodyBuf)
      .digest();
    if (computed.length !== received.length) continue;
    try {
      if (timingSafeEqual(computed, received)) return true;
    } catch {
      /* try next secret */
    }
  }
  return false;
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

  // Mandatory GDPR / privacy compliance webhooks
  if (
    topic === "customers/data_request" ||
    topic === "customers/redact" ||
    topic === "shop/redact"
  ) {
    return handleComplianceWebhook({
      topic,
      shopDomain: shop,
      payload: options.payload,
    });
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
