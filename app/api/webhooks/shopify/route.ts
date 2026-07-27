import { NextRequest, NextResponse } from "next/server";
import {
  handleShopifyWebhook,
  verifyShopifyWebhookHmac,
} from "@/lib/webhooks";

export const dynamic = "force-dynamic";
/** Node runtime so crypto + raw body behave consistently on Vercel */
export const runtime = "nodejs";

/**
 * Shopify webhook receiver — single endpoint for:
 * - app/uninstalled
 * - Mandatory compliance: customers/data_request, customers/redact, shop/redact
 *   (declared in shopify.app.toml compliance_topics)
 * - Optional order topics (if registered)
 *
 * Address: {HOST}/api/webhooks/shopify
 *
 * App Store check "Verifies webhooks with HMAC signatures":
 * 1. Read raw body bytes first (never verify against re-serialized JSON)
 * 2. HMAC-SHA256 with SHOPIFY_API_SECRET → base64
 * 3. Compare to X-Shopify-Hmac-SHA256
 * 4. Invalid / missing → 401
 * 5. Valid → 200 (even if business logic fails — log and ack)
 */
export async function POST(request: NextRequest) {
  // Raw body as sent by Shopify — required for HMAC (do not request.json() first)
  const rawBodyBuffer = Buffer.from(await request.arrayBuffer());
  const rawBody = rawBodyBuffer.toString("utf8");

  const hmac =
    request.headers.get("x-shopify-hmac-sha256") ||
    request.headers.get("X-Shopify-Hmac-Sha256");
  const topic = request.headers.get("x-shopify-topic") || "";
  const shopDomain =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "";
  const webhookId = request.headers.get("x-shopify-webhook-id") || null;

  if (!verifyShopifyWebhookHmac(rawBodyBuffer, hmac)) {
    console.warn("[webhook] invalid hmac", {
      topic,
      shopDomain,
      webhookId,
      bodyLength: rawBodyBuffer.length,
      hasHmacHeader: Boolean(hmac),
      hasSecret: Boolean(process.env.SHOPIFY_API_SECRET?.trim()),
    });
    // App Store automated check requires 401 (or 400) for invalid HMAC
    return new NextResponse("Invalid HMAC", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let payload: unknown = {};
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Valid signature but non-JSON — still ack 200 so Shopify does not retry
      // endlessly; automated HMAC check only cares that valid sig → 200.
      console.warn("[webhook] valid hmac but invalid JSON", {
        topic,
        shopDomain,
        webhookId,
      });
      return NextResponse.json(
        { received: true, ok: true, detail: "valid_hmac_invalid_json" },
        { status: 200 },
      );
    }
  }

  try {
    if (topic.toLowerCase() === "app/uninstalled") {
      console.info("[webhook] app/uninstalled received", {
        shopDomain,
        webhookId,
      });
    }

    const result = await handleShopifyWebhook({
      topic,
      shopDomain,
      payload,
    });

    console.info("[webhook]", {
      topic,
      shopDomain,
      webhookId,
      ...result,
    });

    // Always 200 after successful HMAC so compliance + automated checks pass
    return NextResponse.json(
      { received: true, ...result },
      { status: 200 },
    );
  } catch (error) {
    // HMAC already verified — acknowledge to Shopify; log for ops
    console.error("[webhook] handler error (acking 200 after valid hmac)", {
      topic,
      shopDomain,
      webhookId,
      error,
    });
    return NextResponse.json(
      { received: true, ok: false, error: "handler_failed" },
      { status: 200 },
    );
  }
}

/** Shopify only POSTs webhooks; reject other methods cleanly. */
export async function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
