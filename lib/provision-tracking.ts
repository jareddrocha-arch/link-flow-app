import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createScriptTag,
  createWebhook,
  deleteScriptTag,
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
  webhooks: string[];
  errors: string[];
};

/**
 * After OAuth install: inject storefront tracking ScriptTag + register webhooks.
 * Best-effort — failures are collected so install still succeeds.
 */
export async function provisionStoreTracking(
  store: Store,
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const webhooksRegistered: string[] = [];
  let scriptTagId: string | null = store.scriptTagId;
  let scriptSrc: string | null = null;

  if (!store.accessToken) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webhooks: [],
      errors: ["Missing access token"],
    };
  }

  if (!store.brandKey) {
    return {
      scriptTagId: null,
      scriptSrc: null,
      webhooks: [],
      errors: ["Missing brandKey"],
    };
  }

  // ── ScriptTag (storefront first-click + order status where supported) ─────
  try {
    scriptSrc = getTrackingScriptUrl({ brandKey: store.brandKey });
    const existing = await listScriptTags(store.shop, store.accessToken);

    // Remove prior Link Flow tags so reinstall doesn't stack duplicates
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

    // Primary: all scopes (online store + legacy order status page when available)
    const created = await createScriptTag({
      shop: store.shop,
      accessToken: store.accessToken,
      src: scriptSrc,
      displayScope: "all",
    });
    scriptTagId = String(created.id);

    // Extra order_status-only tag with ty=1 for stronger thank-you detection
    // (ignored on Checkout Extensibility; webhooks cover modern checkout)
    try {
      const tySrc = getTrackingScriptUrl({
        brandKey: store.brandKey,
        thankYou: true,
      });
      await createScriptTag({
        shop: store.shop,
        accessToken: store.accessToken,
        src: tySrc,
        displayScope: "order_status",
      });
    } catch (e) {
      // order_status may be unavailable on some shops — non-fatal
      errors.push(
        `order_status script_tag: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } catch (e) {
    errors.push(
      `script_tag: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── Webhooks (reliable order attribution backup) ─────────────────────────
  const webhookAddress = getWebhookCallbackUrl("/api/webhooks/shopify");
  const topics = ["orders/paid", "orders/create", "app/uninstalled"] as const;

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
      webhooksInstalledAt:
        webhooksRegistered.length > 0 ? now : undefined,
    },
  });

  return {
    scriptTagId,
    scriptSrc,
    webhooks: webhooksRegistered,
    errors,
  };
}
