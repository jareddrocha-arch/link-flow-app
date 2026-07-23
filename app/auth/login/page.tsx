"use client";

import { FormEvent, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const reason = searchParams.get("reason");
  const detail = searchParams.get("detail");
  const [shop, setShop] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let normalized = shop.trim().toLowerCase();
    if (!normalized) return;

    // Accept "mystore" or "mystore.myshopify.com"
    if (!normalized.includes(".")) {
      normalized = `${normalized}.myshopify.com`;
    }

    window.location.href = `/api/auth?shop=${encodeURIComponent(normalized)}`;
  };

  const errorMessage =
    error === "missing_shop"
      ? "Please enter a valid shop domain."
      : error === "oauth_begin_failed"
        ? "Could not start installation. Check your app credentials and try again."
        : error === "oauth_callback_failed"
          ? reason === "invalid_hmac"
            ? "OAuth HMAC failed. In Vercel, set SHOPIFY_API_SECRET to the Client secret from the same app as SHOPIFY_API_KEY (re-copy, no spaces/quotes, then redeploy)."
            : reason === "hmac_timestamp"
              ? "Install took too long and the OAuth signature expired. Try again and approve the app within about a minute."
            : reason === "state_mismatch"
              ? "Install session expired or cookies were blocked. Try again and complete install within 10 minutes."
              : reason === "token_exchange_failed"
                ? "Shopify rejected the token exchange. Confirm Client ID and Secret are for the same app."
                : "Installation failed during OAuth callback. Ensure App URL, HOST, and redirect URL all use the same domain."
          : error
            ? "Something went wrong. Please try again."
            : null;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-6 text-sm text-zinc-500 hover:text-zinc-800">
        ← Back home
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        Install Link Flow Affiliates
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Enter your Shopify store domain to start the OAuth install flow.
      </p>

      {errorMessage ? (
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          <p>{errorMessage}</p>
          {reason ? (
            <p className="mt-1 text-xs opacity-80">Code: {reason}</p>
          ) : null}
          {detail ? (
            <p className="mt-1 break-all text-xs opacity-70">{detail}</p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium" htmlFor="shop">
          Shop domain
        </label>
        <input
          id="shop"
          name="shop"
          type="text"
          required
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="mystore.myshopify.com"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2"
          autoComplete="off"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          Install on Shopify Store
        </button>
      </form>

      <p className="mt-6 text-xs text-zinc-500">
        OAuth callback URL must be allowed in the Partner Dashboard:
        <br />
        <code className="mt-1 inline-block rounded bg-zinc-100 px-1 py-0.5">
          {"{HOST}"}/api/auth/callback
        </code>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-zinc-500">Loading login…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
