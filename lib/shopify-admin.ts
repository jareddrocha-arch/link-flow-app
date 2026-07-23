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

// ── GraphQL (Web Pixel activation) ───────────────────────────────────────────

export async function shopifyAdminGraphql<T = unknown>(options: {
  shop: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const shop = options.shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": options.accessToken,
    },
    body: JSON.stringify({
      query: options.query,
      variables: options.variables ?? {},
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Shopify GraphQL failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const json = JSON.parse(text) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return json.data as T;
}

export type WebPixelResult = {
  id: string | null;
  settings: string | null;
  userErrors: Array<{ field?: string[]; message: string; code?: string }>;
};

/**
 * Create or update the app web pixel for this shop with brandKey + apiUrl settings.
 * Requires write_pixels + read_customer_events scopes and a deployed web_pixel extension.
 */
export async function ensureWebPixel(options: {
  shop: string;
  accessToken: string;
  brandKey: string;
  apiUrl: string;
  existingId?: string | null;
}): Promise<WebPixelResult> {
  const settings = JSON.stringify({
    brandKey: options.brandKey,
    apiUrl: options.apiUrl,
  });

  // Prefer update if we already stored an id
  if (options.existingId) {
    try {
      const data = await shopifyAdminGraphql<{
        webPixelUpdate: {
          webPixel: { id: string; settings: string } | null;
          userErrors: WebPixelResult["userErrors"];
        };
      }>({
        shop: options.shop,
        accessToken: options.accessToken,
        query: `
          mutation webPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
            webPixelUpdate(id: $id, webPixel: $webPixel) {
              webPixel { id settings }
              userErrors { field message code }
            }
          }
        `,
        variables: {
          id: options.existingId,
          webPixel: { settings },
        },
      });

      const payload = data.webPixelUpdate;
      if (payload.webPixel?.id) {
        return {
          id: payload.webPixel.id,
          settings: payload.webPixel.settings,
          userErrors: payload.userErrors ?? [],
        };
      }
      // fall through to create if update failed (e.g. pixel deleted)
    } catch {
      /* try create */
    }
  }

  const data = await shopifyAdminGraphql<{
    webPixelCreate: {
      webPixel: { id: string; settings: string } | null;
      userErrors: WebPixelResult["userErrors"];
    };
  }>({
    shop: options.shop,
    accessToken: options.accessToken,
    query: `
      mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          webPixel { id settings }
          userErrors { field message code }
        }
      }
    `,
    variables: {
      webPixel: { settings },
    },
  });

  const payload = data.webPixelCreate;
  return {
    id: payload.webPixel?.id ?? null,
    settings: payload.webPixel?.settings ?? null,
    userErrors: payload.userErrors ?? [],
  };
}

/**
 * Delete the app web pixel for a shop.
 * Often fails after app/uninstalled (token revoked); Shopify also removes app pixels on uninstall.
 */
export async function deleteWebPixel(options: {
  shop: string;
  accessToken: string;
  id: string;
}): Promise<{ deletedId: string | null; errors: string[] }> {
  const data = await shopifyAdminGraphql<{
    webPixelDelete: {
      deletedWebPixelId: string | null;
      userErrors: Array<{ message: string }>;
    };
  }>({
    shop: options.shop,
    accessToken: options.accessToken,
    query: `
      mutation webPixelDelete($id: ID!) {
        webPixelDelete(id: $id) {
          deletedWebPixelId
          userErrors { field message code }
        }
      }
    `,
    variables: { id: options.id },
  });

  const payload = data.webPixelDelete;
  return {
    deletedId: payload.deletedWebPixelId ?? null,
    errors: (payload.userErrors ?? []).map((e) => e.message),
  };
}


