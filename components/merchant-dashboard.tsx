"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  EmptyState,
  FormLayout,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  List,
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
  showOnboarding?: boolean;
  /**
   * Fallback signed token from the server when App Bridge session tokens
   * are unavailable (e.g. standalone open). Prefer shopify.idToken().
   */
  actionToken?: string | null;
};

/** App Bridge session token (preferred) or server-issued action token. */
async function resolveAuthBearer(
  actionToken: string | null | undefined,
): Promise<string | null> {
  try {
    if (typeof window !== "undefined" && window.shopify?.idToken) {
      const sessionToken = await window.shopify.idToken();
      if (sessionToken) return sessionToken;
    }
  } catch {
    /* Not in Admin iframe or App Bridge not ready */
  }
  return actionToken?.trim() || null;
}

function StatusPill({
  ok,
  label,
  okText,
  badText,
}: {
  ok: boolean;
  label: string;
  okText: string;
  badText: string;
}) {
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <Icon
            source={ok ? CheckCircleIcon : AlertCircleIcon}
            tone={ok ? "success" : "caution"}
          />
          <Text as="span" fontWeight="semibold">
            {label}
          </Text>
          <Badge tone={ok ? "success" : "attention"}>
            {ok ? "Ready" : "Needs setup"}
          </Badge>
        </InlineStack>
        <Text as="p" tone="subdued" variant="bodySm">
          {ok ? okText : badText}
        </Text>
      </BlockStack>
    </Box>
  );
}

