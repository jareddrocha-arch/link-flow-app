# Supabase + Prisma setup (Link Flow Affiliates)

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project  
2. Note the **database password**  
3. **Settings → Database → Connection string**

Copy:

| Use | Connection | Port |
|-----|------------|------|
| `DATABASE_URL` (app runtime) | Transaction pooler | **6543** + `?pgbouncer=true` |
| `DIRECT_URL` (migrations) | Direct / Session | **5432** |

## 2. Local env (`.env.local` and `.env` for Prisma CLI)

Prisma CLI loads `.env` by default (`prisma.config.ts` uses `dotenv/config`).  
Next.js loads `.env.local`.

Put the same `DATABASE_URL` / `DIRECT_URL` in both, or symlink values.

```bash
# .env  (used by prisma CLI)
DATABASE_URL="postgresql://...pooler...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"
```

## 3. Commands

```bash
npm install
npx prisma generate
npx prisma db push
# optional UI:
npx prisma studio
```

## 4. Vercel env vars

Add for **Production** (and Preview if needed):

- `DATABASE_URL` — pooler 6543  
- `DIRECT_URL` — optional on Vercel (only needed if you run migrate there)  
- existing Shopify vars (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `HOST`, `SCOPES`, …)

Redeploy after saving.

`npm run build` runs `prisma generate && next build`.

## 5. Test install → Store row

1. Install app from production login URL  
2. Open Supabase **Table Editor → Store**  
   - or `npx prisma studio` → `Store`  
3. Or hit (local): `http://localhost:3000/api/debug/stores`  
4. Production (if `DEBUG_SECRET` set):  
   `https://link-flow-app-amber.vercel.app/api/debug/stores?key=YOUR_DEBUG_SECRET`

You should see `shop`, `brandKey`, `status: ACTIVE`, **no raw token** in debug JSON.
