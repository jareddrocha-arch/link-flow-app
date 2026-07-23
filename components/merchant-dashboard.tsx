"use client";

import { useCallback, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalIcon,
  ClipboardIcon,
} from "@shopify/polaris-icons";
import type { MerchantDashboardData } from "@/lib/dashboard";

type Props = {
  data: MerchantDashboardData;
  debugSecret?: string | null;
};

export function MerchantDashboard({ data, debugSecret }: Props) {
  const [copied, setCopied] = useState<"brand" | "script" | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);

  const copy = useCallback(async (text: string, which: "brand" | "script") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const reProvision = useCallback(async () => {
    if (!data.shop) return;
    setProvisioning(true);
    setProvisionMsg(null);
    try {
      const qs = new URLSearchParams({ shop: data.shop });
      if (debugSecret) qs.set("key", debugSecret);
      const res = await fetch(`/api/admin/provision?${qs.toString()}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProvisionMsg(body.error || "Failed to re-install tracking");
      } else {
        setProvisionMsg(
          `Tracking updated. ScriptTag: ${body.scriptTagId ?? "n/a"}. Webhooks: ${(body.webhooks || []).join(", ") || "none"}.`,
        );
        // Refresh so statuses update
        window.location.reload();
      }
    } catch (e) {
      setProvisionMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setProvisioning(false);
    }
  }, [data.shop, debugSecret]);

  if (data.needsInstall || !data.store) {
    return (
      <Page title="Link Flow Affiliates">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading={
                  data.shop
                    ? `Connect ${data.shop}`
                    : "Install Link Flow on your store"
                }
                action={{
                  content: "Install app",
                  url: data.shop
                    ? `/api/auth?shop=${encodeURIComponent(data.shop)}`
                    : "/auth/login",
                }}
                secondaryAction={{
                  content: "Open install page",
                  url: "/auth/login",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Install Link Flow Affiliates to inject tracking automatically,
                  attribute affiliate sales, and manage your brand key.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const store = data.store;
  const scriptOk = data.tracking.scriptTag === "ok";
  const webhooksOk = data.tracking.webhooks === "ok";

  const salesRows = data.sales.recent.map((s) => [
    s.orderId || s.id.slice(0, 8),
    s.amount,
    s.commission,
    s.referralCode || "—",
    s.status,
    new Date(s.createdAt).toLocaleString(),
  ]);

  return (
    <Page
      title="Link Flow Affiliates"
      subtitle={store.name}
      primaryAction={{
        content: "Open Link Flow dashboard",
        url: data.linkFlowDashboardUrl,
        external: true,
        icon: ExternalIcon,
      }}
      secondaryActions={[
        {
          content: provisioning ? "Updating…" : "Re-install tracking",
          onAction: reProvision,
          loading: provisioning,
          disabled: provisioning,
        },
      ]}
    >
      <BlockStack gap="400">
        {provisionMsg ? (
          <Banner
            title="Tracking setup"
            tone={provisionMsg.startsWith("Tracking updated") ? "success" : "warning"}
            onDismiss={() => setProvisionMsg(null)}
          >
            <p>{provisionMsg}</p>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Store
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued">
                        Domain
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {store.shop}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued">
                        Status
                      </Text>
                      <Badge
                        tone={store.status === "ACTIVE" ? "success" : "attention"}
                      >
                        {store.status}
                      </Badge>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued">
                        Installed
                      </Text>
                      <Text as="span">
                        {new Date(store.installedAt).toLocaleDateString()}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Brand key
                  </Text>
                  <Text as="p" tone="subdued">
                    Used by the tracking script and thank-you page attribution.
                  </Text>
                  {store.brandKey ? (
                    <BlockStack gap="200">
                      <Box
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <Text as="p" variant="bodyMd" fontWeight="bold" breakWord>
                          {store.brandKey}
                        </Text>
                      </Box>
                      <InlineStack gap="200">
                        <Button
                          icon={ClipboardIcon}
                          onClick={() => copy(store.brandKey!, "brand")}
                        >
                          {copied === "brand" ? "Copied" : "Copy brand key"}
                        </Button>
                        {data.trackingScriptUrl ? (
                          <Button
                            onClick={() =>
                              copy(data.trackingScriptUrl!, "script")
                            }
                          >
                            {copied === "script" ? "Copied" : "Copy script URL"}
                          </Button>
                        ) : null}
                      </InlineStack>
                    </BlockStack>
                  ) : (
                    <Banner tone="warning" title="No brand key">
                      <p>Re-install the app to generate a brand key.</p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Tracking status
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon
                          source={scriptOk ? CheckCircleIcon : AlertCircleIcon}
                          tone={scriptOk ? "success" : "caution"}
                        />
                        <Text as="span" fontWeight="semibold">
                          ScriptTag
                        </Text>
                        <Badge tone={scriptOk ? "success" : "attention"}>
                          {scriptOk ? "Active" : "Missing"}
                        </Badge>
                      </InlineStack>
                      <Text as="p" tone="subdued" variant="bodySm">
                        {scriptOk
                          ? `ID ${store.scriptTagId ?? "—"}${
                              store.trackingInstalledAt
                                ? ` · ${new Date(store.trackingInstalledAt).toLocaleString()}`
                                : ""
                            }`
                          : "Not injected yet. Click “Re-install tracking”."}
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon
                          source={webhooksOk ? CheckCircleIcon : AlertCircleIcon}
                          tone={webhooksOk ? "success" : "caution"}
                        />
                        <Text as="span" fontWeight="semibold">
                          Webhooks
                        </Text>
                        <Badge tone={webhooksOk ? "success" : "attention"}>
                          {webhooksOk ? "Registered" : "Missing"}
                        </Badge>
                      </InlineStack>
                      <Text as="p" tone="subdued" variant="bodySm">
                        {webhooksOk
                          ? `orders/paid, orders/create, app/uninstalled${
                              store.webhooksInstalledAt
                                ? ` · ${new Date(store.webhooksInstalledAt).toLocaleString()}`
                                : ""
                            }`
                          : "Order webhooks not registered. Click “Re-install tracking”."}
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>

                {data.trackingScriptUrl ? (
                  <TextField
                    label="Tracking script URL"
                    value={data.trackingScriptUrl}
                    autoComplete="off"
                    readOnly
                    monospaced
                    helpText="Injected automatically via ScriptTag. First-click attribution + thank-you detection."
                  />
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Sales
                  </Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {data.sales.totalCount}
                  </Text>
                  <Text as="p" tone="subdued">
                    tracked orders
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Volume
                  </Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {data.sales.totalAmount}
                  </Text>
                  <Text as="p" tone="subdued">
                    total tracked amount
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent sales
                  </Text>
                  <Link url={data.linkFlowDashboardUrl} target="_blank">
                    Full dashboard
                  </Link>
                </InlineStack>
                {salesRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "numeric",
                      "numeric",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Order",
                      "Amount",
                      "Commission",
                      "Referral",
                      "Status",
                      "When",
                    ]}
                    rows={salesRows}
                  />
                ) : (
                  <Box paddingBlock="400">
                    <Text as="p" tone="subdued" alignment="center">
                      No sales yet. Tracking is ready — attributed orders will
                      appear here and in Link Flow.
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Resources
                </Text>
                <Link url={data.linkFlowDashboardUrl} target="_blank">
                  Link Flow brand dashboard
                </Link>
                <Link url="https://www.linkflowaffiliates.com" target="_blank">
                  linkflowaffiliates.com
                </Link>
                <Text as="p" tone="subdued" variant="bodySm">
                  Scopes: {store.scopes || "—"}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
