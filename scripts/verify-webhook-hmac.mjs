/**
 * Local self-check for Shopify webhook HMAC verification.
 *
 * Usage (from repo root, with SHOPIFY_API_SECRET in env or .env):
 *   node scripts/verify-webhook-hmac.mjs
 *   node scripts/verify-webhook-hmac.mjs --url https://link-flow-app-amber.vercel.app/api/webhooks/shopify
 *
 * Without --url: only verifies the crypto helper locally.
 * With --url: POSTs a signed sample and an invalid sample to the live endpoint.
 */
import { createHmac } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

loadEnv();

const secret = process.env.SHOPIFY_API_SECRET?.trim();
if (!secret) {
  console.error("SHOPIFY_API_SECRET is not set");
  process.exit(1);
}

const body = JSON.stringify({
  shop_id: 1,
  shop_domain: "hmac-test.myshopify.com",
  customer: { id: 1, email: "redacted@example.com" },
  orders_to_redact: [],
});

const validHmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
const invalidHmac = createHmac("sha256", "wrong-secret")
  .update(body, "utf8")
  .digest("base64");

// Local crypto check (same algorithm as lib/webhooks.ts)
function localVerify(raw, header) {
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  return digest === header;
}

console.log("Local valid HMAC:", localVerify(body, validHmac) ? "PASS" : "FAIL");
console.log(
  "Local invalid HMAC:",
  !localVerify(body, invalidHmac) ? "PASS (rejected)" : "FAIL (accepted)",
);

const urlFlag = process.argv.indexOf("--url");
const url =
  urlFlag >= 0
    ? process.argv[urlFlag + 1]
    : process.env.WEBHOOK_TEST_URL || null;

if (!url) {
  console.log(
    "\nNo --url given. To hit production:\n  node scripts/verify-webhook-hmac.mjs --url https://link-flow-app-amber.vercel.app/api/webhooks/shopify",
  );
  process.exit(0);
}

async function post(hmac, label) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Topic": "customers/redact",
      "X-Shopify-Shop-Domain": "hmac-test.myshopify.com",
      "X-Shopify-Webhook-Id": "local-test",
    },
    body,
  });
  const text = await res.text();
  console.log(`${label}: HTTP ${res.status} — ${text.slice(0, 120)}`);
  return res.status;
}

const bad = await post(invalidHmac, "Invalid HMAC");
const good = await post(validHmac, "Valid HMAC  ");

if (bad === 401 && good === 200) {
  console.log("\nEndpoint HMAC check: PASS");
  process.exit(0);
}

console.error(
  "\nEndpoint HMAC check: FAIL (expect invalid→401, valid→200)",
);
process.exit(1);
