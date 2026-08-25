/**
 * Multi-app Shopify credentials.
 *
 * Default: SHOPIFY_API_KEY + SHOPIFY_API_SECRET
 * Extra apps: SHOPIFY_API_KEY_<SUFFIX> + SHOPIFY_API_SECRET_<SUFFIX>
 * Optional shop fallback: SHOPIFY_SHOP_MATCH_<SUFFIX>=substring[,substring]
 *
 * Adding a custom app later is env-only — no code change.
 */

export type ShopifyAppCredentials = {
  /** `default` or the env suffix (e.g. SINCERELY). */
  id: string;
  apiKey: string;
  apiSecret: string;
  /** Lowercase shop-domain substrings for fallback matching. */
  shopMatchers: string[];
};

export type ShopifyCredentialHints = {
  clientId?: string | null;
  shop?: string | null;
};

export const DEFAULT_CREDENTIALS_ID = "default";

const KEY_PREFIX = "SHOPIFY_API_KEY_";
const SECRET_PREFIX = "SHOPIFY_API_SECRET_";
const MATCH_PREFIX = "SHOPIFY_SHOP_MATCH_";

/**
 * Built-in shop-domain fallback only. Future apps should set
 * SHOPIFY_SHOP_MATCH_<SUFFIX> instead of adding more names here.
 */
const BUILTIN_SHOP_MATCHERS: Record<string, string[]> = {
  SINCERELY: ["sincerelysilver"],
};

let cached: ShopifyAppCredentials[] | null = null;

