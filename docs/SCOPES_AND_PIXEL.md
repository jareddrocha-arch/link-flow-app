# Scopes & Web Pixel checklist

## Required scopes

```text
read_products,read_orders,write_script_tags,write_pixels,read_customer_events
```

| Scope | Used for |
|--------|-----------|
| `write_pixels` | Create / connect the app Web Pixel |
| `read_customer_events` | **Also required** for `webPixelCreate` |
| `write_script_tags` | Storefront first-click ScriptTag |
| `read_orders` | Order data (and order webhooks if allowed) |
| `read_products` | Product fields on sales |

## Two places must match

1. **Shopify Dev Dashboard** → your app → **Versions** → latest release  
   - Access scopes must include `write_pixels` **and** `read_customer_events`
2. **Vercel** `SCOPES` env (or rely on code defaults that merge these in)

Then: **uninstall + reinstall** on the shop so Shopify grants the new list.

### How to check after reinstall

App dashboard → **Your store → Permissions**  
Must include both `write_pixels` and `read_customer_events`.

If only `write_pixels` is present, Shopify never granted `read_customer_events` (usually missing from the **app version** scopes in Dev Dashboard).

## Protected customer data (order webhooks only)

`orders/paid` and `orders/create` webhooks need **Protected customer data** access:

1. Partner / Dev Dashboard → App → **API access** / **Protected customer data**
2. Request access (for development stores this is often a self-serve toggle / form)
3. Until approved, order webhooks return 403 — **that is OK**  
   Thank-you tracking still works via **Web Pixel** once pixel scopes are granted.

Compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are configured via `shopify.app.toml` + `shopify app deploy`, not REST.

## After fixing scopes

```text
shopify app deploy --allow-updates
# wait for Vercel deploy if you changed code
# uninstall app on test shop
# install again — watch for NEW permission checkboxes
# Refresh tracking
```
