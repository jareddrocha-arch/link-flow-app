/**
 * Link Flow Affiliates — App Web Pixel
 *
 * Fires on every completed checkout (not only referred orders).
 * POSTs to /api/sales/track with brandKey, orderId, amount, currency, products, fa_ref.
 *
 * Note: network calls run inside Shopify’s pixel sandbox iframe — they often do NOT
 * appear under the main Thank You page Network tab. Use Customer events debugger
 * or the “Network” filter for the pixel sandbox / our host.
 */
import { register } from "@shopify/web-pixels-extension";

const REF_COOKIE = "fa_ref";
const DEFAULT_API =
  "https://link-flow-app-amber.vercel.app/api/sales/track";

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  if (typeof v === "object" && v !== null && "amount" in v) {
    return toNum(v.amount);
  }
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
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
      /* plain */
    }
    if (decoded && decoded.charAt(0) !== "{") return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

async function readReferralCode(browser, event) {
  try {
    const fromCookie = await browser.cookie.get(REF_COOKIE);
    const code = parseReferralCookie(fromCookie);
    if (code) return code;
  } catch {
    /* ignore */
  }
  try {
    const fromLs = await browser.localStorage.getItem(REF_COOKIE);
    const code = parseReferralCookie(fromLs);
    if (code) return code;
  } catch {
    /* ignore */
  }
  try {
    const search =
      (event &&
        event.context &&
        event.context.document &&
        event.context.document.location &&
        event.context.document.location.search) ||
      "";
    const params = new URLSearchParams(search);
    return params.get(REF_COOKIE) || params.get("ref") || null;
  } catch {
    return null;
  }
}

async function captureFirstClick(browser, event) {
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
    const entry = JSON.stringify({ code: String(code), capturedAt: Date.now() });
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

function extractCheckout(event) {
  return (
    (event && event.data && event.data.checkout) ||
    (event && event.data && event.data.checkoutCompleted && event.data.checkoutCompleted.checkout) ||
    null
  );
}

function extractAmount(checkout) {
  if (!checkout) return null;
  return (
    toNum(checkout.totalPrice) ||
    toNum(checkout.totalPrice && checkout.totalPrice.amount) ||
    toNum(checkout.subtotalPrice) ||
    toNum(checkout.subtotalPrice && checkout.subtotalPrice.amount) ||
    toNum(checkout.totalPriceSet && checkout.totalPriceSet.shopMoney) ||
    toNum(
      checkout.totalPriceSet &&
        checkout.totalPriceSet.shopMoney &&
        checkout.totalPriceSet.shopMoney.amount,
    ) ||
    null
  );
}

function extractCurrency(checkout) {
  if (!checkout) return "USD";
  return (
    (checkout.totalPrice && checkout.totalPrice.currencyCode) ||
    checkout.currencyCode ||
    (checkout.totalPriceSet &&
      checkout.totalPriceSet.shopMoney &&
      checkout.totalPriceSet.shopMoney.currencyCode) ||
    "USD"
  );
}

function extractOrderId(checkout) {
  if (!checkout) return null;
  const order = checkout.order || {};
  return (
    shopifyNumericId(order.id) ||
    (order.name != null ? String(order.name) : null) ||
    (checkout.token != null ? String(checkout.token) : null) ||
    (checkout.orderId != null ? String(checkout.orderId) : null)
  );
}

function extractProduct(checkout) {
  const items = (checkout && (checkout.lineItems || checkout.line_items)) || [];
  const first = items[0] || null;
  if (!first) return { productId: "auto", productName: null };
  const productGid =
    (first.variant && first.variant.product && first.variant.product.id) ||
    first.productId ||
    first.id ||
    null;
  return {
    productId: shopifyNumericId(productGid) || "auto",
    productName:
      first.title ||
      (first.variant && first.variant.product && first.variant.product.title) ||
      first.name ||
      null,
  };
}

function isThankYouContext(event) {
  try {
    const href =
      (event &&
        event.context &&
        event.context.document &&
        event.context.document.location &&
        event.context.document.location.href) ||
      "";
    const path =
      (event &&
        event.context &&
        event.context.document &&
        event.context.document.location &&
        event.context.document.location.pathname) ||
      "";
    return /thank|order-status|orders\/|checkouts\/.+\/(thank|processing)/i.test(
      href + " " + path,
    );
  } catch {
    return false;
  }
}

async function sendSale(apiUrl, payload) {
  // Use absolute URL only
  const url = String(apiUrl || DEFAULT_API);
  console.log("[Link Flow Pixel] POST", url, payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
    // credentials omitted — cross-origin to our API
  });

  console.log("[Link Flow Pixel] response", res && res.status);
  return res;
}

