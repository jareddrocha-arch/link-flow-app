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

const query = `
{
  currentAppInstallation {
    id
    app {
      id
      title
      handle
      apiKey
    }
  }
  app {
    id
    title
    handle
    apiKey
  }
}
`;

const res = await fetch(
  `https://${store.shop}/admin/api/2026-04/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": store.accessToken,
    },
    body: JSON.stringify({ query }),
  },
);
console.log(await res.text());
console.log("env client id", process.env.SHOPIFY_API_KEY);

await prisma.$disconnect();
await pool.end();
