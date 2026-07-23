import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deleteScriptTag,
  deleteWebPixel,
  listScriptTags,
} from "@/lib/shopify-admin";
import { isLinkFlowScriptSrc } from "@/lib/tracking-url";
import { getStoreByShop, normalizeShop } from "@/lib/stores";

export type UninstallCleanupResult = {
  shop: string;
  storeId: string | null;
  scriptTagsDeleted: string[];
  webPixelDeleted: boolean;
  shopifyApiReachable: boolean;
  dbCleaned: boolean;
  brandKeyCleared: boolean;
  errors: string[];
  notes: string[];
};

/**
 * Full uninstall cleanup for a shop.
 *
 * Order matters:
 * 1. Load store + access token from DB while still available
 * 2. Best-effort delete ScriptTags + Web Pixel via Admin API
 *    (often fails after app/uninstalled — token is already revoked;
 *     Shopify also auto-removes app ScriptTags/webhooks/pixels on uninstall)
 * 3. Clear credentials, tracking IDs, and mark store UNINSTALLED
 * 4. Persist an audit log row
 */
export async function cleanupShopUninstall(
  shopDomain: string,
  options?: { payload?: unknown },
): Promise<UninstallCleanupResult> {
  const shop = normalizeShop(shopDomain) ?? shopDomain.toLowerCase();
  const errors: string[] = [];
  const notes: string[] = [];
  const scriptTagsDeleted: string[] = [];
  let webPixelDeleted = false;
  let shopifyApiReachable = false;
  let dbCleaned = false;
  let brandKeyCleared = false;
  let storeId: string | null = null;

  const store = await getStoreByShop(shop);

  if (!store) {
    notes.push("No Store row found — logging uninstall only");
    await logUninstallEvent({
      shop,
      storeId: null,
      detail: {
        note: "store_not_found",
        payload: options?.payload ?? null,
      },
    });
    console.info("[uninstall]", {
      shop,
      result: "no_store_row",
    });
    return {
      shop,
      storeId: null,
      scriptTagsDeleted,
      webPixelDeleted: false,
      shopifyApiReachable: false,
      dbCleaned: false,
      brandKeyCleared: false,
      errors,
      notes,
    };
  }

  storeId = store.id;
  const accessToken = store.accessToken?.trim() || "";

  // ── 1) Best-effort Shopify resource cleanup ──────────────────────────────
  if (accessToken) {
    // Script tags: known id + any Link Flow src matches
    try {
      const tags = await listScriptTags(store.shop, accessToken);
      shopifyApiReachable = true;

      const ids = new Set<number>();
      if (store.scriptTagId) {
        const n = Number(store.scriptTagId);
        if (Number.isFinite(n)) ids.add(n);
      }
      for (const tag of tags) {
        if (isLinkFlowScriptSrc(tag.src) || ids.has(tag.id)) {
          ids.add(tag.id);
        }
      }

      for (const id of ids) {
        try {
          await deleteScriptTag(store.shop, accessToken, id);
          scriptTagsDeleted.push(String(id));
        } catch (e) {
          errors.push(
            `script_tag ${id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (ids.size === 0) {
        notes.push("No Link Flow ScriptTags found on shop");
      }
    } catch (e) {
      // Token often already revoked on app/uninstalled
      shopifyApiReachable = false;
      notes.push(
        `ScriptTag cleanup skipped (Admin API unreachable — expected after uninstall): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      notes.push(
        "Shopify auto-deletes app ScriptTags when the app is uninstalled",
      );
    }

    // Web pixel
    if (store.webPixelId && shopifyApiReachable) {
      try {
        const result = await deleteWebPixel({
          shop: store.shop,
          accessToken,
          id: store.webPixelId,
        });
        if (result.deletedId) {
          webPixelDeleted = true;
        }
        if (result.errors.length) {
          errors.push(`web_pixel: ${result.errors.join("; ")}`);
        } else if (!result.deletedId) {
          notes.push("web_pixel delete returned no id (may already be gone)");
        }
      } catch (e) {
        errors.push(
          `web_pixel delete: ${e instanceof Error ? e.message : String(e)}`,
        );
        notes.push(
          "Shopify disconnects app web pixels when the app is uninstalled",
        );
      }
    } else if (store.webPixelId && !shopifyApiReachable) {
      notes.push(
        "Web Pixel cleanup skipped (token revoked); Shopify removes app pixels on uninstall",
      );
    }
  } else {
    notes.push("No access token on file — skipped Shopify Admin cleanup");
    notes.push(
      "Shopify still removes app ScriptTags, webhooks, and app pixels on uninstall",
    );
  }

  // ── 2) Database cleanup (credentials + tracking session state) ───────────
  try {
    await cleanupStoreDatabase(store);
    dbCleaned = true;
    brandKeyCleared = true;
  } catch (e) {
    errors.push(
      `db cleanup: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── 3) Audit log ─────────────────────────────────────────────────────────
  const detail = {
    scriptTagsDeleted,
    webPixelDeleted,
    webPixelId: store.webPixelId,
    scriptTagId: store.scriptTagId,
    brandKey: store.brandKey,
    shopifyApiReachable,
    dbCleaned,
    errors,
    notes,
    payload: options?.payload ?? null,
  };

  await logUninstallEvent({
    shop: store.shop,
    storeId: store.id,
    detail,
  });

  console.info("[uninstall] complete", {
    shop: store.shop,
    storeId: store.id,
    scriptTagsDeleted,
    webPixelDeleted,
    shopifyApiReachable,
    dbCleaned,
    errorCount: errors.length,
  });

  return {
    shop: store.shop,
    storeId,
    scriptTagsDeleted,
    webPixelDeleted,
    shopifyApiReachable,
    dbCleaned,
    brandKeyCleared,
    errors,
    notes,
  };
}

/**
 * Wipe sensitive session data and mark store uninstalled.
 * Keeps historical sales/affiliates for reinstall reporting (cascade-safe).
 * Clears brandKey so tracking keys cannot be reused against a dead install.
 */
async function cleanupStoreDatabase(store: Store): Promise<void> {
  await prisma.store.update({
    where: { id: store.id },
    data: {
      status: "UNINSTALLED",
      uninstalledAt: new Date(),
      // Destroy offline session / secrets
      accessToken: "",
      scopes: "",
      // Clear tracking installation markers
      scriptTagId: null,
      trackingInstalledAt: null,
      webhooksInstalledAt: null,
      webPixelId: null,
      webPixelInstalledAt: null,
      // Invalidate brand key so scripts/webhooks cannot attribute to this install
      brandKey: null,
    },
  });
}

async function logUninstallEvent(options: {
  shop: string;
  storeId: string | null;
  detail: unknown;
}): Promise<void> {
  try {
    await prisma.appEvent.create({
      data: {
        shop: options.shop,
        storeId: options.storeId,
        type: "APP_UNINSTALLED",
        detail: options.detail as object,
      },
    });
  } catch (e) {
    // Table may not exist yet if migrate not run — never fail webhook
    console.error("[uninstall] failed to write AppEvent log", e);
  }
}
