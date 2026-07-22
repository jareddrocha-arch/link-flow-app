import "@shopify/shopify-api/adapters/web-api";
import {
  shopifyApi,
  ApiVersion,
  Session,
  type Shopify,
} from "@shopify/shopify-api";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseHost(host: string): { hostName: string; hostScheme: "http" | "https" } {
  const normalized = host.replace(/\/$/, "");
  const hostScheme = normalized.startsWith("https") ? "https" : "http";
  const hostName = normalized.replace(/^https?:\/\//, "");
  return { hostName, hostScheme };
}

const { hostName, hostScheme } = parseHost(
  process.env.HOST ?? "http://localhost:3000",
);

export const shopify: Shopify = shopifyApi({
  apiKey: requireEnv("SHOPIFY_API_KEY"),
  apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
  scopes: (process.env.SCOPES ?? "read_products").split(",").map((s) => s.trim()),
  hostName,
  hostScheme,
  apiVersion: ApiVersion.April26,
  isEmbeddedApp: process.env.SHOPIFY_APP_EMBEDDED === "true",
});

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

export function sanitizeShopDomain(shop: string | null): string | null {
  if (!shop) return null;
  try {
    return shopify.utils.sanitizeShop(shop, true);
  } catch {
    return null;
  }
}
