# Supabase + Prisma (Link Flow Affiliates / link-flow-app)

**Project:** dedicated Supabase project `link-flow-app`  
**Ref:** `jxnfpxzujzmaydqcxnqq`  
**Region:** `us-west-1`

## Connection strings

| Env var | Use | Host |
|---------|-----|------|
| `DATABASE_URL` | App runtime + Vercel | Transaction pooler `:6543` + `?pgbouncer=true` |
| `DIRECT_URL` | `prisma db push` / migrations | Session pooler `:5432` (same host) |

Templates (replace `YOUR_DB_PASSWORD`):

```bash
DATABASE_URL="postgresql://postgres.jxnfpxzujzmaydqcxnqq:YOUR_DB_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

DIRECT_URL="postgresql://postgres.jxnfpxzujzmaydqcxnqq:YOUR_DB_PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

Optional direct host (sometimes blocked on local networks / IPv6):

```bash
# postgresql://postgres:YOUR_DB_PASSWORD@db.jxnfpxzujzmaydqcxnqq.supabase.co:5432/postgres
```

Real secrets live only in **gitignored** `.env` and `.env.local`.

## Local setup

```bash
npm install
npx prisma generate
npx prisma db push
npx prisma studio   # optional
npm run dev
```

## Vercel

Add **Production** env vars:

| Name | Value |
|------|--------|
| `DATABASE_URL` | Transaction pooler URL with password (`:6543`, `pgbouncer=true`) |
| `DIRECT_URL` | Session pooler URL with password (`:5432`) |
| Shopify vars | `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `HOST`, `SCOPES`, … |

Then **Redeploy**.

## Test after install

1. Install: `https://link-flow-app-amber.vercel.app/auth/login`
2. Supabase → **Table Editor → Store**
3. Local: `http://localhost:3000/api/debug/stores`
