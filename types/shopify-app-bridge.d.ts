/**
 * Minimal typings for Shopify App Bridge CDN global (`window.shopify`).
 * Loaded from https://cdn.shopify.com/shopifycloud/app-bridge.js
 * Full types: @shopify/app-bridge-types
 */
interface ShopifyAppBridge {
  /** Short-lived session token (JWT) for authenticating requests to the app backend */
  idToken: () => Promise<string>;
  /** Current shop / environment info when available */
  config?: {
    apiKey?: string;
    shop?: string;
    host?: string;
    locale?: string;
  };
  toast?: {
    show: (
      message: string,
      opts?: { duration?: number; isError?: boolean },
    ) => void;
  };
}

interface Window {
  shopify?: ShopifyAppBridge;
}

declare const shopify: ShopifyAppBridge | undefined;
