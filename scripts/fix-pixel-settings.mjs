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

const apiUrl =
  process.argv[3] ||
  "https://link-flow-app-amber.vercel.app/api/sales/track";
const settings = JSON.stringify({
  brandKey: store.brandKey,
  apiUrl,
});

const id = store.webPixelId || "gid://shopify/WebPixel/2767519992";

const res = await fetch(
  `https://${store.shop}/admin/api/2026-04/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": store.accessToken,
    },
    body: JSON.stringify({
      query: `mutation webPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
        webPixelUpdate(id: $id, webPixel: $webPixel) {
          webPixel { id settings }
          userErrors { message }
        }
      }`,
      variables: { id, webPixel: { settings } },
    }),
  },
);
const text = await res.text();
console.log(text);

const parsed = JSON.parse(text);
const pixelId = parsed?.data?.webPixelUpdate?.webPixel?.id || id;
await prisma.store.update({
  where: { id: store.id },
  data: {
    webPixelId: pixelId,
    webPixelInstalledAt: new Date(),
  },
});
console.log("saved", pixelId, settings);

await prisma.$disconnect();
await pool.end();
