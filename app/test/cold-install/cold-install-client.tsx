"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Props = {
  debugKey?: string;
  appOriginHint?: string | null;
};

/**
 * Form that starts Shopify OAuth with no brandKey (cold / App Store path).
 */
export function ColdInstallClient({ debugKey, appOriginHint }: Props) {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    let normalized = shop.trim().toLowerCase();
    if (!normalized) {
      setError("Enter a development store domain.");
      return;
    }
    if (!normalized.includes(".")) {
      normalized = `${normalized}.myshopify.com`;
    }

    // Intentionally omit brandKey — App Store cold install
    const url = new URL("/api/auth", window.location.origin);
    url.searchParams.set("shop", normalized);
    url.searchParams.set("cold", "1");
    window.location.href = url.toString();
  };

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : appOriginHint || "https://link-flow-app-amber.vercel.app";

  const pagePath = debugKey
    ? `/test/cold-install?key=${encodeURIComponent(debugKey)}`
    : "/test/cold-install";

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Internal test only
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Cold App Store install
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Starts a normal Shopify OAuth install <strong>without</strong> a brand
        key — same as installing from the App Store. After approve, you should
        land on the embedded app home and see{" "}
        <strong>Connect your brand</strong> (signup / login).
      </p>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <p className="font-medium">Does not break Setup installs</p>
        <p className="mt-1">
          Installs from Link Flow Setup still pass{" "}
          <code className="rounded bg-amber-100 px-1">brandKey</code> and skip
          this screen when a key is already linked.
        </p>
      </div>

      {error ? (
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium" htmlFor="shop">
          Development store domain
        </label>
        <input
          id="shop"
          name="shop"
          type="text"
          required
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-dev-store.myshopify.com"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2"
          autoComplete="off"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Install without brand key
        </button>
      </form>

      <div className="mt-8 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        <p className="font-semibold text-zinc-800">Bookmark this page</p>
        <p>
          <code className="break-all rounded bg-white px-1 py-0.5">
            {origin}
            {pagePath}
          </code>
        </p>
        <p className="pt-2 font-semibold text-zinc-800">
          Or OAuth URL (no brandKey)
        </p>
        <p>
          <code className="break-all rounded bg-white px-1 py-0.5">
            {origin}/api/auth?shop=YOUR-STORE.myshopify.com
          </code>
        </p>
        <p className="text-zinc-500">
          Compare with Setup install:{" "}
          <code className="rounded bg-white px-1">
            /api/auth?shop=…&amp;brandKey=fb_…
          </code>
        </p>
        <p className="pt-2 text-zinc-500">
          Tip: if the store already has a locked brand key, uninstall the app
          first (or use a clean dev store) so the Connect screen can appear.
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/" className="underline">
          ← App home
        </Link>
        {" · "}
        <Link href="/auth/login" className="underline">
          Standard login install
        </Link>
      </p>
    </div>
  );
}
