# App uninstall cleanup

## Flow

1. Merchant uninstalls the app in Shopify Admin.
2. Shopify POSTs `app/uninstalled` → `{HOST}/api/webhooks/shopify`.
3. We verify HMAC, then run `cleanupShopUninstall(shop)`.

## Cleanup steps

| Step | Action |
|------|--------|
| 1 | Load `Store` + offline offline token from Supabase |
| 2 | **Best-effort** Admin API: delete Link Flow **ScriptTags** |
| 3 | **Best-effort** GraphQL: **webPixelDelete** |
| 4 | Clear `accessToken`, `scopes`, tracking IDs. Clear `brandKey` except Sincerely Silver (SS2 locked key) |
| 5 | Set `status = UNINSTALLED`, `uninstalledAt = now` |
| 6 | Write **AppEvent** audit row (`APP_UNINSTALLED`) |
| 7 | Structured `console.info` log |

Historical **Sale** / **Affiliate** / **Click** rows are kept (for reinstall analytics).  
Sincerely Silver (`sincerely-silver.myshopify.com`) keeps its locked `brandKey` so LF - SS2 can reinstall without minting a new `fb_` key or detaching website sales. Other shops still clear `brandKey`.

## Shopify automatic cleanup

When an app is uninstalled, Shopify also automatically removes:

- App-created **ScriptTags**
- App **webhooks**
- **App web pixels** (disconnected)

Often the offline token is already invalid by the time our webhook runs, so Admin API deletes may fail. That is expected; we still clear our DB and log notes.

## Testing

1. Install app → confirm ScriptTag + Web Pixel + Store row.
2. Uninstall from Shopify Admin → Apps.
3. Check Vercel logs for `[uninstall] complete`.
4. Supabase **Store**: `status = UNINSTALLED`, empty `accessToken`. `brandKey` cleared except Sincerely Silver (locked key kept).
5. Supabase **AppEvent**: type `APP_UNINSTALLED`.
6. Storefront should no longer load Link Flow scripts (Shopify + our deletes).