function trimEnv(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseMatchers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueMatchers(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const value = item.trim().toLowerCase();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function scanEnv(): ShopifyAppCredentials[] {
  const defaultKey =
    trimEnv(process.env.SHOPIFY_API_KEY) ||
    trimEnv(process.env.NEXT_PUBLIC_SHOPIFY_API_KEY);
  const defaultSecret = trimEnv(process.env.SHOPIFY_API_SECRET);

  if (!defaultKey || !defaultSecret) {
    throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }

  const extras = new Map<
    string,
    { apiKey?: string; apiSecret?: string; shopMatchers: string[] }
  >();

  const ensureExtra = (suffix: string) => {
    const id = suffix.trim();
    if (!id) return null;
    let row = extras.get(id);
    if (!row) {
      row = { shopMatchers: [] };
      extras.set(id, row);
    }
    return row;
  };

  for (const [name, raw] of Object.entries(process.env)) {
    if (name === "SHOPIFY_API_KEY" || name === "SHOPIFY_API_SECRET") continue;
    if (name === "NEXT_PUBLIC_SHOPIFY_API_KEY") continue;

    if (name.startsWith(KEY_PREFIX)) {
      const suffix = name.slice(KEY_PREFIX.length);
      const row = ensureExtra(suffix);
      if (row) row.apiKey = trimEnv(raw);
      continue;
    }
    if (name.startsWith(SECRET_PREFIX)) {
      const suffix = name.slice(SECRET_PREFIX.length);
      const row = ensureExtra(suffix);
      if (row) row.apiSecret = trimEnv(raw);
      continue;
    }
    if (name.startsWith(MATCH_PREFIX)) {
      const suffix = name.slice(MATCH_PREFIX.length);
      const row = ensureExtra(suffix);
      if (row) {
        row.shopMatchers = uniqueMatchers(
          row.shopMatchers,
          parseMatchers(raw),
        );
      }
    }
  }

  const list: ShopifyAppCredentials[] = [
    {
      id: DEFAULT_CREDENTIALS_ID,
      apiKey: defaultKey,
      apiSecret: defaultSecret,
      shopMatchers: [],
    },
  ];

  for (const [id, row] of extras) {
    const apiKey = trimEnv(row.apiKey);
    const apiSecret = trimEnv(row.apiSecret);
    if (!apiKey || !apiSecret) {
      console.warn(
        `[shopify-credentials] skipping ${id}: need both SHOPIFY_API_KEY_${id} and SHOPIFY_API_SECRET_${id}`,
      );
      continue;
    }
    list.push({
      id,
      apiKey,
      apiSecret,
      shopMatchers: uniqueMatchers(
        BUILTIN_SHOP_MATCHERS[id] ?? [],
        row.shopMatchers,
      ),
    });
  }

  // Builtin matchers still apply when the extra app exists but SHOPIFY_SHOP_MATCH_* was omitted
  for (const creds of list) {
    if (creds.id === DEFAULT_CREDENTIALS_ID) continue;
    creds.shopMatchers = uniqueMatchers(
      BUILTIN_SHOP_MATCHERS[creds.id] ?? [],
      creds.shopMatchers,
    );
  }

  return list;
}

export function listShopifyCredentials(): ShopifyAppCredentials[] {
  if (!cached) cached = scanEnv();
  return cached;
}

/** Test helper — env is otherwise cached for the process lifetime. */
export function resetShopifyCredentialsCache(): void {
  cached = null;
}

export function getDefaultShopifyCredentials(): ShopifyAppCredentials {
  const list = listShopifyCredentials();
  const found = list.find((item) => item.id === DEFAULT_CREDENTIALS_ID);
  if (!found) {
    throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }
  return found;
}

export function getShopifyCredentialsByClientId(
  clientId: string | null | undefined,
): ShopifyAppCredentials | null {
  const id = trimEnv(clientId);
  if (!id) return null;
  return (
    listShopifyCredentials().find(
      (item) => item.apiKey.toLowerCase() === id.toLowerCase(),
    ) ?? null
  );
}

export function getShopifyCredentialsByShop(
  shop: string | null | undefined,
): ShopifyAppCredentials | null {
  const domain = trimEnv(shop).toLowerCase();
  if (!domain) return null;
  for (const creds of listShopifyCredentials()) {
    if (creds.id === DEFAULT_CREDENTIALS_ID) continue;
    if (creds.shopMatchers.some((matcher) => domain.includes(matcher))) {
      return creds;
    }
  }
  return null;
}

/**
 * Pick credentials for a Shopify request:
 * 1. Client ID (session JWT `aud`, explicit client_id)
 * 2. Shop-domain substring match
 * 3. Default SHOPIFY_API_KEY / SHOPIFY_API_SECRET
 */
export function resolveShopifyCredentials(
  hints: ShopifyCredentialHints = {},
): ShopifyAppCredentials {
  const byClient = getShopifyCredentialsByClientId(hints.clientId);
  if (byClient) return byClient;

  const byShop = getShopifyCredentialsByShop(hints.shop);
  if (byShop) return byShop;

  return getDefaultShopifyCredentials();
}

/** Preferred credentials first, then the rest (for HMAC / JWT try-all). */
export function orderedShopifyCredentials(
  hints: ShopifyCredentialHints = {},
): ShopifyAppCredentials[] {
  const preferred = resolveShopifyCredentials(hints);
  const rest = listShopifyCredentials().filter(
    (item) => item.id !== preferred.id,
  );
  return [preferred, ...rest];
}

export type PeekedShopifySessionToken = {
  aud: string | null;
  destHost: string | null;
};

/**
 * Unverified JWT peek — `aud` is the app Client ID, `dest` is the shop.
 * Safe in Edge middleware (no crypto).
 */
export function peekShopifySessionToken(
  token: string | null | undefined,
): PeekedShopifySessionToken | null {
  const raw = trimEnv(token);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const payload = JSON.parse(json) as { aud?: unknown; dest?: unknown };
    const aud = typeof payload.aud === "string" ? payload.aud.trim() : null;
    let destHost: string | null = null;
    if (typeof payload.dest === "string" && payload.dest.trim()) {
      try {
        destHost = new URL(payload.dest).hostname || null;
      } catch {
        destHost = payload.dest.replace(/^https?:\/\//i, "").split("/")[0] || null;
      }
    }
    return { aud, destHost };
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  if (typeof atob === "function") {
    return atob(b64);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

export function shopifyCredentialSummary(): Array<{
  id: string;
  apiKeyPrefix: string;
  hasSecret: boolean;
  shopMatchers: string[];
}> {
  return listShopifyCredentials().map((item) => ({
    id: item.id,
    apiKeyPrefix: item.apiKey.slice(0, 8),
    hasSecret: Boolean(item.apiSecret),
    shopMatchers: item.shopMatchers,
  }));
}
