import { NextRequest, NextResponse } from "next/server";
import { getOAuthRedirectUri, resolveAppUrl } from "@/lib/shopify";

/**
 * Temporary helper: shows the exact redirect_uri this deployment will send to Shopify.
 * Open: https://YOUR_DOMAIN/api/debug/oauth-config
 * Remove or protect this route once install works.
 */
export async function GET(request: NextRequest) {
  const appUrl = resolveAppUrl(request.url);
  const redirectUri = getOAuthRedirectUri(request.url);

  return NextResponse.json({
    appUrl,
    redirectUri,
    whitelistThisExactUrl: redirectUri,
    hostEnv: process.env.HOST ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    tips: [
      "In Shopify Partner Dashboard → App → Versions → URLs (or Configuration):",
      `App URL = ${appUrl}`,
      `Allowed redirection URL(s) must include EXACTLY: ${redirectUri}`,
      "No trailing slash. Must be https on Vercel. Path must be /api/auth/callback (not /auth/callback).",
      "After changing env vars on Vercel, redeploy.",
    ],
  });
}
