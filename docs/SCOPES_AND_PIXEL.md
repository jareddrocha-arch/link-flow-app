# Scopes & Web Pixel checklist

## Required scopes (minimal)

```text
read_orders,write_script_tags,write_pixels,read_customer_events
```

| Scope | Used for |
|--------|-----------|
| `write_pixels` | Create / connect the app Web Pixel |
| `read_customer_events` | Required for `webPixelCreate` |
| `write_script_tags` | Storefront first-click ScriptTag |
| `read_orders` | Optional `orders/paid` + `orders/create` webhook backup (order id, amount, line item titles only — **no** customer email/name/phone stored) |

**Not requested:** `read_products`, `read_customers`, or other customer PII scopes.  
Product names come from the web pixel / webhook payload, not Admin Product APIs.

## Two places must match

1. **Shopify Dev Dashboard** → your app → **Versions** → latest release  
   - Access scopes must match the list above
2. **Vercel** `SCOPES` env (or rely on code defaults that merge these in)

Then: **uninstall + reinstall** on the shop so Shopify grants the new list.

### How to check after reinstall

App dashboard → **Your store → Permissions**  
Must include `write_pixels` and `read_customer_events`.

## Protected customer data (order webhooks only)

`orders/paid` and `orders/create` webhooks need **Protected customer data** access if Shopify classifies the payload as PCD:

1. Partner / Dev Dashboard → App → **API access** / **Protected customer data**
2. Request access (for development stores this is often a self-serve toggle / form)
3. Until approved, order webhooks return 403 — **that is OK**  
   Thank-you tracking still works via **Web Pixel** once pixel scopes are granted.

In Partner data-use forms: state that you only need order identifiers and amounts for attribution, **not** customer contact details.

Compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are configured via `shopify.app.toml` + `shopify app deploy`, not REST.

## After fixing scopes

```text
shopify app deploy --allow-updates
# wait for Vercel deploy if you changed code
# uninstall app on test shop
# install again — watch for NEW permission checkboxes
# Refresh tracking
```