export function MerchantDashboard({
  data,
  showOnboarding = false,
  actionToken = null,
}: Props) {
  const [copied, setCopied] = useState<"brand" | "script" | null>(null);
  const [brandKeyInput, setBrandKeyInput] = useState(
    data.store?.brandKey ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  /** True once App Bridge idToken is available or we have an action token */
  const [canAuth, setCanAuth] = useState(Boolean(actionToken));
  const [banner, setBanner] = useState<{
    tone: "success" | "warning" | "critical" | "info";
    title: string;
    message: string;
  } | null>(null);

  const store = data.store;
  const brandKeyLocked = Boolean(store?.brandKey?.trim());
  const scriptOk = data.tracking.scriptTag === "ok";
  const webhooksOk = data.tracking.webhooks === "ok";
  const webPixelOk = data.tracking.webPixel === "ok";
  const trackingActive = scriptOk || webPixelOk || webhooksOk;

  // Detect App Bridge session tokens and handshake with the backend so
  // Partner Dashboard "Embedded app checks" observe session-token auth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await resolveAuthBearer(actionToken);
      if (!cancelled) setCanAuth(Boolean(token));

      // Prefer a real App Bridge JWT (not the fallback action token)
      try {
        if (
          typeof window !== "undefined" &&
          window.shopify?.idToken &&
          data.shop
        ) {
          const sessionToken = await window.shopify.idToken();
          if (!sessionToken || cancelled) return;
          await fetch("/api/session/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionToken}`,
            },
            credentials: "include",
            body: JSON.stringify({ shop: data.shop }),
          });
        }
      } catch {
        /* standalone / App Bridge not ready — action token still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actionToken, data.shop]);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const bearer = await resolveAuthBearer(actionToken);
    if (bearer) {
      h.Authorization = `Bearer ${bearer}`;
    }
    return h;
  }, [actionToken]);

  const copy = useCallback(async (text: string, which: "brand" | "script") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const saveBrandKey = useCallback(async () => {
    if (!data.shop) return;
    setSaving(true);
    setBanner(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/store/settings", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          shop: data.shop,
          brandKey: brandKeyInput.trim(),
          reprovision: true,
          // Fallback only; prefer Authorization session token from App Bridge
          actionToken: actionToken || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          tone: "critical",
          title: "Couldn’t save brand key",
          message: body.error || "Please check the key and try again.",
        });
        return;
      }
      setBanner({
        tone: "success",
        title: "Brand key saved",
        message:
          "Tracking was updated to use this key. You’re ready to track sales.",
      });
      window.setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setBanner({
        tone: "critical",
        title: "Something went wrong",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }, [authHeaders, brandKeyInput, data.shop, actionToken]);

  const reProvision = useCallback(async () => {
    if (!data.shop) return;
    setProvisioning(true);
    setBanner(null);
    try {
      const qs = new URLSearchParams({ shop: data.shop });
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/provision?${qs.toString()}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          shop: data.shop,
          actionToken: actionToken || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({
          tone: "critical",
          title: "Couldn’t refresh tracking",
          message:
            body.error ||
            (body.code === "missing_access_token"
              ? "No access token on file — reinstall the app from Shopify."
              : "Try again or reinstall the app."),
        });
        // Do NOT auto-reload on failure — keep the error visible
        return;
      }
      const errList: string[] = Array.isArray(body.errors) ? body.errors : [];
      const errCount = errList.length;
      const scopes: string = body.scopes || data.store?.scopes || "";
      const missingPixels =
        !String(scopes).includes("write_pixels") ||
        errList.some((e) => /write_pixels|read_customer_events/i.test(e));

      if (errCount || !body.webPixelId) {
        setBanner({
          tone: "warning",
          title: missingPixels
            ? "Web Pixel needs more permissions"
            : "Tracking partially updated",
          message: missingPixels
            ? `Shopify did not grant write_pixels / read_customer_events. Current scopes: ${scopes || "unknown"}. Update Vercel SCOPES, redeploy, then uninstall and reinstall the app. Details: ${errList.slice(0, 4).join(" · ") || "web pixel not created"}`
            : `Some steps failed: ${errList.slice(0, 5).join(" · ")}`,
        });
        // Keep errors on screen — no auto-reload
        return;
      }

      setBanner({
        tone: "success",
        title: "Tracking refreshed",
        message: "Script tag, web pixel, and webhooks were updated.",
      });
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setBanner({
        tone: "critical",
        title: "Request failed",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setProvisioning(false);
    }
  }, [authHeaders, data.shop, actionToken, data.store]);

  const nextSteps = useMemo(() => {
    const steps: Array<{ done: boolean; title: string; detail: string }> = [
      {
        done: Boolean(store?.brandKey),
        title: store?.brandKey
          ? "Brand key linked"
          : "Set your brand key",
        detail: store?.brandKey
          ? "This store is linked to your Link Flow brand (key is locked)."
          : "Enter the brand key from your Link Flow Setup page, or install the app from Setup so it is applied automatically.",
      },
      {
        done: trackingActive,
        title: "Tracking is installed on your store",
        detail: trackingActive
          ? "Script tag, web pixel, and/or webhooks are active."
          : "Click “Refresh tracking” if something shows as missing.",
      },
      {
        done: data.sales.totalCount > 0,
        title: "Make a test order",
        detail:
          "Place a small test order on your storefront. It should appear under Recent sales below.",
      },
      {
        done: false,
        title: "Open the full Link Flow dashboard",
        detail: "Manage affiliates, commissions, and payouts on Link Flow.",
      },
    ];
    return steps;
  }, [store?.brandKey, trackingActive, data.sales.totalCount]);

  if (data.needsInstall || !store) {
    return (
      <Page title="Link Flow Affiliates">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading={
                  data.shop
                    ? `Connect ${data.shop}`
                    : "Connect your Shopify store"
                }
                action={{
                  content: "Install Link Flow",
                  url: data.shop
                    ? `/api/auth?shop=${encodeURIComponent(data.shop)}`
                    : "/auth/login",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Install once — we set up order tracking automatically so
                  affiliate sales can be attributed without extra copy-paste.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const salesRows = data.sales.recent.map((s) => [
    s.orderId || "—",
    s.amount,
    s.commission,
    s.referralCode || "Organic",
    s.status,
    new Date(s.createdAt).toLocaleString(),
  ]);

  return (
    <Page
      title="Link Flow Affiliates"
      subtitle={store.name}
      primaryAction={{
        content: "Open Link Flow",
        url: data.linkFlowDashboardUrl,
        external: true,
        icon: ExternalIcon,
      }}
      secondaryActions={[
        {
          content: provisioning ? "Refreshing…" : "Refresh tracking",
          onAction: reProvision,
          loading: provisioning,
          disabled: provisioning,
        },
      ]}
    >
      <BlockStack gap="400">
        {showOnboarding || data.sales.totalCount === 0 ? (
          <Banner
            title={
              trackingActive
                ? "You’re all set — tracking is active"
                : "Welcome! Let’s finish setup"
            }
            tone={trackingActive ? "success" : "info"}
          >
            <p>
              {trackingActive
                ? "Sales from your store will be recorded automatically. Confirm your brand key below, then place a test order when you’re ready."
                : "We’ll help you confirm your brand key and make sure tracking is running on your store."}
            </p>
          </Banner>
        ) : null}

        <Banner tone="info" title="How we use your store data">
          <p>
            Link Flow records order ID, amount, products, referral code, and
            shop domain for affiliate attribution and commissions. We do{" "}
            <strong>not</strong> collect customer name, email, address, or
            phone, and we do not sell personal data.{" "}
            <Link url="/privacy" target="_blank">
              Read our Privacy Policy
            </Link>
          </p>
        </Banner>

        {banner ? (
          <Banner
            title={banner.title}
            tone={banner.tone}
            onDismiss={() => setBanner(null)}
          >
            <p>{banner.message}</p>
          </Banner>
        ) : null}

        <Layout>
          {/* Next steps */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Next steps
                </Text>
                <List type="number">
                  {nextSteps.map((step) => (
                    <List.Item key={step.title}>
                      <InlineStack gap="200" blockAlign="start">
                        <Badge tone={step.done ? "success" : "new"}>
                          {step.done ? "Done" : "To do"}
                        </Badge>
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="semibold">
                            {step.title}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {step.detail}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </List.Item>
                  ))}
                </List>
                <InlineStack gap="200">
                  <Button url={data.linkFlowDashboardUrl} external>
                    Open Link Flow dashboard
                  </Button>
                  {!trackingActive ? (
                    <Button
                      onClick={reProvision}
                      loading={provisioning}
                      disabled={provisioning || !canAuth}
                    >
                      Refresh tracking
                    </Button>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Store + brand key */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Your store
                  </Text>
                  <BlockStack gap="150">
                    <Text as="p">
                      <Text as="span" tone="subdued">
                        Name:{" "}
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {store.name}
                      </Text>
                    </Text>
                    <Text as="p">
                      <Text as="span" tone="subdued">
                        Domain:{" "}
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {store.shop}
                      </Text>
                    </Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued">
                        App status
                      </Text>
                      <Badge
                        tone={store.status === "ACTIVE" ? "success" : "attention"}
                      >
                        {store.status === "ACTIVE" ? "Connected" : store.status}
                      </Badge>
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm" breakWord>
                      Permissions: {store.scopes || "unknown"}
                    </Text>
                    {!store.scopes.includes("write_pixels") ||
                    !store.scopes.includes("read_customer_events") ? (
                      <Banner tone="warning" title="Pixel permissions incomplete">
                        <p>
                          Web Pixel needs both <strong>write_pixels</strong> and{" "}
                          <strong>read_customer_events</strong>. This install
                          has:{" "}
                          <code style={{ wordBreak: "break-all" }}>
                            {store.scopes || "none"}
                          </code>
                          . Add the missing scopes in{" "}
                          <strong>Shopify Dev Dashboard → App → Versions</strong>
                          , release, then uninstall and reinstall this app.
                        </p>
                      </Banner>
                    ) : null}
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Brand key
                    </Text>
                    {brandKeyLocked ? (
                      <Badge tone="info">Locked</Badge>
                    ) : (
                      <Badge tone="attention">Not set</Badge>
                    )}
                  </InlineStack>
                  {brandKeyLocked ? (
                    <>
                      <Text as="p" tone="subdued">
                        This key links Shopify sales to your Link Flow
                        Affiliates brand. It was set when you installed the app
                        (or on first save) and cannot be changed here.
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Link Flow brand key"
                          value={store.brandKey ?? ""}
                          autoComplete="off"
                          monospaced
                          readOnly
                          helpText="Contact Link Flow support if you need this key changed."
                        />
                      </FormLayout>
                      <Banner tone="info" title="Brand key is locked">
                        <p>
                          For security, the brand key cannot be edited in the
                          app once it is set. Email{" "}
                          <Link url="mailto:support@linkflowaffiliates.com">
                            support@linkflowaffiliates.com
                          </Link>{" "}
                          if you need it updated or moved to another store.
                        </p>
                      </Banner>
                      <InlineStack gap="200">
                        <Button
                          icon={ClipboardIcon}
                          onClick={() => copy(store.brandKey!, "brand")}
                        >
                          {copied === "brand" ? "Copied" : "Copy key"}
                        </Button>
                      </InlineStack>
                    </>
                  ) : (
                    <>
                      <Text as="p" tone="subdued">
                        Enter the brand key from your Link Flow Setup page
                        (starts with <code>fb_</code>). You can only set this
                        once — after that it is locked. Prefer installing the
                        app from Link Flow Setup so the key is applied
                        automatically.
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Link Flow brand key"
                          value={brandKeyInput}
                          onChange={setBrandKeyInput}
                          autoComplete="off"
                          monospaced
                          helpText="Usually starts with fb_ · set once, then locked"
                          placeholder="fb_your_key_here"
                        />
                      </FormLayout>
                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          onClick={saveBrandKey}
                          loading={saving}
                          disabled={saving || !brandKeyInput.trim()}
                        >
                          Save &amp; activate
                        </Button>
                      </InlineStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          {/* Tracking status */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Tracking status
                  </Text>
                  <Badge tone={trackingActive ? "success" : "attention"}>
                    {trackingActive ? "Tracking is active" : "Setup needed"}
                  </Badge>
                </InlineStack>
                <Text as="p" tone="subdued">
                  These run in the background. You don’t need to paste code
                  into your theme for basic tracking.
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                  <StatusPill
                    ok={webPixelOk}
                    label="Web Pixel"
                    okText="Records every order on the thank-you page."
                    badText="Not connected yet. Click Refresh tracking."
                  />
                  <StatusPill
                    ok={scriptOk}
                    label="Script tag"
                    okText="Captures affiliate clicks on your online store."
                    badText="Not installed on the storefront yet."
                  />
                  <StatusPill
                    ok={webhooksOk}
                    label="Order tracking"
                    okText="Backup tracking via Shopify order webhooks."
                    badText="Webhooks not registered yet."
                  />
                </InlineGrid>
                {data.trackingScriptUrl ? (
                  <TextField
                    label="Tracking script URL (advanced)"
                    value={data.trackingScriptUrl}
                    autoComplete="off"
                    readOnly
                    monospaced
                    connectedRight={
                      <Button
                        onClick={() => copy(data.trackingScriptUrl!, "script")}
                      >
                        {copied === "script" ? "Copied" : "Copy"}
                      </Button>
                    }
                    helpText="Installed automatically. Only needed if you customize your theme manually."
                  />
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sales summary */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <Card>
                <BlockStack gap="150">
                  <Text as="h2" variant="headingMd">
                    Orders tracked
                  </Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {data.sales.totalCount}
                  </Text>
                  <Text as="p" tone="subdued">
                    {data.sales.totalCount === 0
                      ? "Place a test order to see your first sale here."
                      : "All orders recorded by Link Flow tracking."}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="150">
                  <Text as="h2" variant="headingMd">
                    Sales volume
                  </Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {data.sales.totalAmount}
                  </Text>
                  <Text as="p" tone="subdued">
                    Total amount from tracked orders
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Privacy
                </Text>
                <Text as="p" tone="subdued">
                  We only use order and referral data to power affiliate
                  tracking. Questions or deletion requests:{" "}
                  <Link url="mailto:support@linkflowaffiliates.com">
                    support@linkflowaffiliates.com
                  </Link>
                </Text>
                <Link url="/privacy">Full Privacy Policy</Link>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent sales
                  </Text>
                  <Link url={data.linkFlowDashboardUrl} target="_blank">
                    View in Link Flow
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
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" alignment="center" fontWeight="semibold">
                        No sales yet
                      </Text>
                      <Text as="p" tone="subdued" alignment="center">
                        When a customer checks out, the order will show up here
                        — even if they weren’t referred by an affiliate.
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
