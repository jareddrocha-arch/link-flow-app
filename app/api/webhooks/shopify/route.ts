import { NextRequest, NextResponse } from "next/server";
import {
  handleShopifyWebhook,
  verifyShopifyWebhookHmac,
} from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Shopify webhook receiver (orders + app/uninstalled).
 * Address registered at install: {HOST}/api/webhooks/shopify
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") || "";
  const shopDomain =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "";

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    console.warn("[webhook] invalid hmac", { topic, shopDomain });
    return new NextResponse("Invalid HMAC", { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    const result = await handleShopifyWebhook({
      topic,
      shopDomain,
      payload,
    });
    console.info("[webhook]", { topic, shopDomain, ...result });
    // Always 200 quickly so Shopify doesn't retry endlessly on business logic
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[webhook] handler error", error);
    return NextResponse.json(
      { received: false, error: "handler_failed" },
      { status: 500 },
    );
  }
}
