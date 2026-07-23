import { NextRequest, NextResponse } from "next/server";
import {
  handleShopifyWebhook,
  verifyShopifyWebhookHmac,
} from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Shopify webhook receiver (orders + app/uninstalled).
 * Address registered at install: {HOST}/api/webhooks/shopify
 *
 * app/uninstalled → full cleanup (ScriptTags, Web Pixel, sessions, brandKey, audit log)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") || "";
  const shopDomain =
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "";
  const webhookId = request.headers.get("x-shopify-webhook-id") || null;

  if (!verifyShopifyWebhookHmac(rawBody, hmac)) {
    console.warn("[webhook] invalid hmac", { topic, shopDomain, webhookId });
    return new NextResponse("Invalid HMAC", { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
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

    // Always 200 so Shopify does not retry forever on business-logic edges
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[webhook] handler error", { topic, shopDomain, error });
    return NextResponse.json(
      { received: false, error: "handler_failed" },
      { status: 500 },
    );
  }
}
