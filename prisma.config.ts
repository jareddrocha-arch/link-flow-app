import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI config.
 *
 * For migrations / db push against Supabase, prefer the **direct** connection
 * (port 5432, often labeled "Direct connection" in Supabase).
 *
 * Runtime (Vercel serverless) should use the pooled URL in DATABASE_URL
 * (port 6543 + pgbouncer) via lib/prisma.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer DIRECT_URL for migrate/db push; fall back to DATABASE_URL
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
