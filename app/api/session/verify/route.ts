import { NextRequest, NextResponse } from "next/server";
import {
  extractSessionTokenFromRequest,
  verifyShopifySessionToken,
} from "@/lib/session-token";
import { setShopSessionCookie } from "@/lib/shop-session";
import { getStoreByShop, normalizeShop } from "@/lib/stores";

/**
 * Verify a Shopify App Bridge session token (JWT).
 * Used by the embedded dashboard on load so Partner Dashboard "Embedded app
 * checks" can observe session-token authentication, and to bind a same-site
 * cookie when possible.
 *
 * POST Authorization: Bearer <session token from shopify.idToken()>
 * Optional body: { shop?: string }
 */
export async function POST(request: NextRequest) {
  let bodyShop: string | null = null;
  try {
    const body = (await request.json()) as { shop?: string };
    bodyShop = body.shop ?? null;
  } catch {
    /* empty body ok */
  }

  const token = extractSessionTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing session token",
        code: "missing_session_token",
      },
      {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      },
    );
  }

  const verified = await verifyShopifySessionToken(token, request.url);
  if (!verified) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid or expired session token",
        code: "invalid_session_token",
      },
      {
        status: 401,
        headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" },
      },
    );
  }

  const shop = verified.shop;
  if (bodyShop) {
    const expected = normalizeShop(bodyShop);
    if (expected && expected !== shop) {
      return NextResponse.json(
        {
          ok: false,
          error: "Session token shop does not match request",
          code: "shop_mismatch",
        },
        { status: 403 },
      );
    }
  }

  const store = await getStoreByShop(shop);
  const response = NextResponse.json({
    ok: true,
    shop,
    installed: Boolean(store && store.status === "ACTIVE"),
    auth: "session_token",
  });

  if (store?.status === "ACTIVE") {
    setShopSessionCookie(response, shop);
  }

  return response;
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST with Authorization: Bearer <session token>",
      method: "POST",
    },
    { status: 405 },
  );
}
