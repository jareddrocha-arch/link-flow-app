/**
 * Add Store.lastReconciledAt for order reconciliation.
 *   npx tsx scripts/add-last-reconciled-at.ts
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL / DIRECT_URL");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  await pool.query(`
    ALTER TABLE "Store"
    ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);
  `);

  console.log("Store.lastReconciledAt column ready");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
