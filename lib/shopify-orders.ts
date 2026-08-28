import { SHOPIFY_API_VERSION } from "@/lib/shopify-admin";

export type ShopifyPaidOrder = {
  id: string;
  orderNumber: string | null;
  amount: number;
  currency: string;
  processedAt: Date;
  updatedAt: Date;
  productId: string | null;
  productName: string | null;
  landingSite: string | null;
  noteAttributes: Array<{ name?: string; value?: string }>;
  financialStatus: string | null;
};

const ORDER_FIELDS = [
  "id",
  "order_number",
  "name",
  "total_price",
  "currency",
  "processed_at",
  "created_at",
  "updated_at",
  "financial_status",
  "landing_site",
  "note_attributes",
  "line_items",
].join(",");

function moneyToNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    if (!part.includes('rel="next"')) continue;
    const m = part.match(/<([^>]+)>/);
    if (m?.[1]) return m[1];
  }
  return null;
}

function mapOrder(raw: Record<string, unknown>): ShopifyPaidOrder | null {
  const amount = moneyToNumber(raw.total_price);
  if (!amount) return null;
  const financial = String(raw.financial_status || "").toLowerCase();
  if (financial && financial !== "paid" && financial !== "partially_paid") {
    return null;
  }

  const id = raw.id != null ? String(raw.id) : null;
  if (!id) return null;

  const items = Array.isArray(raw.line_items) ? raw.line_items : [];
  const first = (items[0] ?? {}) as Record<string, unknown>;
  const processed =
    (typeof raw.processed_at === "string" && raw.processed_at) ||
    (typeof raw.created_at === "string" && raw.created_at) ||
    new Date().toISOString();
  const updated =
    (typeof raw.updated_at === "string" && raw.updated_at) || processed;

  const notes = Array.isArray(raw.note_attributes) ? raw.note_attributes : [];

  return {
    id,
    orderNumber:
      raw.order_number != null
        ? String(raw.order_number)
        : raw.name != null
          ? String(raw.name)
          : null,
    amount,
    currency: String(raw.currency || "USD").slice(0, 3).toUpperCase(),
    processedAt: new Date(processed),
    updatedAt: new Date(updated),
    productId: first.product_id != null ? String(first.product_id) : null,
    productName:
      (typeof first.title === "string" && first.title) ||
      (typeof first.name === "string" && first.name) ||
      null,
    landingSite: typeof raw.landing_site === "string" ? raw.landing_site : null,
    noteAttributes: notes as Array<{ name?: string; value?: string }>,
    financialStatus: raw.financial_status ? String(raw.financial_status) : null,
  };
}

/**
 * Paid orders updated since `updatedAtMin`, paginated. Caps pages to keep API use low.
 */
export async function fetchPaidOrdersSince(options: {
  shop: string;
  accessToken: string;
  updatedAtMin: Date;
  maxPages?: number;
}): Promise<ShopifyPaidOrder[]> {
  const shop = options.shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const maxPages = options.maxPages ?? 8;
  const orders: ShopifyPaidOrder[] = [];

  const params = new URLSearchParams({
    status: "any",
    financial_status: "paid",
    limit: "250",
    fields: ORDER_FIELDS,
    updated_at_min: options.updatedAtMin.toISOString(),
  });

  let nextUrl: string | null =
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json?${params.toString()}`;
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    pages += 1;
    const res = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Shopify-Access-Token": options.accessToken,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(
        `Shopify orders fetch failed (${res.status}): ${text.slice(0, 300)}`,
      ) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    const json = text ? (JSON.parse(text) as { orders?: unknown[] }) : {};
    for (const raw of json.orders ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const mapped = mapOrder(raw as Record<string, unknown>);
      if (mapped) orders.push(mapped);
    }
    nextUrl = parseNextLink(res.headers.get("link") || res.headers.get("Link"));
  }

  return orders;
}

export function extractReferralCodeFromOrder(order: {
  landingSite: string | null;
  noteAttributes: Array<{ name?: string; value?: string }>;
}): string | null {
  for (const a of order.noteAttributes || []) {
    const name = (a.name || "").toLowerCase();
    if (name === "fa_ref" || name === "referral" || name === "ref") {
      return a.value?.trim() || null;
    }
  }
  const landing = order.landingSite || "";
  try {
    const q = landing.includes("?")
      ? new URL(landing, "https://example.com").searchParams
      : new URLSearchParams(landing.startsWith("?") ? landing : `?${landing}`);
    return q.get("fa_ref") || q.get("ref");
  } catch {
    return null;
  }
}
