# Link Flow Web Pixel

Records **every** completed checkout (not only referred orders) on the thank-you / order status flow via Shopify’s Customer Events API.

## What it does

| Event | Behavior |
|--------|----------|
| `page_viewed` | Captures first-click `fa_ref` into cookie/localStorage when present |
| `checkout_completed` | Always POSTs sale to `/api/sales/track` with brandKey, orderId, amount, currency, product info, and optional `fa_ref` |

The sales API stores the row in Supabase and optionally forwards to the main Link Flow backend.

## Files

```
extensions/link-flow-web-pixel/
  shopify.extension.toml   # settings: brandKey, apiUrl
  src/index.js             # pixel runtime
  package.json
shopify.app.toml           # scopes include write_pixels, read_customer_events
```

## One-time deploy (required)

Web pixels must be published as an **app extension** (not only on Vercel):

```bash
# From repo root (requires Shopify CLI + Partner app access)
npm install -g @shopify/cli @shopify/app
shopify auth login
shopify app deploy
```

Then update Vercel / `.env` scopes (and reinstall the app on the store):

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

(with shop session cookie or `?key=DEBUG_SECRET` in production)

## Layers of tracking

1. **Web Pixel** — modern checkout / thank-you (this extension)  
2. **ScriptTag** — storefront first-click (`/tracking.js?k=…`)  
3. **Webhooks** — `orders/paid` + `orders/create` server-side backup  