register(({ analytics, browser, settings, init }) => {
  // Settings from webPixelCreate — always strings
  const brandKey = String((settings && settings.brandKey) || "").trim();
  let apiUrl = String((settings && settings.apiUrl) || DEFAULT_API).trim();
  if (!apiUrl) apiUrl = DEFAULT_API;

  // Never track to localhost from a live shop
  if (/localhost|127\.0\.0\.1/i.test(apiUrl)) {
    apiUrl = DEFAULT_API;
  }

  console.log("[Link Flow Pixel] boot", {
    brandKey: brandKey || "(missing)",
    apiUrl,
    hasInit: Boolean(init),
  });

  const sentKeys = new Set();

  async function trackCheckout(event, reason) {
    try {
      await captureFirstClick(browser, event);

      if (!brandKey) {
        console.warn("[Link Flow Pixel] skip: no brandKey in settings");
        return;
      }

      const checkout = extractCheckout(event);
      if (!checkout) {
        console.warn("[Link Flow Pixel] skip: no checkout on event", reason);
        return;
      }

      const amount = extractAmount(checkout);
      if (!amount) {
        console.warn(
          "[Link Flow Pixel] skip: no positive amount",
          reason,
          checkout && checkout.totalPrice,
        );
        // Still try with 0? No — API requires positive amount
        return;
      }

      const orderId = extractOrderId(checkout);
      const { productId, productName } = extractProduct(checkout);
      const currency = extractCurrency(checkout);
      const referralCode = await readReferralCode(browser, event);

      const dedupe = orderId || `${amount}-${currency}`;
      if (sentKeys.has(dedupe)) {
        console.log("[Link Flow Pixel] skip: already sent", dedupe);
        return;
      }
      sentKeys.add(dedupe);

      let pageUrl;
      try {
        pageUrl =
          event.context &&
          event.context.document &&
          event.context.document.location &&
          event.context.document.location.href;
      } catch {
        pageUrl = undefined;
      }

      const payload = {
        brandKey,
        productId: productId || "auto",
        amount: Number(amount),
        currency: String(currency || "USD"),
        source: "pixel",
      };
      if (orderId) payload.orderId = String(orderId);
      if (productName) payload.productName = String(productName);
      if (referralCode) payload.referralCode = String(referralCode);
      if (pageUrl) payload.pageUrl = String(pageUrl);

      await sendSale(apiUrl, payload);
    } catch (err) {
      console.error("[Link Flow Pixel] track failed", err);
    }
  }

  // Primary: official purchase event (usually Thank You page)
  analytics.subscribe("checkout_completed", (event) => {
    console.log("[Link Flow Pixel] event checkout_completed");
    trackCheckout(event, "checkout_completed");
  });

  // Backup: some shops / revisits only emit page_viewed on order status
  analytics.subscribe("page_viewed", (event) => {
    captureFirstClick(browser, event);
    if (isThankYouContext(event) && extractCheckout(event)) {
      console.log("[Link Flow Pixel] event page_viewed thank-you context");
      trackCheckout(event, "page_viewed_thank_you");
    }
  });

  // If checkout is already available at boot (rare), try once
  try {
    const bootCheckout =
      init && init.data && (init.data.checkout || init.data.cart);
    if (bootCheckout && bootCheckout.order) {
      console.log("[Link Flow Pixel] init checkout present");
      trackCheckout(
        { data: { checkout: bootCheckout }, context: init.context },
        "init",
      );
    }
  } catch {
    /* ignore */
  }
});
