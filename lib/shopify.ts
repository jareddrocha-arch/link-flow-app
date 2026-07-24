import "@shopify/shopify-api/adapters/web-api";
import {
  shopifyApi,
  ApiVersion,
  Session,
  type Shopify,
} from "@shopify/shopify-api";

function requireEnv(name: string): string {
  // Trim — secrets pasted into Vercel often include trailing newlines that break HMAC
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Resolve public app origin used for OAuth redirect_uri.
 *
 * Priority:
 * 1. HOST env (set this in Vercel to your production URL)
 * 2. VERCEL_PROJECT_PRODUCTION_URL
 * 3. VERCEL_URL (per-deployment)
 * 4. localhost (dev only)
 *
 * Always returns scheme + host, no trailing slash.
 * Example: https://link-flow-app.vercel.app
 */
export function resolveAppUrl(requestUrl?: string | URL): string {
  const fromEnv = process.env.HOST?.trim();
  if (fromEnv && !isLocalhost(fromEnv)) {
    return normalizeOrigin(fromEnv);
  }

  // Prefer the URL the merchant is actually hitting (custom domain / vercel.app)
  if (requestUrl) {
    try {
      const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
      if (url.host && !isLocalhost(url.origin)) {
        return normalizeOrigin(url.origin);
      }
      // Dev: allow localhost request origin when HOST is also local
      if (url.host && process.env.NODE_ENV !== "production") {
        return normalizeOrigin(url.origin);
      }
    } catch {
      /* ignore */
    }
  }

  // If HOST is explicitly localhost (local dev), honor it
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return normalizeOrigin(
      vercelProd.startsWith("http") ? vercelProd : `https://${vercelProd}`,
    );
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return normalizeOrigin(
      vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
    );
  }

  return "http://localhost:3000";
}

function isLocalhost(value: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(value);
}

function normalizeOrigin(host: string): string {
  let value = host.trim().replace(/\/$/, "");
  // Strip accidental path if someone pasted the full callback URL as HOST
  try {
    if (!/^https?:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    const u = new URL(value);
    return u.origin;
  } catch {
    return value.replace(/\/api\/auth\/callback\/?$/i, "").replace(/\/$/, "");
  }
}

function parseHost(appUrl: string): {
  hostName: string;
  hostScheme: "http" | "https";
} {
  const normalized = normalizeOrigin(appUrl);
  const hostScheme = normalized.startsWith("https") ? "https" : "http";
  const hostName = normalized.replace(/^https?:\/\//, "");
  return { hostName, hostScheme };
}

/** OAuth callback path — must match Partner Dashboard allowlist exactly. */
export const OAUTH_CALLBACK_PATH = "/api/auth/callback";

/**
 * Shopify API client for a given request / host.
 * Built per-call so redirect_uri always matches the live app URL.
 */
export function getShopify(requestUrl?: string | URL): Shopify {
  const appUrl = resolveAppUrl(requestUrl);
  const { hostName, hostScheme } = parseHost(appUrl);

  const required = [
    "read_products",
    "read_orders",
    "write_script_tags",
    "write_pixels",
    "read_customer_events",
  ];
  const fromEnv = (process.env.SCOPES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const scopes = [...new Set([...fromEnv, ...required])];

  return shopifyApi({
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
    scopes,
    hostName,
    hostScheme,
    apiVersion: ApiVersion.April26,
    isEmbeddedApp: process.env.SHOPIFY_APP_EMBEDDED === "true",
  });
}

/** @deprecated Prefer getShopify(request.url) so OAuth host matches the request. */
export const shopify = getShopify();

/** In-memory session store for local development. Replace with a DB for production. */
class MemorySessionStorage {
  private sessions = new Map<string, Session>();

  async storeSession(session: Session): Promise<boolean> {
    this.sessions.set(session.id, session);
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    ids.forEach((id) => this.sessions.delete(id));
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((session) => session.shop === shop);
  }
}

const globalForShopify = globalThis as unknown as {
  shopifySessionStorage?: MemorySessionStorage;
};

export const sessionStorage =
  globalForShopify.shopifySessionStorage ?? new MemorySessionStorage();

if (process.env.NODE_ENV !== "production") {
  globalForShopify.shopifySessionStorage = sessionStorage;
}

export function sanitizeShopDomain(
  shop: string | null,
  requestUrl?: string | URL,
): string | null {
  if (!shop) return null;
  try {
    return getShopify(requestUrl).utils.sanitizeShop(shop, true);
  } catch {
    return null;
  }
}

/** Full redirect URI that must be whitelisted in Shopify Partner Dashboard. */
export function getOAuthRedirectUri(requestUrl?: string | URL): string {
  return `${resolveAppUrl(requestUrl)}${OAUTH_CALLBACK_PATH}`;
}
