import { headers } from "next/headers";
import { PolarisProvider } from "@/components/polaris-provider";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { loadMerchantDashboard } from "@/lib/dashboard";
import { createShopActionToken } from "@/lib/shop-session";

type HomeProps = {
  searchParams: Promise<{
    shop?: string;
    host?: string;
    id_token?: string;
    embedded?: string;
    onboarding?: string;
    installed?: string;
    connected?: string;
    brandKey?: string;
    brand_key?: string;
  }>;
};

/**
 * Embedded app home / post-install onboarding dashboard.
 *
 * - Store installed but no brandKey → BrandConnectScreen (signup/login)
 * - brandKey already set (e.g. Link Flow Setup install) → normal dashboard
 *
 * Merchant data is only loaded when authorized (session JWT or signed cookie).
 * Action tokens are only issued after that gate passes.
 *
 * Auth for API calls (in order):
 * 1. App Bridge session token via shopify.idToken() (App Store requirement)
 * 2. Short-lived server action token as fallback when not in Admin
 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || "https";
  const requestUrl = host ? `${proto}://${host}` : undefined;

  const data = await loadMerchantDashboard({
    shop: params.shop,
    idToken: params.id_token,
    requestUrl,
  });

  const showOnboarding =
    params.onboarding === "1" ||
    params.installed === "1" ||
    (data.store?.status === "ACTIVE" && data.sales.totalCount === 0);
  const justConnected = params.connected === "1";

  // Only issue action tokens when the viewer is authorized for this shop
  let actionToken: string | null = null;
  if (
    !data.authRequired &&
    data.shop &&
    data.store?.status === "ACTIVE"
  ) {
    try {
      actionToken = createShopActionToken(data.shop);
    } catch {
      actionToken = null;
    }
  }

  return (
    <PolarisProvider>
      <div style={{ minHeight: "100%", background: "var(--p-color-bg)" }}>
        <MerchantDashboard
          data={data}
          showOnboarding={showOnboarding}
          actionToken={actionToken}
          justConnected={justConnected}
          brandKeyFromQuery={
            params.brandKey?.trim() || params.brand_key?.trim() || null
          }
        />
      </div>
    </PolarisProvider>
  );
}
