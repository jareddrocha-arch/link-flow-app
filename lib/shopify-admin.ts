/**
 * Minimal Shopify Admin REST helpers (offline access token).
 */

export const SHOPIFY_API_VERSION =
  process.env.SHOPIFY_API_VERSION?.trim() || "2026-04";

export type ShopifyAdminError = {
  status: number;
  body: string;
};

export async function shopifyAdminRequest<T = unknown>(options: {
  shop: string;
  accessToken: string;
  path: string;
  method?: string;
  body?: unknown;
}): Promise<T> {
  const shop = options.shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path}`;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": options.accessToken,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(
      `Shopify Admin ${options.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 300)}`,
    ) as Error & ShopifyAdminError;
    err.status = res.status;
    err.body = text;
    throw err;
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type ScriptTag = {
  id: number;
  src: string;
  event: string;
  display_scope: string;
};

export async function listScriptTags(
  shop: string,
  accessToken: string,
): Promise<ScriptTag[]> {
  const data = await shopifyAdminRequest<{ script_tags: ScriptTag[] }>({
    shop,
    accessToken,
    path: "/script_tags.json",
  });
  return data.script_tags ?? [];
}

export async function createScriptTag(options: {
  shop: string;
  accessToken: string;
  src: string;
  displayScope?: "online_store" | "order_status" | "all";
}): Promise<ScriptTag> {
  const data = await shopifyAdminRequest<{ script_tag: ScriptTag }>({
    shop: options.shop,
    accessToken: options.accessToken,
    method: "POST",
    path: "/script_tags.json",
    body: {
      script_tag: {
        event: "onload",
        src: options.src,
        display_scope: options.displayScope ?? "all",
      },
    },
  });
  return data.script_tag;
}

export async function deleteScriptTag(
  shop: string,
  accessToken: string,
  id: number | string,
): Promise<void> {
  await shopifyAdminRequest({
    shop,
    accessToken,
    method: "DELETE",
    path: `/script_tags/${id}.json`,
  });
}

export type Webhook = {
  id: number;
  address: string;
  topic: string;
  format: string;
};

export async function listWebhooks(
  shop: string,
  accessToken: string,
): Promise<Webhook[]> {
  const data = await shopifyAdminRequest<{ webhooks: Webhook[] }>({
    shop,
    accessToken,
    path: "/webhooks.json",
  });
  return data.webhooks ?? [];
}

export async function createWebhook(options: {
  shop: string;
  accessToken: string;
  topic: string;
  address: string;
}): Promise<Webhook> {
  const data = await shopifyAdminRequest<{ webhook: Webhook }>({
    shop: options.shop,
    accessToken: options.accessToken,
    method: "POST",
    path: "/webhooks.json",
    body: {
      webhook: {
        topic: options.topic,
        address: options.address,
        format: "json",
      },
    },
  });
  return data.webhook;
}
