import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import {
  getDefaultShopifyCredentials,
  resolveShopifyCredentials,
} from "@/lib/shopify-credentials";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Public Client ID for App Bridge (safe to expose).
 * Must appear in the INITIAL HTML as:
 *   <meta name="shopify-api-key" content="...">
 *   <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
 * Do not load App Bridge via next/script — that rewrites to a preload +
 * (self.__next_s||[]).push(...) which Partner "Embedded app checks" miss.
 */
const TOML_CLIENT_ID_FALLBACK = "83757e483b8c48497463e2e97b377aff";

function fallbackShopifyApiKey(): string {
  try {
    return getDefaultShopifyCredentials().apiKey;
  } catch {
    return (
      process.env.SHOPIFY_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SHOPIFY_API_KEY?.trim() ||
      TOML_CLIENT_ID_FALLBACK
    );
  }
}

async function resolveLayoutApiKey(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-shopify-api-key")?.trim();
    if (forwarded) return forwarded;
    const shop = headerList.get("x-shopify-shop-domain")?.trim();
    const clientId = headerList.get("x-shopify-client-id")?.trim();
    if (shop || clientId) {
      return resolveShopifyCredentials({ clientId, shop }).apiKey;
    }
    return fallbackShopifyApiKey();
  } catch {
    return fallbackShopifyApiKey();
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const shopifyApiKey = await resolveLayoutApiKey();
  return {
    title: "Link Flow Affiliates",
    description: "Shopify affiliate tracking and attribution for your store",
    other: {
      "shopify-api-key": shopifyApiKey,
    },
  };
}

// Privacy policy is public at /privacy for Partner Dashboard + merchant review

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey = await resolveLayoutApiKey();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Official App Bridge bootstrap for embedded apps.
          Must be literal tags in the first HTML response (not injected after
          hydration). Partner automated checks look for these exact patterns.
        */}
        <meta name="shopify-api-key" content={shopifyApiKey} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Shopify requires sync CDN load in initial HTML */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body className="min-h-full flex flex-col bg-white">{children}</body>
    </html>
  );
}
