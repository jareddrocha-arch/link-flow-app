import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Prisma client singleton for Next.js (avoids exhausting connections in dev HMR).
 * Prisma 7 + PostgreSQL uses the driver adapter pattern.
 *
 * DATABASE_URL should be the Supabase **pooler** URL for serverless (port 6543).
 * Example:
 * postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Add your Supabase Postgres connection string to .env.local / Vercel.",
    );
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      max: process.env.NODE_ENV === "production" ? 5 : 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        connectionString.includes("localhost") ||
        connectionString.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false },
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * Lazy singleton — avoids throwing at import time during `next build`
 * when DATABASE_URL is only available at runtime.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const client = globalForPrisma.prisma;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
