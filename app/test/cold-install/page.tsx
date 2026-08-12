import { ColdInstallClient } from "./cold-install-client";

type PageProps = {
  searchParams: Promise<{ key?: string }>;
};

/**
 * Internal test entry for App Store–style install (no brand key).
 *
 * Production: /test/cold-install?key=DEBUG_SECRET
 * Dev: /test/cold-install
 *
 * After OAuth: embedded app home (self-contained dashboard; no external connect).
 */
export default async function ColdInstallTestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isProd = process.env.NODE_ENV === "production";
  const expected = process.env.DEBUG_SECRET?.trim();
  const provided = params.key?.trim() || "";

  if (isProd) {
    if (!expected) {
      return (
        <div className="mx-auto max-w-md px-6 py-16 text-sm text-zinc-700">
          <h1 className="text-lg font-semibold">Cold install test disabled</h1>
          <p className="mt-2 text-zinc-600">
            Set <code className="rounded bg-zinc-100 px-1">DEBUG_SECRET</code>{" "}
            on Vercel, redeploy, then open:
          </p>
          <p className="mt-3 break-all rounded bg-zinc-50 p-2 font-mono text-xs">
            /test/cold-install?key=YOUR_DEBUG_SECRET
          </p>
        </div>
      );
    }
    if (provided !== expected) {
      return (
        <div className="mx-auto max-w-md px-6 py-16 text-sm text-zinc-700">
          <h1 className="text-lg font-semibold">Unauthorized</h1>
          <p className="mt-2 text-zinc-600">
            Open this page with your debug key:
          </p>
          <p className="mt-3 break-all rounded bg-zinc-50 p-2 font-mono text-xs">
            /test/cold-install?key=YOUR_DEBUG_SECRET
          </p>
        </div>
      );
    }
  }

  const appUrl =
    process.env.HOST?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);

  return (
    <ColdInstallClient
      debugKey={isProd ? provided : undefined}
      appOriginHint={appUrl}
    />
  );
}
