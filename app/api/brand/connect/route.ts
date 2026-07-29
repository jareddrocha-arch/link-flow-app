import { NextRequest, NextResponse } from "next/server";
import { connectBrandOnLinkFlow } from "@/lib/link-flow-brand-connect";
import { registerBrandKey } from "@/lib/brand-key";
import { provisionStoreTracking } from "@/lib/provision-tracking";
import {
  isAuthorizedForShop,
  setShopSessionCookie,
} from "@/lib/shop-session";
import {
  getStoreByShop,
  normalizeShop,
  updateStoreBrandKey,
} from "@/lib/stores";

/**
 * Connect a Link Flow brand account to this Shopify store (App Store install).
 *
 * POST {
 *   shop, mode: "signup"|"login", email, password, brandName?, actionToken?
 * }
 *
 * Auth: Shopify session token / action token / shop session cookie.
 * On success: locks brandKey on Store, provisions ScriptTag + Web Pixel.
 */
export async function POST(request: NextRequest) {
  let body: {
    shop?: string;
    mode?: string;
    email?: string;
    password?: string;
    brandName?: string;
    actionToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shop = normalizeShop(body.shop || "");
  if (!shop) {
    return NextResponse.json({ error: "shop is required" }, { status: 400 });
  }

  const store = await getStoreByShop(shop);
  if (!store || store.status !== "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "Store not found or not active. Install the app from Shopify Admin first.",
        code: "store_not_active",
      },
      { status: 404 },
    );
  }

  const authorized = await isAuthorizedForShop(shop, request, {
    actionToken: body.actionToken,
  });
  if (!authorized) {
    return NextResponse.json(
      {
        error:
          "Unauthorized — open the app from Shopify Admin so a session token can be issued.",
        code: "session_unauthorized",
      },
      {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      },
    );
  }

  if (store.brandKey?.trim()) {
    return NextResponse.json(
      {
        ok: true,
        alreadyLinked: true,
        shop: store.shop,
        brandKey: store.brandKey,
        brandKeyLocked: true,
        message: "This store is already linked to a brand key.",
      },
      { status: 200 },
    );
  }

  if (!store.accessToken?.trim()) {
    return NextResponse.json(
      {
        error: "No Shopify access token — please reinstall the app",
        code: "missing_access_token",
      },
      { status: 401 },
    );
  }

  const mode = body.mode === "signup" ? "signup" : body.mode === "login" ? "login" : null;
  if (!mode) {
    return NextResponse.json(
      { error: 'mode must be "signup" or "login"' },
      { status: 400 },
    );
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  if (mode === "signup" && !(body.brandName || "").trim()) {
    return NextResponse.json(
      { error: "Brand name is required to create an account" },
      { status: 400 },
    );
  }

  const connected = await connectBrandOnLinkFlow({
    mode,
    email,
    password,
    brandName: body.brandName,
    shop,
  });

  if (!connected.ok) {
    return NextResponse.json(
      {
        error: connected.error,
        code: connected.code || "brand_connect_failed",
      },
      { status: connected.status >= 400 ? connected.status : 400 },
    );
  }

  try {
    const updated = await updateStoreBrandKey(shop, connected.brandKey);
    registerBrandKey(connected.brandKey, {
      brandName: connected.brandName,
      shop,
      id: connected.brandId || undefined,
    });

    let provision = null;
    try {
      provision = await provisionStoreTracking(updated);
    } catch (e) {
      console.error("[brand/connect] provision failed", e);
      const response = NextResponse.json({
        ok: true,
        shop: updated.shop,
        brandKey: updated.brandKey,
        brandName: connected.brandName,
        brandKeyLocked: true,
        provision: null,
        provisionError:
          e instanceof Error ? e.message : "Tracking provision failed",
        message:
          "Brand linked, but tracking install had issues. Use Refresh tracking.",
      });
      setShopSessionCookie(response, updated.shop);
      return response;
    }

    const response = NextResponse.json({
      ok: true,
      shop: updated.shop,
      brandKey: updated.brandKey,
      brandName: connected.brandName,
      brandKeyLocked: true,
      provision: {
        scriptTagId: provision.scriptTagId,
        webPixelId: provision.webPixelId,
        webhooks: provision.webhooks,
        errors: provision.errors,
      },
      message: "Brand connected and tracking provisioned.",
    });
    setShopSessionCookie(response, updated.shop);
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to link brand key";
    return NextResponse.json(
      { error: message, code: "link_failed" },
      { status: 400 },
    );
  }
}
