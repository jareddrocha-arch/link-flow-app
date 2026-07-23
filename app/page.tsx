import { PolarisProvider } from "@/components/polaris-provider";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { loadMerchantDashboard } from "@/lib/dashboard";

type HomeProps = {
  searchParams: Promise<{
    shop?: string;
    host?: string;
    onboarding?: string;
    installed?: string;
  }>;
};

/**
 * Embedded app home / post-install onboarding dashboard.
 * Opened from Shopify Admin or after OAuth with ?shop=…&onboarding=1
 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const data = await loadMerchantDashboard(params.shop);
  const showOnboarding =
    params.onboarding === "1" ||
    params.installed === "1" ||
    (data.store?.status === "ACTIVE" && data.sales.totalCount === 0);

  return (
    <PolarisProvider>
      <div style={{ minHeight: "100%", background: "var(--p-color-bg)" }}>
        <MerchantDashboard data={data} showOnboarding={showOnboarding} />
      </div>
    </PolarisProvider>
  );
}
