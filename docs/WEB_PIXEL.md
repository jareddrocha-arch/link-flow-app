# Link Flow Web Pixel

Records **every** completed checkout (not only referred orders) on the thank-you / order status flow via Shopify’s Customer Events API.

## What it does

| Event | Behavior |
|--------|----------|
| `page_viewed` | Captures first-click `fa_ref` into cookie/localStorage when present; if thank-you + checkout payload, tracks sale |
| `checkout_completed` | Always POSTs sale to `/api/sales/track` with brandKey, orderId, amount, currency, product info, and optional `fa_ref` |
| `all_standard_events` | Diagnostic logs for checkout_* events in the pixel console |

The sales API stores the row in Supabase and optionally forwards to the main Link Flow backend.

## Why the Thank You Network tab is empty

**This is expected.** App web pixels run inside Shopify’s **strict sandbox iframe**. Their `fetch()` / `sendBeacon` calls:

- **Do not** show up under the main Thank You page **Network** tab
- **Do** run against `https://link-flow-app-amber.vercel.app/api/sales/track` (or your `HOST`) from the sandbox
- **Do** log to the console with the prefix `[Link Flow Pixel]`

### How to verify the pixel is actually firing

1. **Console (best first check)**  
   Open DevTools on the Thank You page → Console → filter `Link Flow Pixel`.  
   You should see:
   - `boot` with `brandKey` and `apiUrl`
   - `event checkout_completed`
   - `POST https://…/api/sales/track`
   - `response 200` (or similar)

   If the console is empty, the pixel is not loading (privacy, disconnected, or stale app version).

2. **Sandbox Network (optional)**  
   In Chrome DevTools → top bar JavaScript context / frame selector → pick the `web-pixel` / `wpm` sandbox frame → Network → filter `sales/track` or `vercel.app`.

3. **Shopify Admin**  
   **Settings → Customer events → App pixels** → Link Flow should be **Connected**. Open the pixel and use Shopify’s test tools if available.

4. **Server truth**  
   After a real checkout: Supabase `Sale` table or the app dashboard **Recent sales**. That is the authoritative success check.

### What does *not* mean the pixel failed

| Observation | Meaning |
|-------------|---------|
| Zero requests on main Thank You Network tab | Normal — sandbox isolation |
| `fa_ref` cookie is set | ScriptTag / storefront attribution works; independent of pixel POST |
| Shopify order exists | Checkout succeeded; pixel is a separate client-side layer |
| Dashboard Web Pixel = Ready | We stored a `webPixelId` — not proof a given order was tracked |

## Files

```
extensions/link-flow-web-pixel/
  shopify.extension.toml   # settings: brandKey, apiUrl; privacy all false (strictly necessary)
  src/index.js             # pixel runtime
  package.json
shopify.app.toml           # scopes include write_pixels, read_customer_events
```

## Privacy (must stay strictly necessary)

```toml
[customer_privacy]
analytics = false
marketing = false
preferences = false
sale_of_data = "disabled"
```

If any purpose is `true`, Shopify may **not load** the pixel until the visitor consents — which looks exactly like “no network requests.”

## One-time deploy (required)

Web pixels must be published as an **app extension** (not only on Vercel):

```bash
# From repo root (requires Shopify CLI + Partner app access)
shopify app deploy
```

Client ID in `shopify.app.toml` must match the installed app (`83757e483b8c48497463e2e97b377aff`).

Then ensure Vercel scopes include:

```env
SCOPES=read_products,read_orders,write_script_tags,write_pixels,read_customer_events
```

## Activation (automatic after install)

On OAuth callback, `provisionStoreTracking` calls GraphQL `webPixelCreate` / `webPixelUpdate` with:

```json
{
  "brandKey": "fb_…",
  "apiUrl": "https://link-flow-app-amber.vercel.app/api/sales/track"
}
```

Check: **Shopify Admin → Settings → Customer events → App pixels** → Connected.

## Re-run provision

```http
POST /api/admin/provision?shop=lftesting.myshopify.com
```

(with shop session / action token, or `?key=DEBUG_SECRET` in production)

## Layers of tracking

1. **Web Pixel** — modern checkout / thank-you (this extension) — primary  
2. **ScriptTag** — storefront first-click only (`/tracking.js?k=…`); does **not** run on checkout thank-you for Checkout Extensibility  
3. **Webhooks** — `orders/paid` + `orders/create` need Protected Customer Data approval (optional backup)

## Troubleshooting checklist

1. Console shows `[Link Flow Pixel] boot` with non-empty `brandKey`?  
2. Console shows `event checkout_completed` after purchase?  
3. Console shows `POST` + `response 200`?  
4. If boot missing → Customer events status, re-deploy extension, re-provision, privacy purposes false.  
5. If event missing → Shopify may not emit `checkout_completed` (thank-you additional scripts conflict is a known edge case); check Customer events debugger.  
6. If POST + 4xx → check brandKey format (`fb_…`) and amount payload in console.  
7. Sale still missing after 200 → check Supabase / `recordStoreSale` logs on Vercel.
