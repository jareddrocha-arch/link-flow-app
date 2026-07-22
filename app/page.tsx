import Link from "next/link";

type HomeProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { shop } = await searchParams;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-zinc-500">Link Flow Affiliates</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Shopify app
      </h1>
      <p className="mt-3 text-zinc-600">
        Basic app structure with Shopify OAuth authentication is ready.
        {shop ? (
          <>
            {" "}
            Connected shop: <strong>{shop}</strong>.
          </>
        ) : null}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/auth/login"
          className="rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Install on Shopify Store
        </Link>
        <Link
          href="/auth/callback"
          className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50"
        >
          View callback page
        </Link>
      </div>

      <div className="mt-10 space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <p className="font-medium">OAuth routes</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-600">
            <li>
              <code>/auth/login</code> — enter shop domain
            </li>
            <li>
              <code>/api/auth</code> — start OAuth redirect
            </li>
            <li>
              <code>/api/auth/callback</code> — exchange code for access token
            </li>
            <li>
              <code>/auth/callback</code> — installation success UI
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <p className="font-medium">Tracking (brandKey system)</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-600">
            <li>
              <code>/api/tracking.js?k=fb_…</code> — first-click + Shopify thank-you
              auto-detect
            </li>
            <li>
              <code>/api/tracking.js?k=fb_…&amp;ty=1</code> — force thank-you detection
            </li>
            <li>
              <code>POST /api/sales/track</code> — receives sales; forwards to Link Flow
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
