import Link from "next/link";

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
  const brandKey = params.brandKey;
  const installed = params.installed === "1";

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
          <p className="mt-4 text-sm text-zinc-500">
            Offline access token and store record were saved to the database.
            You can close this window or return to the app home.
          </p>
          {brandKey ? (
            <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span className="font-medium">Brand key: </span>
              <code className="text-xs">{brandKey}</code>
            </p>
          ) : null}
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

      <div className="mt-8 flex gap-3">
        <Link
          href={shop ? `/?shop=${encodeURIComponent(shop)}` : "/"}
          className="rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Go to app home
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
