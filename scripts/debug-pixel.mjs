import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const shop = process.argv[2] || "lftesting.myshopify.com";
const store = await prisma.store.findFirst({ where: { shop } });

console.log("--- Store ---");
console.log({
  shop: store?.shop,
  status: store?.status,
  brandKey: store?.brandKey,
  hasToken: Boolean(store?.accessToken && store.accessToken.length > 10),
  tokenLen: store?.accessToken?.length ?? 0,
  scopes: store?.scopes,
  scriptTagId: store?.scriptTagId,
  webPixelId: store?.webPixelId,
  trackingInstalledAt: store?.trackingInstalledAt,
  webPixelInstalledAt: store?.webPixelInstalledAt,
  webhooksInstalledAt: store?.webhooksInstalledAt,
});

if (!store?.accessToken) {
  console.error("No access token");
  process.exit(1);
}

const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-04";
const host = process.env.HOST || "https://link-flow-app-amber.vercel.app";
const apiUrl = `${host.replace(/\/$/, "")}/api/sales/track`;
const settings = JSON.stringify({
  brandKey: store.brandKey,
  apiUrl,
});

console.log("--- Attempt webPixelCreate ---");
console.log({ apiUrl, brandKey: store.brandKey, settings });

const res = await fetch(
  `https://${store.shop}/admin/api/${apiVersion}/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": store.accessToken,
    },
    body: JSON.stringify({
      query: `
        mutation webPixelCreate($webPixel: WebPixelInput!) {
          webPixelCreate(webPixel: $webPixel) {
            webPixel { id settings }
            userErrors { field message code }
          }
        }
      `,
      variables: { webPixel: { settings } },
    }),
  },
);

const text = await res.text();
console.log("HTTP", res.status);
console.log(text);

// Also check access scopes via GraphQL
const scopeRes = await fetch(
  `https://${store.shop}/admin/api/${apiVersion}/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": store.accessToken,
    },
    body: JSON.stringify({
      query: `{ appInstallation { accessScopes { handle } } }`,
    }),
  },
);
console.log("--- Access scopes ---");
console.log(await scopeRes.text());

await prisma.$disconnect();
await pool.end();
