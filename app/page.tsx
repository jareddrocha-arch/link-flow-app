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
  }>;
};

/**
 * Embedded app home / post-install onboarding dashboard.
 *
 * Auth for API calls (in order):
 * 1. App Bridge session token via shopify.idToken() (App Store requirement)
 * 2. Short-lived server action token as fallback when not in Admin
 *
 * Third-party cookies are unreliable in the Admin iframe — do not rely on them.
 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const data = await loadMerchantDashboard(params.shop);
  const showOnboarding =
    params.onboarding === "1" ||
    params.installed === "1" ||
    (data.store?.status === "ACTIVE" && data.sales.totalCount === 0);

  // Fallback only — preferred auth is App Bridge session tokens on the client
  let actionToken: string | null = null;
  if (data.shop && data.store?.status === "ACTIVE") {
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
        />
      </div>
    </PolarisProvider>
  );
}
