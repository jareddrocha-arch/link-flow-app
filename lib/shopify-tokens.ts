import type { Store } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TokenResponse = {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

function getCredentials() {
  const clientId = process.env.SHOPIFY_API_KEY?.trim();
  const clientSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET");
  }
  return { clientId, clientSecret };
}

/**
 * Persist token fields on Store after OAuth or refresh.
 */
export async function saveStoreTokens(
  storeId: string,
  tokens: {
    accessToken: string;
    scope?: string | null;
    expiresIn?: number | null;
    refreshToken?: string | null;
    refreshTokenExpiresIn?: number | null;
  },
): Promise<Store> {
  const now = Date.now();
  return prisma.store.update({
    where: { id: storeId },
    data: {
      accessToken: tokens.accessToken,
      scopes: tokens.scope ?? undefined,
      accessTokenExpiresAt:
        tokens.expiresIn != null
          ? new Date(now + tokens.expiresIn * 1000)
          : null,
      refreshToken: tokens.refreshToken ?? undefined,
      refreshTokenExpiresAt:
        tokens.refreshTokenExpiresIn != null
          ? new Date(now + tokens.refreshTokenExpiresIn * 1000)
          : null,
      tokenUpdatedAt: new Date(),
    },
  });
}

/**
 * Exchange authorization code for an **expiring** offline access token.
 * Shopify Admin API rejects non-expiring tokens for many shops (2025+).
 */
export async function exchangeAuthorizationCode(options: {
  shop: string;
  code: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(
    `https://${options.shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: options.code,
        expiring: "1",
      }),
    },
  );
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token exchange failed (${res.status})`,
    );
  }
  return json;
}

/**
 * Refresh an expiring offline access token.
 */
export async function refreshOfflineToken(options: {
  shop: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(
    `https://${options.shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: options.refreshToken,
      }),
    },
  );
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token refresh failed (${res.status})`,
    );
  }
  return json;
}

/**
 * One-time migration: non-expiring offline token → expiring offline token.
 * Irreversible per shop (old token revoked).
 */
export async function migrateToExpiringOfflineToken(options: {
  shop: string;
  nonExpiringToken: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: options.nonExpiringToken,
    subject_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    requested_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    expiring: "1",
  });

  const res = await fetch(
    `https://${options.shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    },
  );
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token migration failed (${res.status})`,
    );
  }
  return json;
}

function needsRefresh(store: Store): boolean {
  // No expiry metadata → treat as legacy non-expiring (must migrate)
  if (!store.accessTokenExpiresAt && !store.refreshToken) {
    return true;
  }
  if (!store.accessTokenExpiresAt) {
    return false;
  }
  // Refresh 2 minutes before expiry
  return store.accessTokenExpiresAt.getTime() <= Date.now() + 2 * 60 * 1000;
}

/**
 * Return a valid offline access token for Admin API calls.
 * Refreshes or migrates tokens as required by Shopify.
 */
export async function getValidAccessToken(store: Store): Promise<{
  store: Store;
  accessToken: string;
}> {
  if (!store.accessToken?.trim()) {
    throw new Error("Store has no access token — reinstall the app");
  }

  if (!needsRefresh(store)) {
    return { store, accessToken: store.accessToken };
  }

  // Prefer refresh when we have a refresh token
  if (store.refreshToken) {
    if (
      store.refreshTokenExpiresAt &&
      store.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new Error(
        "Refresh token expired — merchant must reinstall / reopen the app",
      );
    }
    try {
      const tokens = await refreshOfflineToken({
        shop: store.shop,
        refreshToken: store.refreshToken,
      });
      if (!tokens.access_token) {
        throw new Error("Refresh did not return access_token");
      }
      const updated = await saveStoreTokens(store.id, {
        accessToken: tokens.access_token,
        scope: tokens.scope,
        expiresIn: tokens.expires_in,
        refreshToken: tokens.refresh_token,
        refreshTokenExpiresIn: tokens.refresh_token_expires_in,
      });
      return { store: updated, accessToken: updated.accessToken };
    } catch (e) {
      console.error("[tokens] refresh failed, trying migration", e);
    }
  }

  // Migrate legacy non-expiring token → expiring
  try {
    const tokens = await migrateToExpiringOfflineToken({
      shop: store.shop,
      nonExpiringToken: store.accessToken,
    });
    if (!tokens.access_token) {
      throw new Error("Migration did not return access_token");
    }
    const updated = await saveStoreTokens(store.id, {
      accessToken: tokens.access_token,
      scope: tokens.scope,
      expiresIn: tokens.expires_in,
      refreshToken: tokens.refresh_token,
      refreshTokenExpiresIn: tokens.refresh_token_expires_in,
    });
    console.info("[tokens] migrated store to expiring offline token", {
      shop: store.shop,
    });
    return { store: updated, accessToken: updated.accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot obtain valid Shopify access token (${msg}). Reinstall the app to grant expiring offline access and pixel scopes.`,
    );
  }
}
