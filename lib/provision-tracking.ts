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
import { getValidAccessToken } from "@/lib/shopify-tokens";
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
  scopes: string | null;
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
  let accessToken = store.accessToken;
  let workingStore = store;

  if (!store.accessToken) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webPixelId: null,
      webhooks: [],
      errors: ["Missing access token"],
      scopes: store.scopes || null,
    };
  }

  if (!store.brandKey) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webPixelId: null,
      webhooks: [],
      errors: ["Missing brandKey"],
      scopes: store.scopes || null,
    };
  }

  // Ensure expiring offline token (Shopify rejects non-expiring Admin API tokens)
  try {
    const valid = await getValidAccessToken(store);
    accessToken = valid.accessToken;
    workingStore = valid.store;
  } catch (e) {
    return {
      scriptTagId: scriptTagId,
      scriptSrc: null,
      webPixelId: webPixelId,
      webhooks: [],
      errors: [
        e instanceof Error
          ? e.message
          : "Invalid Shopify access token — reinstall the app",
      ],
      scopes: store.scopes || null,
    };
  }

  const scopes = workingStore.scopes || "";
  if (!scopes.includes("write_pixels")) {
    errors.push(
      "Missing write_pixels scope — add it in Partner app scopes + Vercel SCOPES, redeploy, uninstall/reinstall",
    );
  }
  if (!scopes.includes("read_customer_events")) {
    errors.push(
      "Missing read_customer_events scope — required for Web Pixel. Add it in Shopify Dev Dashboard scopes, release a new app version, then uninstall/reinstall so Shopify shows the new permission.",
    );
  }

  // ── ScriptTag (storefront first-click) ────────────────────────────────────
  try {
    scriptSrc = getTrackingScriptUrl({ brandKey: store.brandKey });
    const existing = await listScriptTags(store.shop, accessToken);

    for (const tag of existing) {
      if (isLinkFlowScriptSrc(tag.src)) {
        try {
          await deleteScriptTag(store.shop, accessToken, tag.id);
        } catch (e) {
          errors.push(
            `delete script_tag ${tag.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    const created = await createScriptTag({
      shop: store.shop,
      accessToken,
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
      accessToken,
      brandKey: store.brandKey,
      apiUrl: salesTrackApiUrl(),
      existingId: workingStore.webPixelId,
    });

    if (pixel.userErrors?.length) {
      errors.push(
        `web_pixel: ${pixel.userErrors.map((u) => u.message).join("; ")}`,
      );
    }
    if (pixel.id) {
      webPixelId = pixel.id;
    } else if (!pixel.userErrors?.length) {
      errors.push(
        "web_pixel: no id returned — deploy the web pixel extension (shopify app deploy) and ensure write_pixels scope",
      );
    }
  } catch (e) {
    errors.push(
      `web_pixel: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  // - app/uninstalled: always register via Admin API
  // - orders/*: require Protected Customer Data approval in Partner Dashboard;
  //   optional backup (Web Pixel is primary for thank-you sales)
  // - customers/* + shop/redact: compliance topics — register only via
  //   shopify.app.toml / shopify app deploy (REST returns 404)
  const webhookAddress = getWebhookCallbackUrl("/api/webhooks/shopify");
  const coreTopics = ["app/uninstalled"] as const;
  const orderTopics = ["orders/paid", "orders/create"] as const;

  try {
    const existingHooks = await listWebhooks(store.shop, accessToken);

    for (const topic of coreTopics) {
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
          accessToken,
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

    for (const topic of orderTopics) {
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
          accessToken,
          topic,
          address: webhookAddress,
        });
        webhooksRegistered.push(topic);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // One clear note instead of two noisy PCD errors
        if (/protected customer data/i.test(msg)) {
          if (!errors.some((x) => x.includes("Protected Customer Data"))) {
            errors.push(
              "Order webhooks (orders/paid, orders/create) need Protected Customer Data access in the Partner Dashboard (App → API access → Protected customer data). Web Pixel can still track thank-you sales without these.",
            );
          }
        } else {
          errors.push(`webhook ${topic}: ${msg}`);
        }
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
    scopes: workingStore.scopes || scopes || null,
  };
}
