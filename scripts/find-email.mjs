import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const stores = await prisma.store.findMany({
  where: {
    OR: [
      { name: { contains: "canvasvows", mode: "insensitive" } },
      { shop: { contains: "canvasvows", mode: "insensitive" } },
    ],
  },
  select: {
    id: true,
    shop: true,
    name: true,
    brandKey: true,
    status: true,
  },
});

console.log("=== Shopify app stores matching canvasvows");
console.log(JSON.stringify(stores, null, 2));

// Check if any table has email - Store model may not
const tables = await prisma.$queryRawUnsafe(
  `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ILIKE '%email%'`,
);
console.log("email columns", tables);

await prisma.$disconnect();
await pool.end();
