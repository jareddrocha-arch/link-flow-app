import { NextRequest, NextResponse } from "next/server";
import { corsHeadersForTracking } from "@/lib/cors-tracking";
import { getLinkFlowSalesTrackUrl } from "@/lib/link-flow-api";
import { recordStoreSale } from "@/lib/record-sale";
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
 * Thank You / storefront sale tracking.
 * Auth: brandKey (fb_…) must match an installed Store.
 * Also optionally forwards to main Link Flow platform when configured.
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
    currency,
    source,
  } = parsed.data;

  // Primary: record against this app's Supabase Store
  // Fires for every sale (referralCode optional — web pixel + script + webhooks)
  const local = await recordStoreSale({
    brandKey,
    amount,
    orderId,
    productId,
    productName,
    referralCode,
    pageUrl,
    currency,
    source:
      source === "pixel" || source === "webhook" || source === "manual"
        ? source
        : "script",
  });

  if (!local.ok) {
    return jsonWithCors({ error: local.error }, { status: local.status });
  }

  // Optional forward to main Link Flow platform (commissions network)
  const upstreamUrl = getLinkFlowSalesTrackUrl();
  let forwarded = false;
  let upstreamBody: unknown = null;

  if (upstreamUrl && process.env.LINK_FLOW_FORWARD !== "false") {
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(12_000),
      });
      upstreamBody = await upstreamRes.json().catch(() => null);
      forwarded = upstreamRes.ok;
    } catch (error) {
      console.warn("Upstream track failed (local sale kept):", error);
    }
  }

  return jsonWithCors({
    success: true,
    duplicate: local.duplicate,
    saleId: local.saleId,
    shop: local.shop,
    productId: productId || "auto",
    commission: local.commission,
    forwarded,
    upstream: upstreamBody,
  });
}
