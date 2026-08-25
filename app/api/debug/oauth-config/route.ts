import { NextRequest, NextResponse } from "next/server";
import {
  debugUnauthorizedResponse,
  isDebugAuthorized,
} from "@/lib/debug-auth";
import { shopifyCredentialSummary } from "@/lib/shopify-credentials";
import { getOAuthRedirectUri, resolveAppUrl } from "@/lib/shopify";

/**
 * Debug helper: shows the exact redirect_uri this deployment will send to Shopify.
 *
 * Production: GET /api/debug/oauth-config?key=DEBUG_SECRET
 * Local dev: open without a key.
 */
export async function GET(request: NextRequest) {
  if (!isDebugAuthorized(request)) {
    const { body, status } = debugUnauthorizedResponse();
    return NextResponse.json(body, { status });
  }

  const appUrl = resolveAppUrl(request.url);
  const redirectUri = getOAuthRedirectUri(request.url);

  return NextResponse.json({
    ok: true,
    appUrl,
    redirectUri,
    whitelistThisExactUrl: redirectUri,
    hostEnv: process.env.HOST ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    shopifyApps: shopifyCredentialSummary(),
    tips: [
      "In Shopify Partner Dashboard → App → Versions → URLs (or Configuration):",
      `App URL = ${appUrl}`,
      `Allowed redirection URL(s) must include EXACTLY: ${redirectUri}`,
      "No trailing slash. Must be https on Vercel. Path must be /api/auth/callback (not /auth/callback).",
      "After changing env vars on Vercel, redeploy.",
    ],
  });
}
