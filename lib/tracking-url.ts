import { resolveAppUrl } from "@/lib/shopify";

/**
 * Public URL of the merchant tracking script.
 * Prefer HOST (production Vercel URL) so ScriptTags don't point at localhost.
 */
export function getTrackingScriptUrl(options: {
  brandKey: string;
  /** Force thank-you detection retries */
  thankYou?: boolean;
  requestUrl?: string;
}): string {
  const base = resolveAppUrl(options.requestUrl);
  const url = new URL(`${base}/tracking.js`);
  url.searchParams.set("k", options.brandKey);
  url.searchParams.set("brandKey", options.brandKey);
  if (options.thankYou) {
    url.searchParams.set("ty", "1");
  }
  return url.toString();
}

export function getWebhookCallbackUrl(topicPath: string): string {
  const base = resolveAppUrl();
  const path = topicPath.startsWith("/") ? topicPath : `/${topicPath}`;
  return `${base}${path}`;
}

/** Identify our ScriptTags among any others on the shop. */
export function isLinkFlowScriptSrc(src: string): boolean {
  return (
    src.includes("/tracking.js") ||
    src.includes("/api/tracking.js") ||
    src.includes("link-flow") ||
    src.includes("FlowAffiliates")
  );
}
