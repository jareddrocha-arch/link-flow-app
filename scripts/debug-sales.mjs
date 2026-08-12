import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const sales = await prisma.sale.findMany({
  orderBy: { createdAt: "desc" },
  take: 15,
  include: { store: { select: { shop: true, brandKey: true } } },
});

console.log(
  JSON.stringify(
    sales.map((s) => ({
      id: s.id,
      amt: Number(s.amount),
      orderId: s.orderId,
      productId: s.productId,
      ref: s.referralCode,
      source: s.source,
      shop: s.store.shop,
      brandKey: s.store.brandKey,
      at: s.createdAt,
    })),
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
