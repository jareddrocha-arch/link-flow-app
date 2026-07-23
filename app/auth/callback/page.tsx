import { redirect } from "next/navigation";

type CallbackPageProps = {
  searchParams: Promise<{
    shop?: string;
    installed?: string;
    brandKey?: string;
  }>;
};

/**
 * Legacy success URL — redirect to the main onboarding dashboard.
 */
export default async function CallbackPage({ searchParams }: CallbackPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.shop) qs.set("shop", params.shop);
  qs.set("installed", params.installed === "1" ? "1" : "1");
  qs.set("onboarding", "1");
  if (params.brandKey) qs.set("brandKey", params.brandKey);
  redirect(`/?${qs.toString()}`);
}
