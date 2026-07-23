import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAppUrl } from "@/lib/shopify";
import {
  createScriptTag,
  createWebhook,
  deleteScriptTag,
  ensureWebPixel,
  listScriptTags,
  listWebhooks,
} from "@/lib/shopify-admin";
import {
  getTrackingScriptUrl,
  getWebhookCallbackUrl,
  isLinkFlowScriptSrc,
} from "@/lib/tracking-url";

export type ProvisionResult = {
  scriptTagId: string | null;
  scriptSrc: string | null;
  webPixelId: string | null;
  webhooks: string[];
  errors: string[];
};

function salesTrackApiUrl(): string {
  return `${resolveAppUrl()}/api/sales/track`;
}

/**
 * After OAuth install:
 * 1. ScriptTag (storefront first-click)
 * 2. Web Pixel (thank-you / checkout_completed — every order)
 * 3. Webhooks (orders + uninstall backup)
 */
export async function provisionStoreTracking(
  store: Store,
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const webhooksRegistered: string[] = [];
  let scriptTagId: string | null = store.scriptTagId;
  let scriptSrc: string | null = null;
  let webPixelId: string | null = store.webPixelId;

  if (!store.accessToken) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webPixelId: null,
      webhooks: [],
      errors: ["Missing access token"],
    };
  }

  if (!store.brandKey) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webPixelId: null,
      webhooks: [],
      errors: ["Missing brandKey"],
    };
  }

  // ── ScriptTag (storefront first-click) ────────────────────────────────────
  try {
    scriptSrc = getTrackingScriptUrl({ brandKey: store.brandKey });
    const existing = await listScriptTags(store.shop, store.accessToken);

    for (const tag of existing) {
      if (isLinkFlowScriptSrc(tag.src)) {
        try {
          await deleteScriptTag(store.shop, store.accessToken, tag.id);
        } catch (e) {
          errors.push(
            `delete script_tag ${tag.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    const created = await createScriptTag({
      shop: store.shop,
      accessToken: store.accessToken,
      src: scriptSrc,
      displayScope: "online_store",
    });
    scriptTagId = String(created.id);
  } catch (e) {
    errors.push(`script_tag: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Web Pixel (checkout_completed — every sale) ───────────────────────────
  try {
    const pixel = await ensureWebPixel({
      shop: store.shop,
      accessToken: store.accessToken,
      brandKey: store.brandKey,
      apiUrl: salesTrackApiUrl(),
      existingId: store.webPixelId,
    });

    if (pixel.userErrors?.length) {
      errors.push(
        `web_pixel: ${pixel.userErrors.map((u) => u.message).join("; ")}`,
      );
    }
    if (pixel.id) {
      webPixelId = pixel.id;
    } else if (!pixel.userErrors?.length) {
      errors.push("web_pixel: no id returned (deploy extension + scopes?)");
    }
  } catch (e) {
    errors.push(
      `web_pixel: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Webhooks (server-side order backup) ───────────────────────────────────
  const webhookAddress = getWebhookCallbackUrl("/api/webhooks/shopify");
  // Orders + uninstall + Shopify mandatory privacy compliance topics
  const topics = [
    "orders/paid",
    "orders/create",
    "app/uninstalled",
    "customers/data_request",
    "customers/redact",
    "shop/redact",
  ] as const;

  try {
    const existingHooks = await listWebhooks(store.shop, store.accessToken);
    for (const topic of topics) {
      const already = existingHooks.find(
        (h) => h.topic === topic && h.address === webhookAddress,
      );
      if (already) {
        webhooksRegistered.push(topic);
        continue;
      }
      try {
        await createWebhook({
          shop: store.shop,
          accessToken: store.accessToken,
          topic,
          address: webhookAddress,
        });
        webhooksRegistered.push(topic);
      } catch (e) {
        errors.push(
          `webhook ${topic}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } catch (e) {
    errors.push(`list webhooks: ${e instanceof Error ? e.message : String(e)}`);
  }

  const now = new Date();
  await prisma.store.update({
    where: { id: store.id },
    data: {
      scriptTagId: scriptTagId ?? undefined,
      trackingInstalledAt: scriptTagId ? now : undefined,
      webPixelId: webPixelId ?? undefined,
      webPixelInstalledAt: webPixelId ? now : undefined,
      webhooksInstalledAt:
        webhooksRegistered.length > 0 ? now : undefined,
    },
  });

  return {
    scriptTagId,
    scriptSrc,
    webPixelId,
    webhooks: webhooksRegistered,
    errors,
  };
}
