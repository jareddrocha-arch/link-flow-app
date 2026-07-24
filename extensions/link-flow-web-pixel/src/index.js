/**
 * Link Flow Affiliates — App Web Pixel
 *
 * Fires on every completed checkout (not only referred orders).
 * POSTs to /api/sales/track with brandKey, orderId, amount, currency, products, fa_ref.
 *
 * IMPORTANT — Network tab illusion:
 *   This code runs inside Shopify’s **strict sandbox iframe**. Outbound fetch()
 *   calls do NOT appear under the main Thank You page Network panel. Look for:
 *   - Console messages prefixed with `[Link Flow Pixel]`
 *   - DevTools → the pixel sandbox frame’s Network tab
 *   - Shopify Admin → Settings → Customer events → your app pixel → test events
 *   - App dashboard / Supabase Sale rows after checkout
 */
import { register } from "@shopify/web-pixels-extension";

const REF_COOKIE = "fa_ref";
const DEFAULT_API =
  "https://link-flow-app-amber.vercel.app/api/sales/track";
const LOG = "[Link Flow Pixel]";

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  if (typeof v === "object" && v !== null) {
    if ("amount" in v) return toNum(v.amount);
    if ("shopMoney" in v) return toNum(v.shopMoney);
  }
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

function shopifyNumericId(value) {
  if (value == null || value === "") return null;
  const s = String(value);
  const m =
    s.match(/\/(?:Product|Order|CheckoutLineItem)\/(\d+)/i) ||
    s.match(/^gid:\/\/shopify\/(?:Product|Order|CheckoutLineItem)\/(\d+)/i) ||
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
      /* plain string */
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
    const fromSs = await browser.sessionStorage.getItem(REF_COOKIE);
    const code = parseReferralCookie(fromSs);
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
      await browser.sessionStorage.setItem(REF_COOKIE, entry);
    } catch {
      /* ignore */
    }
    // browser.cookie.set accepts "name=value; attrs" or (name, value)
    try {
      await browser.cookie.set(
        `${REF_COOKIE}=${encodeURIComponent(entry)}; path=/; max-age=${90 * 86400}; SameSite=Lax`,
      );
    } catch {
      try {
        await browser.cookie.set(REF_COOKIE, encodeURIComponent(entry));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function extractCheckout(event) {
  if (!event) return null;
  const data = event.data || {};
  return (
    data.checkout ||
    (data.checkoutCompleted && data.checkoutCompleted.checkout) ||
    null
  );
}

function sumLineItems(checkout) {
  const items = (checkout && (checkout.lineItems || checkout.line_items)) || [];
  let sum = 0;
  for (const item of items) {
    const line =
      toNum(item.finalLinePrice) ||
      toNum(item.finalLinePrice && item.finalLinePrice.amount) ||
      toNum(item.variant && item.variant.price) ||
      toNum(item.price) ||
      null;
    if (line) sum += line;
  }
  return sum > 0 ? sum : null;
}

function sumTransactions(checkout) {
  const txs = (checkout && checkout.transactions) || [];
  let sum = 0;
  for (const tx of txs) {
    const a = toNum(tx.amount) || toNum(tx.amount && tx.amount.amount);
    if (a) sum += a;
  }
  return sum > 0 ? sum : null;
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
    sumTransactions(checkout) ||
    sumLineItems(checkout) ||
    null
  );
}

function extractCurrency(checkout) {
  if (!checkout) return "USD";
  return (
    (checkout.totalPrice && checkout.totalPrice.currencyCode) ||
    checkout.currencyCode ||
    (checkout.subtotalPrice && checkout.subtotalPrice.currencyCode) ||
    (checkout.totalPriceSet &&
      checkout.totalPriceSet.shopMoney &&
      checkout.totalPriceSet.shopMoney.currencyCode) ||
    (checkout.transactions &&
      checkout.transactions[0] &&
      checkout.transactions[0].amount &&
      checkout.transactions[0].amount.currencyCode) ||
    "USD"
  );
}

function extractOrderId(checkout) {
  if (!checkout) return null;
  const order = checkout.order || {};
  return (
    shopifyNumericId(order.id) ||
    (order.name != null ? String(order.name) : null) ||
    (checkout.orderId != null ? String(checkout.orderId) : null) ||
    (checkout.token != null ? String(checkout.token) : null)
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

function pageLocation(event, init) {
  try {
    const loc =
      (event &&
        event.context &&
        event.context.document &&
        event.context.document.location) ||
      (init &&
        init.context &&
        init.context.document &&
        init.context.document.location) ||
      null;
    if (!loc) return { href: "", path: "", search: "" };
    return {
      href: String(loc.href || ""),
      path: String(loc.pathname || ""),
      search: String(loc.search || ""),
    };
  } catch {
    return { href: "", path: "", search: "" };
  }
}

function isThankYouContext(event, init) {
  const { href, path } = pageLocation(event, init);
  return /thank|order-status|\/orders\/|checkouts\/.+\/(thank|processing)|\/thank_you/i.test(
    `${href} ${path}`,
  );
}

/**
 * POST sale. Prefer fetch(keepalive). Fall back to browser.sendBeacon if fetch throws.
 */
async function sendSaleWithFallback(browser, apiUrl, payload) {
  const url = String(apiUrl || DEFAULT_API);
  const body = JSON.stringify(payload);
  console.log(LOG, "POST", url, payload);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    });
    console.log(LOG, "response", res && res.status, res && res.ok);
    return res;
  } catch (fetchErr) {
    console.warn(LOG, "fetch failed, trying sendBeacon", fetchErr);
    try {
      const ok = await browser.sendBeacon(url, body);
      console.log(LOG, "sendBeacon result", ok);
      return { ok: Boolean(ok), status: ok ? 202 : 0 };
    } catch (beaconErr) {
      console.error(LOG, "sendBeacon also failed", beaconErr);
      throw fetchErr;
    }
  }
}

