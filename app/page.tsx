import { PolarisProvider } from "@/components/polaris-provider";
import { MerchantDashboard } from "@/components/merchant-dashboard";
import { loadMerchantDashboard } from "@/lib/dashboard";

type HomeProps = {
  searchParams: Promise<{ shop?: string; host?: string }>;
};

/**
 * Embedded app home — shown when merchants open the app in Shopify Admin
 * (and when visiting the app URL with ?shop=).
 */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const data = await loadMerchantDashboard(params.shop);

  return (
    <PolarisProvider>
      <div style={{ minHeight: "100%", background: "var(--p-color-bg)" }}>
        <MerchantDashboard
          data={data}
          // Only expose debug secret to client in non-production for re-provision;
          // production re-provision uses DEBUG_SECRET via server if you wire it later.
          debugSecret={
            process.env.NODE_ENV === "production"
              ? null
              : process.env.DEBUG_SECRET ?? null
          }
        />
      </div>
    </PolarisProvider>
  );
}
