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
if (!store) {
  console.error("no store");
  process.exit(1);
}

const clientId = process.env.SHOPIFY_API_KEY;
const clientSecret = process.env.SHOPIFY_API_SECRET;

const body = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
  subject_token: store.accessToken,
  subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  requested_token_type:
    "urn:shopify:params:oauth:token-type:offline-access-token",
  expiring: "1",
});

const res = await fetch(`https://${store.shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  },
  body,
});
const json = await res.json();
console.log("migrate HTTP", res.status);
console.log(
  JSON.stringify(
    {
      hasAccess: !!json.access_token,
      hasRefresh: !!json.refresh_token,
      expires_in: json.expires_in,
      scope: json.scope,
      error: json.error,
      desc: json.error_description,
    },
    null,
    2,
  ),
);

if (!json.access_token) {
  process.exit(1);
}

await prisma.store.update({
  where: { id: store.id },
  data: {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    accessTokenExpiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    refreshTokenExpiresAt: json.refresh_token_expires_in
      ? new Date(Date.now() + json.refresh_token_expires_in * 1000)
      : null,
    scopes: json.scope || store.scopes,
    tokenUpdatedAt: new Date(),
  },
});
console.log("store updated with expiring token");

const settings = JSON.stringify({
  brandKey: store.brandKey,
  apiUrl: "https://link-flow-app-amber.vercel.app/api/sales/track",
});

const g = await fetch(
  `https://${store.shop}/admin/api/2026-04/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": json.access_token,
    },
    body: JSON.stringify({
      query: `mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          webPixel { id settings }
          userErrors { field message code }
        }
      }`,
      variables: { webPixel: { settings } },
    }),
  },
);
const gt = await g.text();
console.log("pixel HTTP", g.status);
console.log(gt);

try {
  const parsed = JSON.parse(gt);
  const id = parsed?.data?.webPixelCreate?.webPixel?.id;
  if (id) {
    await prisma.store.update({
      where: { id: store.id },
      data: {
        webPixelId: id,
        webPixelInstalledAt: new Date(),
      },
    });
    console.log("webPixelId saved", id);
  }
} catch {
  /* ignore */
}

await prisma.$disconnect();
await pool.end();
