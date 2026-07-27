import type { Metadata } from "next";
import Script from "next/script";
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
 * Public Client ID for App Bridge (safe to expose). Must be present in the
 * initial HTML as <meta name="shopify-api-key"> — not client-only rendered.
 */
const shopifyApiKey =
  process.env.SHOPIFY_API_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY?.trim() ||
  "";

export const metadata: Metadata = {
  title: "Link Flow Affiliates",
  description: "Shopify affiliate tracking and attribution for your store",
  // Renders <meta name="shopify-api-key" content="…"> for App Bridge CDN
  ...(shopifyApiKey
    ? { other: { "shopify-api-key": shopifyApiKey } }
    : {}),
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
      <body className="min-h-full flex flex-col bg-white">
        {/*
          Latest App Bridge from Shopify CDN, loaded before other scripts.
          beforeInteractive injects into initial HTML ahead of Next.js bundles.
          Required for App Store "Embedded app checks".
        */}
        <Script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
