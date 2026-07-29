import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
const shopifyApiKey =
  process.env.SHOPIFY_API_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY?.trim() ||
  // Public client_id from shopify.app.toml (safe fallback so meta is never empty)
  "83757e483b8c48497463e2e97b377aff";

export const metadata: Metadata = {
  title: "Link Flow Affiliates",
  description: "Shopify affiliate tracking and attribution for your store",
  other: {
    "shopify-api-key": shopifyApiKey,
  },
};

// Privacy policy is public at /privacy for Partner Dashboard + merchant review

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
