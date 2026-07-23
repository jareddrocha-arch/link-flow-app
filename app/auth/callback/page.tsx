import Link from "next/link";
import { getStoreByShop } from "@/lib/stores";

type CallbackPageProps = {
  searchParams: Promise<{
    shop?: string;
    installed?: string;
    brandKey?: string;
  }>;
};

export default async function CallbackPage({ searchParams }: CallbackPageProps) {
  const params = await searchParams;
  const shop = params.shop;
  const brandKeyFromQuery = params.brandKey;
  const installed = params.installed === "1";

  // Live DB check so success page proves the Store row exists
  let dbStore: Awaited<ReturnType<typeof getStoreByShop>> = null;
  let dbError: string | null = null;
  if (shop && installed) {
    try {
      dbStore = await getStoreByShop(shop);
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Database lookup failed";
    }
  }

  const brandKey = dbStore?.brandKey ?? brandKeyFromQuery ?? null;
  const savedInDb = Boolean(dbStore);

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
      {installed ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            Installation successful
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {shop
              ? `Link Flow Affiliates is now installed on ${shop}.`
              : "Link Flow Affiliates is now installed."}
          </p>

          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              savedInDb
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {savedInDb ? (
              <>
                <p className="font-medium">Database: Store row found ✓</p>
                <ul className="mt-1 list-inside list-disc text-xs opacity-90">
                  <li>status: {dbStore?.status}</li>
                  {brandKey ? <li>brandKey: {brandKey}</li> : null}
                  {dbStore?.installedAt ? (
                    <li>installedAt: {dbStore.installedAt.toISOString()}</li>
                  ) : null}
                </ul>
              </>
            ) : (
              <>
                <p className="font-medium">Database: Store row not found</p>
                <p className="mt-1 text-xs">
                  {dbError
                    ? `Error: ${dbError}`
                    : "OAuth may have succeeded but the row was not saved. Check DATABASE_URL on Vercel and Supabase Table Editor → public → Store."}
                </p>
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Tip: In Supabase, open schema <strong>public</strong> and table{" "}
            <strong>Store</strong> (capital S). Also try{" "}
            <Link href="/api/health" className="underline">
              /api/health
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            OAuth callback
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Complete installation from the login page. Shopify will redirect
            here after a successful OAuth exchange.
          </p>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={shop ? `/?shop=${encodeURIComponent(shop)}` : "/"}
          className="rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Go to app home
        </Link>
        <Link
          href="/api/health"
          className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50"
        >
          Check database
        </Link>
        <Link
          href="/auth/login"
          className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50"
        >
          Install another store
        </Link>
      </div>
    </div>
  );
}
