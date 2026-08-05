/**
 * Client-only helpers for Shopify OAuth / install (browser).
 * Keep free of server-only imports.
 */

/**
 * Build the app OAuth begin URL (server will redirect to Shopify authorize).
 */
export function buildOAuthBeginUrl(options: {
  shop: string;
  brandKey?: string | null;
  cold?: boolean;
  origin?: string;
}): string {
  const origin =
    options.origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL("/api/auth", origin || "https://localhost");
  url.searchParams.set("shop", options.shop);
  if (options.cold) {
    url.searchParams.set("cold", "1");
  } else if (options.brandKey?.trim()) {
    url.searchParams.set("brandKey", options.brandKey.trim());
  }
  return url.toString();
}

/**
 * Navigate the **top-level** browsing context to `href`.
 * Critical: never use window.location inside Shopify Admin iframe — that
 * loads accounts.shopify.com framed and fails with "refused to connect".
 */
export function navigateTopLevel(href: string): void {
  if (typeof window === "undefined") return;

  // 1) <a target="_top"> — most reliable breakout when window.top is cross-origin
  try {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_top";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* continue */
  }

  // 2) window.open with _top
  try {
    window.open(href, "_top");
  } catch {
    /* continue */
  }

  // 3) Direct top.location when accessible
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = href;
      return;
    }
  } catch {
    /* cross-origin — continue */
  }

  // 4) New tab as last resort (still not framed)
  try {
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (w) return;
  } catch {
    /* continue */
  }

  // 5) Same-frame only if we are already top-level (standalone login page)
  if (window.top === window.self) {
    window.location.assign(href);
  }
}

/**
 * Start OAuth at the **top level** so accounts.shopify.com is not framed
 * (fixes "refused to connect" inside Admin iframe / review environments).
 */
export function startTopLevelOAuth(options: {
  shop: string;
  brandKey?: string | null;
  cold?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const href = buildOAuthBeginUrl({
    shop: options.shop,
    brandKey: options.brandKey,
    cold: options.cold,
    origin: window.location.origin,
  });
  navigateTopLevel(href);
}

/**
 * Bootstrap install using App Bridge session token (managed install).
 * Returns parsed JSON body; throws on network failure.
 */
export async function bootstrapFromSessionToken(options: {
  shop: string;
  sessionToken: string;
  brandKey?: string | null;
}): Promise<{
  ok: boolean;
  shop?: string;
  installed?: boolean;
  brandKey?: string | null;
  needsBrandConnect?: boolean;
  needsOAuth?: boolean;
  error?: string;
  code?: string;
}> {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.sessionToken}`,
    },
    credentials: "include",
    body: JSON.stringify({
      shop: options.shop,
      brandKey: options.brandKey || undefined,
    }),
  });

  // 404 = old deploy without bootstrap route
  if (res.status === 404) {
    return {
      ok: false,
      needsOAuth: true,
      error:
        "Install bootstrap API missing on this deploy (404). Redeploy the app.",
      code: "bootstrap_not_deployed",
    };
  }

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    shop?: string;
    installed?: boolean;
    brandKey?: string | null;
    needsBrandConnect?: boolean;
    needsOAuth?: boolean;
    error?: string;
    code?: string;
  };
  return {
    ok: Boolean(body.ok && res.ok),
    shop: body.shop,
    installed: body.installed,
    brandKey: body.brandKey,
    needsBrandConnect: body.needsBrandConnect,
    needsOAuth: body.needsOAuth ?? !res.ok,
    error: body.error,
    code: body.code,
  };
}

/** Reload the embedded app home with shop + optional host preserved. */
export function reloadAppHome(shop: string, extra?: Record<string, string>) {
  if (typeof window === "undefined") return;
  const url = new URL("/", window.location.origin);
  url.searchParams.set("shop", shop);
  const host = new URLSearchParams(window.location.search).get("host");
  if (host) url.searchParams.set("host", host);
  const embedded = new URLSearchParams(window.location.search).get("embedded");
  if (embedded) url.searchParams.set("embedded", embedded);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  window.location.replace(url.toString());
}

/** True when URL looks like Shopify Admin embedded open. */
export function isEmbeddedAdminOpen(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return Boolean(q.get("host") || q.get("embedded") === "1" || q.get("id_token"));
}
