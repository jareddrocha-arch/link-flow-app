import { NextRequest, NextResponse } from "next/server";
import {
  recordTrackedSale,
  resolveBrandByTrackingKey,
} from "@/lib/brand-key";
import { corsHeadersForTracking } from "@/lib/cors-tracking";
import { getLinkFlowSalesTrackUrl } from "@/lib/link-flow-api";
import { validateTrackSaleBody } from "@/lib/validations/track-sale";

const MAX_JSON_BYTES = 100 * 1024;

function jsonWithCors(
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: corsHeadersForTracking(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersForTracking(),
  });
}

/**
 * Thank You page sale tracking.
 *
 * Brands' confirmation pages POST order data here (via tracking.js or inline snippet).
 * Auth is the brandKey (fb_…) from the Link Flow brandKey system.
 *
 * Forwards to the main Link Flow backend when available:
 *   https://www.linkflowaffiliates.com/api/sales/track
 *
 * Body:
 * {
 *   brandKey: "fb_…",
 *   productId: "auto" | storefront product id,
 *   amount: 99.00,
 *   orderId?: "1234",
 *   referralCode?: "fa-…",
 *   productName?: "…",
 *   pageUrl?: "…"
 * }
 */
export async function POST(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_JSON_BYTES) {
    return jsonWithCors({ error: "Payload too large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_JSON_BYTES) {
      return jsonWithCors({ error: "Payload too large" }, { status: 413 });
    }
    raw = text ? JSON.parse(text) : {};
  } catch {
    return jsonWithCors({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateTrackSaleBody(raw);
  if (!parsed.ok) {
    return jsonWithCors(
      { error: parsed.error, details: parsed.details },
      { status: 400 },
    );
  }

  const {
    brandKey,
    productId,
    amount,
    orderId,
    referralCode,
    productName,
    pageUrl,
  } = parsed.data;

  // Local format check first; upstream does authoritative brand lookup
  const brand = resolveBrandByTrackingKey(brandKey);
  if (!brand) {
    return jsonWithCors({ error: "Invalid brand tracking key" }, { status: 401 });
  }

  const upstreamUrl = getLinkFlowSalesTrackUrl();

  if (upstreamUrl) {
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(parsed.data),
        // Avoid hanging the thank-you page forever
        signal: AbortSignal.timeout(12_000),
      });

      const upstreamBody = await upstreamRes.json().catch(() => ({
        error: "Invalid upstream response",
      }));

      // Mirror successful (and duplicate) tracks locally for app debugging
      if (upstreamRes.ok) {
        recordTrackedSale({
          brand,
          productId,
          amount,
          orderId,
          productName,
          referralCode,
          pageUrl,
        });
      } else {
        console.warn("Link Flow track upstream error:", {
          status: upstreamRes.status,
          body: upstreamBody,
          brandKey,
          orderId,
        });
      }

      return jsonWithCors(upstreamBody, { status: upstreamRes.status });
    } catch (error) {
      console.error("Upstream track failed, falling back to local record:", error);

      // Offline / network failure: still accept locally so brand scripts don't hard-fail
      const sale = recordTrackedSale({
        brand,
        productId,
        amount,
        orderId,
        productName,
        referralCode,
        pageUrl,
      });

      return jsonWithCors({
        success: true,
        duplicate: sale.duplicate ?? false,
        saleId: sale.id,
        productId: sale.productId,
        warning: "Recorded locally; Link Flow backend unreachable",
        forwarded: false,
      });
    }
  }

  const sale = recordTrackedSale({
    brand,
    productId,
    amount,
    orderId,
    productName,
    referralCode,
    pageUrl,
  });

  return jsonWithCors({
    success: true,
    duplicate: sale.duplicate ?? false,
    saleId: sale.id,
    productId: sale.productId,
    forwarded: false,
  });
}
