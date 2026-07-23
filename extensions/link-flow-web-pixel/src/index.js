/**
 * Link Flow Affiliates — App Web Pixel
 *
 * Fires on EVERY completed checkout (not only referred orders).
 * Captures orderId, amount, currency, product info, and fa_ref cookie when present.
 * POSTs to the app /api/sales/track endpoint (which also forwards to Link Flow).
 */
import { register } from "@shopify/web-pixels-extension";

const REF_COOKIE = "fa_ref";

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
}

function shopifyNumericId(value) {
  if (value == null || value === "") return null;
  const s = String(value);
  const m =
    s.match(/\/(?:Product|Order)\/(\d+)/i) ||
    s.match(/^gid:\/\/shopify\/(?:Product|Order)\/(\d+)/i) ||
    s.match(/^(\d+)$/);
  return m ? m[1] : s;
}

function parseReferralCookie(raw) {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(String(raw));
    try {
      const j = JSON.parse(decoded);
      if (j && j.code) return String(j.code);
    } catch {
      /* plain code */
    }
    if (decoded && decoded.charAt(0) !== "{") return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

async function readReferralCode(browser, init) {
  // Cookie set by storefront tracking.js (first-click)
  try {
    const fromCookie = await browser.cookie.get(REF_COOKIE);
    const code = parseReferralCookie(fromCookie);
    if (code) return code;
  } catch {
    /* sandbox may block */
  }

  // localStorage (same key)
  try {
    const fromLs = await browser.localStorage.getItem(REF_COOKIE);
    const code = parseReferralCookie(fromLs);
    if (code) return code;
  } catch {
    /* ignore */
  }

  // URL on this event
  try {
    const search =
      (init &&
        init.context &&
        init.context.document &&
        init.context.document.location &&
        init.context.document.location.search) ||
      "";
    const params = new URLSearchParams(search);
    return params.get(REF_COOKIE) || params.get("ref") || null;
  } catch {
    return null;
  }
}

async function captureFirstClickFromEvent(browser, event) {
  try {
    const search =
      (event &&
        event.context &&
        event.context.document &&
        event.context.document.location &&
        event.context.document.location.search) ||
      "";
    const params = new URLSearchParams(search);
    const code = params.get(REF_COOKIE) || params.get("ref");
    if (!code) return;

    const existing = await readReferralCode(browser, event);
    if (existing) return;

    const entry = JSON.stringify({
      code: String(code),
      capturedAt: Date.now(),
    });
    try {
      await browser.localStorage.setItem(REF_COOKIE, entry);
    } catch {
      /* ignore */
    }
    try {
      await browser.cookie.set(
        `${REF_COOKIE}=${encodeURIComponent(entry)}; path=/; max-age=${90 * 86400}; SameSite=Lax`,
      );
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

register(({ analytics, browser, settings, init }) => {
  const brandKey = (settings && settings.brandKey) || "";
  const apiUrl =
    (settings && settings.apiUrl) ||
    "https://link-flow-app-amber.vercel.app/api/sales/track";

  // Storefront: capture first-click fa_ref when present
  analytics.subscribe("page_viewed", async (event) => {
    await captureFirstClickFromEvent(browser, event);
  });

  // Thank you / order status: fire on EVERY order
  analytics.subscribe("checkout_completed", async (event) => {
    try {
      await captureFirstClickFromEvent(browser, event);

      if (!brandKey) {
        // Still no brandKey configured — nothing we can attribute to
        return;
      }

      const checkout = event && event.data && event.data.checkout;
      if (!checkout) return;

      const amount = toNum(
        checkout.totalPrice && checkout.totalPrice.amount != null
          ? checkout.totalPrice.amount
          : checkout.totalPrice,
      );
      if (!amount || amount <= 0) return;

      const currency =
        (checkout.totalPrice && checkout.totalPrice.currencyCode) ||
        checkout.currencyCode ||
        "USD";

      const lineItems = checkout.lineItems || [];
      const first = lineItems[0] || null;
      const productGid =
        (first &&
          first.variant &&
          first.variant.product &&
          first.variant.product.id) ||
        (first && first.id) ||
        null;
      const productId = shopifyNumericId(productGid) || "auto";
      const productName =
        (first && first.title) ||
        (first &&
          first.variant &&
          first.variant.product &&
          first.variant.product.title) ||
        null;

      const orderGid = (checkout.order && checkout.order.id) || null;
      const orderId =
        shopifyNumericId(orderGid) ||
        (checkout.order && checkout.order.name != null
          ? String(checkout.order.name)
          : null) ||
        (checkout.token != null ? String(checkout.token) : null);

      const referralCode = await readReferralCode(browser, event);

      let pageUrl = null;
      try {
        pageUrl =
          event.context &&
          event.context.document &&
          event.context.document.location &&
          event.context.document.location.href;
      } catch {
        /* ignore */
      }

      // Always send — referralCode is optional (every sale is recorded)
      const payload = {
        brandKey: String(brandKey),
        productId: productId || "auto",
        amount: Number(amount),
        currency: String(currency || "USD"),
        source: "pixel",
        pageUrl: pageUrl || undefined,
      };
      if (orderId) payload.orderId = String(orderId);
      if (productName) payload.productName = String(productName);
      if (referralCode) payload.referralCode = String(referralCode);

      await fetch(String(apiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
      });
    } catch {
      // Never throw from pixel
    }
  });
});
