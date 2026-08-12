/**
 * Call the main Link Flow platform to create/login a Brand and obtain brandKey.
 */

import { getLinkFlowApiUrl } from "@/lib/link-flow-api";

export type BrandConnectMode = "signup" | "login";

export type BrandConnectResult =
  | {
      ok: true;
      brandKey: string;
      brandName: string;
      brandId: string;
      mode: BrandConnectMode;
    }
  | { ok: false; error: string; code?: string; status: number };

export async function connectBrandOnLinkFlow(options: {
  mode: BrandConnectMode;
  email: string;
  password: string;
  brandName?: string;
  shop?: string;
}): Promise<BrandConnectResult> {
  const base = getLinkFlowApiUrl();
  if (!base) {
    return {
      ok: false,
      error:
        "Link Flow platform URL is not configured (LINK_FLOW_API_URL / LINK_FLOW_FORWARD).",
      code: "not_configured",
      status: 503,
    };
  }

  const secret = process.env.LINK_FLOW_SHOPIFY_BRIDGE_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      error:
        "Server missing LINK_FLOW_SHOPIFY_BRIDGE_SECRET — cannot connect brand accounts.",
      code: "not_configured",
      status: 503,
    };
  }

  const url = `${base}/api/shopify/brand-connect`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Link-Flow-Bridge-Secret": secret,
      },
      body: JSON.stringify({
        mode: options.mode,
        email: options.email.trim().toLowerCase(),
        password: options.password,
        brandName: options.brandName?.trim() || undefined,
        shop: options.shop || undefined,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      brandKey?: string;
      brandName?: string;
      brandId?: string;
      mode?: string;
      error?: string;
      code?: string;
    };

    if (!res.ok || !body.ok || !body.brandKey) {
      return {
        ok: false,
        error: body.error || `Brand connect failed (${res.status})`,
        code: body.code,
        status: res.status,
      };
    }

    return {
      ok: true,
      brandKey: body.brandKey,
      brandName: body.brandName || options.brandName || options.email,
      brandId: body.brandId || "",
      mode: options.mode,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message.slice(0, 160)
          : "Could not reach Link Flow platform",
      code: "network_error",
      status: 502,
    };
  }
}

/**
 * Server-side only: resolve platform dashboard URL for non-UI integrations.
 * Do not surface this URL in the embedded Shopify app UI (App Store review).
 */
export function getLinkFlowBrandDashboardUrl(): string | null {
  const base =
    process.env.LINK_FLOW_DASHBOARD_URL?.trim() || getLinkFlowApiUrl();
  if (!base) return null;
  try {
    const u = new URL(base);
    return `${u.origin}/brand/dashboard`;
  } catch {
    return null;
  }
}