register(({ analytics, browser, settings, init }) => {
  const brandKey = String((settings && settings.brandKey) || "").trim();
  let apiUrl = String((settings && settings.apiUrl) || DEFAULT_API).trim();
  if (!apiUrl) apiUrl = DEFAULT_API;
  if (/localhost|127\.0\.0\.1/i.test(apiUrl)) {
    apiUrl = DEFAULT_API;
  }

  const privacy = (init && init.customerPrivacy) || {};
  console.log(LOG, "boot", {
    brandKey: brandKey || "(missing)",
    apiUrl,
    hasInit: Boolean(init),
    privacy,
    page: pageLocation(null, init),
  });

  const sentKeys = new Set();

  async function trackCheckout(event, reason) {
    try {
      await captureFirstClick(browser, event);

      if (!brandKey) {
        console.warn(LOG, "skip: no brandKey in settings — re-run provision");
        return;
      }

      const checkout = extractCheckout(event);
      if (!checkout) {
        console.warn(LOG, "skip: no checkout on event", reason, {
          keys: event && event.data ? Object.keys(event.data) : [],
        });
        return;
      }

      const amount = extractAmount(checkout);
      if (!amount) {
        // Still try to record if we have an order id (API requires amount > 0,
        // so log full checkout money fields for diagnosis).
        console.warn(LOG, "skip: no positive amount", reason, {
          totalPrice: checkout.totalPrice,
          subtotalPrice: checkout.subtotalPrice,
          transactions: checkout.transactions,
          lineItemCount: (checkout.lineItems || []).length,
        });
        return;
      }

      const orderId = extractOrderId(checkout);
      const { productId, productName } = extractProduct(checkout);
      const currency = extractCurrency(checkout);
      const referralCode = await readReferralCode(browser, event);

      const dedupe = `${orderId || "no-order"}|${amount}|${currency}|${reason}`;
      // Prefer order-id level dedupe across reasons
      const orderDedupe = orderId ? `order:${orderId}` : dedupe;
      if (sentKeys.has(orderDedupe) || sentKeys.has(dedupe)) {
        console.log(LOG, "skip: already sent", orderDedupe);
        return;
      }
      sentKeys.add(orderDedupe);
      sentKeys.add(dedupe);

      const { href: pageUrl } = pageLocation(event, init);

      const payload = {
        brandKey,
        productId: productId || "auto",
        amount: Number(amount),
        currency: String(currency || "USD"),
        source: "pixel",
      };
      if (orderId) payload.orderId = String(orderId);
      if (productName) payload.productName = String(productName);
      // Only attach referral when present — invalid formats are stripped server-side
      if (referralCode) payload.referralCode = String(referralCode);
      if (pageUrl) payload.pageUrl = String(pageUrl);

      await sendSaleWithFallback(browser, apiUrl, payload);
    } catch (err) {
      console.error(LOG, "track failed", err);
    }
  }

  // Primary: official purchase event (Thank You / first post-purchase upsell page)
  analytics.subscribe("checkout_completed", (event) => {
    console.log(LOG, "event checkout_completed", {
      hasCheckout: Boolean(extractCheckout(event)),
      amount: extractAmount(extractCheckout(event)),
      orderId: extractOrderId(extractCheckout(event)),
    });
    trackCheckout(event, "checkout_completed");
  });

  // Some stores surface order context only after navigation / status load
  analytics.subscribe("page_viewed", (event) => {
    captureFirstClick(browser, event);
    const checkout = extractCheckout(event);
    if (isThankYouContext(event, init)) {
      console.log(LOG, "event page_viewed (thank-you context)", {
        hasCheckout: Boolean(checkout),
        page: pageLocation(event, init),
      });
      if (checkout) {
        trackCheckout(event, "page_viewed_thank_you");
      }
    }
  });

  // Diagnostic: log any checkout_* events so we can see what fires on this store
  analytics.subscribe("all_standard_events", (event) => {
    try {
      const name = event && event.name;
      if (!name) return;
      if (
        name === "checkout_completed" ||
        name === "checkout_started" ||
        name === "payment_info_submitted" ||
        name === "checkout_shipping_info_submitted" ||
        (isThankYouContext(event, init) && name === "page_viewed")
      ) {
        console.log(LOG, "standard_event", name, {
          hasCheckout: Boolean(extractCheckout(event)),
        });
      }
    } catch {
      /* ignore */
    }
  });
});
