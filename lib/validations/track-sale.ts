import { isValidBrandKey } from "@/lib/brand-key";

export type TrackSaleInput = {
  brandKey: string;
  productId: string;
  amount: number;
  orderId?: string;
  referralCode?: string;
  productName?: string;
  pageUrl?: string;
  currency?: string;
  source?: string;
};

export type TrackSaleValidation =
  | { ok: true; data: TrackSaleInput }
  | { ok: false; error: string; details?: Record<string, string> };

const REFERRAL_CODE_REGEX = /^fa-[a-zA-Z0-9_-]+$/;

/**
 * Validate thank-you / tracking payload (same contract as Link Flow brandKey system).
 */
export function validateTrackSaleBody(raw: unknown): TrackSaleValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const body = raw as Record<string, unknown>;
  const details: Record<string, string> = {};

  const brandKey =
    typeof body.brandKey === "string" ? body.brandKey.trim() : "";
  if (!brandKey) {
    details.brandKey = "brandKey is required";
  } else if (!isValidBrandKey(brandKey)) {
    details.brandKey = "Invalid brand key format";
  }

  let productId = "auto";
  if (body.productId != null && body.productId !== "") {
    const coerced = String(body.productId).trim();
    if (coerced && coerced !== "null" && coerced !== "undefined") {
      if (coerced.length > 128) {
        details.productId = "productId is too long";
      } else {
        productId = coerced;
      }
    }
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    details.amount = "amount must be a positive number";
  } else if (amount > 10_000_000) {
    details.amount = "amount exceeds maximum";
  }

  let orderId: string | undefined;
  if (body.orderId != null && body.orderId !== "") {
    const o = String(body.orderId).trim();
    if (o.length > 128) {
      details.orderId = "orderId is too long";
    } else if (o) {
      orderId = o;
    }
  }

  let referralCode: string | undefined;
  if (body.referralCode != null && body.referralCode !== "") {
    const r = String(body.referralCode).trim();
    if (!REFERRAL_CODE_REGEX.test(r)) {
      details.referralCode = "Invalid referral code format";
    } else {
      referralCode = r;
    }
  }

  let productName: string | undefined;
  if (body.productName != null && body.productName !== "") {
    productName = String(body.productName).trim().slice(0, 200);
  }

  let pageUrl: string | undefined;
  if (body.pageUrl != null && body.pageUrl !== "") {
    const u = String(body.pageUrl).trim();
    if (u.length > 2000) {
      details.pageUrl = "pageUrl is too long";
    } else {
      try {
        // Allow relative URLs from some injectors by only checking absolute when they look absolute
        if (/^https?:\/\//i.test(u)) {
          new URL(u);
        }
        pageUrl = u;
      } catch {
        details.pageUrl = "pageUrl must be a valid URL";
      }
    }
  }

  let currency: string | undefined;
  if (body.currency != null && body.currency !== "") {
    currency = String(body.currency).trim().slice(0, 3).toUpperCase();
  }

  let source: string | undefined;
  if (body.source != null && body.source !== "") {
    source = String(body.source).trim().slice(0, 32);
  }

  // Referral codes from cookies may be plain affiliate codes; only validate fa- format when present
  // (already handled above). Empty referral is allowed for non-referred sales.

  if (Object.keys(details).length > 0) {
    return { ok: false, error: "Validation failed", details };
  }

  return {
    ok: true,
    data: {
      brandKey,
      productId,
      amount,
      orderId,
      referralCode,
      productName,
      pageUrl,
      currency,
      source,
    },
  };
}
