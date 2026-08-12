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
  ClipboardIcon,
} from "@shopify/polaris-icons";
import type { MerchantDashboardData } from "@/lib/dashboard";
import { CopyEmailLink } from "@/components/copy-email-link";
import {
  bootstrapFromSessionToken,
  buildOAuthBeginUrl,
  isEmbeddedAdminOpen,
  navigateTopLevel,
  reloadAppHome,
  startTopLevelOAuth,
} from "@/lib/oauth-client";

type Props = {
  data: MerchantDashboardData;
  showOnboarding?: boolean;
  /**
   * Fallback signed token from the server when App Bridge session tokens
   * are unavailable (e.g. standalone open). Prefer shopify.idToken().
   */
  actionToken?: string | null;
  /** Brand key was just saved / provisioned for this store */
  justConnected?: boolean;
  /**
   * Optional brand key from warm install URL (preserved for bootstrap /
   * OAuth — applied server-side when present).
   */
  brandKeyFromQuery?: string | null;
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

/**
 * Embedded app home for Shopify Admin.
 *
 * App Store review constraints:
 * - No links or CTAs to external websites or dashboards
 * - No billing / deposits / Stripe / payment UI
 * - Cold install stays in-app (tracking + optional brand key)
 * - Warm install still applies brandKey from the install URL server-side
 */
export function MerchantDashboard({
  data,
  showOnboarding = false,
  actionToken = null,
  justConnected = false,
  brandKeyFromQuery = null,
}: Props) {
  const [copied, setCopied] = useState<"brand" | "script" | null>(null);
  const [brandKeyInput, setBrandKeyInput] = useState(
    data.store?.brandKey ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  /** True once App Bridge idToken is available or we have an action token */
  const [canAuth, setCanAuth] = useState(Boolean(actionToken));
  /**
   * Completing managed install / session bootstrap (no second OAuth hop).
   * "pending" while trying; "failed" only if we must fall back to top-level OAuth.
   */
  const [bootstrapState, setBootstrapState] = useState<
    "idle" | "pending" | "failed"
  >("idle");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
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

  /**
   * When Shopify opens the app after Install (managed install or post-OAuth)
   * we often have App Bridge but SSR has no cookie yet, and/or no Store row.
   * Bootstrap with session token exchange — do NOT offer in-iframe OAuth.
   */
  useEffect(() => {
    let cancelled = false;
    const needsBootstrap =
      Boolean(data.shop) && (data.authRequired || data.needsInstall || !store);

    if (!needsBootstrap) {
      setBootstrapState("idle");
      return;
    }

    (async () => {
      setBootstrapState("pending");
      setBootstrapError(null);

      // Wait for App Bridge CDN (embedded Admin can take a few seconds)
      let sessionToken: string | null = null;
      for (let i = 0; i < 40 && !cancelled; i++) {
        try {
          if (typeof window !== "undefined" && window.shopify?.idToken) {
            sessionToken = await window.shopify.idToken();
            if (sessionToken) break;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (cancelled) return;

      if (!sessionToken) {
        setBootstrapState("failed");
        setBootstrapError(
          isEmbeddedAdminOpen()
            ? "Shopify Admin session token not ready yet. Use “Retry setup” below (does not open a second Install screen). Only use Install if retry keeps failing."
            : "Could not get a Shopify session token. Open the app from Shopify Admin, or use Install (full browser window).",
        );
        return;
      }

      if (!cancelled) setCanAuth(true);

      try {
        const result = await bootstrapFromSessionToken({
          shop: data.shop!,
          sessionToken,
          brandKey: brandKeyFromQuery,
        });

        if (cancelled) return;

        if (result.ok && result.installed) {
          const shopReady = result.shop || data.shop!;
          // Cold or warm: stay in-app. Reload once so SSR can serve the dashboard.
          // Do not route cold installs to external account / brand-connect UI.
          const reloadKey = `lf_dash_reload_${shopReady}`;
          try {
            if (
              typeof sessionStorage !== "undefined" &&
              !sessionStorage.getItem(reloadKey)
            ) {
              sessionStorage.setItem(reloadKey, "1");
              reloadAppHome(shopReady, { installed: "1" });
              return;
            }
          } catch {
            reloadAppHome(shopReady, { installed: "1" });
            return;
          }
          // Already reloaded but SSR still blocked — session token APIs still work
          setBootstrapState("failed");
          setBootstrapError(
            "App is installed. If the dashboard does not load, reopen Link Flow from Shopify Admin → Apps.",
          );
          return;
        }

        // Store already active but SSR lacked cookie: set cookie then reload once
        const verify = await fetch("/api/session/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          credentials: "include",
          body: JSON.stringify({ shop: data.shop }),
        });
        if (verify.ok && !cancelled) {
          const verifyBody = (await verify.json().catch(() => ({}))) as {
            installed?: boolean;
          };
          if (verifyBody.installed === false) {
            // verify ok but not installed — fall through to error
          } else {
            const reloadKey = `lf_sess_reload_${data.shop}`;
            try {
              if (
                typeof sessionStorage !== "undefined" &&
                !sessionStorage.getItem(reloadKey)
              ) {
                sessionStorage.setItem(reloadKey, "1");
                reloadAppHome(data.shop!);
                return;
              }
            } catch {
              reloadAppHome(data.shop!);
              return;
            }
          }
        }

        setBootstrapState("failed");
        setBootstrapError(
          result.error ||
            "Could not finish install from the Admin session. Use Install below to authorize at the top level.",
        );
      } catch (e) {
        if (cancelled) return;
        setBootstrapState("failed");
        setBootstrapError(
          e instanceof Error ? e.message : "Bootstrap request failed",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    actionToken,
    brandKeyFromQuery,
    data.authRequired,
    data.needsInstall,
    data.shop,
    store,
  ]);

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
              : body.code === "missing_brand_key" ||
                  /brandKey|brand key/i.test(String(body.error || ""))
                ? "Add a brand key below, then try Refresh tracking again."
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
            ? `Shopify did not grant write_pixels / read_customer_events. Current scopes: ${scopes || "unknown"}. Update app scopes, redeploy, then uninstall and reinstall the app. Details: ${errList.slice(0, 4).join(" · ") || "web pixel not created"}`
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
        title: store?.brandKey ? "Brand key linked" : "Optional: set brand key",
        detail: store?.brandKey
          ? "This store is linked to a tracking brand key (locked)."
          : "If you received a brand key with install (starts with fb_), enter it below. Warm installs apply it automatically.",
      },
      {
        done: trackingActive,
        title: "Tracking is installed on your store",
        detail: trackingActive
          ? "Script tag, web pixel, and/or webhooks are active."
          : store?.brandKey
            ? "Click “Refresh tracking” if something shows as missing."
            : "Add a brand key first, then use Refresh tracking.",
      },
      {
        done: data.sales.totalCount > 0,
        title: "Make a test order",
        detail:
          "Place a small test order on your storefront. It should appear under Recent sales below.",
      },
    ];
    return steps;
  }, [store?.brandKey, trackingActive, data.sales.totalCount]);

  // Post-install / embedded open: complete session or managed install quietly.
  // Do not start a second OAuth inside the iframe (reviewer "refused to connect").
  if (data.authRequired || data.needsInstall || !store) {
    const shopLabel = data.shop || "your store";
    const isPending = bootstrapState === "pending" || bootstrapState === "idle";
    const showFallback =
      bootstrapState === "failed" || (!data.shop && !isPending);
    const oauthHref = data.shop
      ? buildOAuthBeginUrl({
          shop: data.shop,
          brandKey: brandKeyFromQuery,
          cold: !brandKeyFromQuery,
        })
      : "/auth/login";

    return (
      <Page title="Link Flow Affiliates">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {isPending ? (
                <Banner
                  title={
                    data.needsInstall || !store
                      ? "Finishing install"
                      : "Authenticating with Shopify"
                  }
                  tone="info"
                >
                  <p>
                    Completing setup for <strong>{shopLabel}</strong> using your
                    Shopify Admin session. You should not need to click Install
                    again — hang tight for a moment.
                  </p>
                </Banner>
              ) : null}

              {bootstrapError && bootstrapState === "failed" ? (
                <Banner title="Could not finish automatically" tone="warning">
                  <p>{bootstrapError}</p>
                </Banner>
              ) : null}

              <Card>
                <EmptyState
                  heading={
                    isPending
                      ? "Setting up Link Flow…"
                      : data.shop
                        ? `Almost done — ${data.shop}`
                        : "Connect your Shopify store"
                  }
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  {isPending ? (
                    <p>
                      If you just approved permissions in Shopify, we are
                      linking this store and will open the tracking dashboard
                      next. Do not click Install again.
                    </p>
                  ) : (
                    <BlockStack gap="300">
                      <p>
                        Setup did not finish automatically. Prefer{" "}
                        <strong>Retry setup</strong> (uses your Admin session —
                        no second permissions screen). Only use Install if retry
                        fails — it opens Shopify in the full browser window, not
                        inside this frame.
                      </p>
                      {showFallback && data.shop ? (
                        <InlineStack gap="300" wrap>
                          <Button
                            variant="primary"
                            onClick={() => {
                              setBootstrapState("idle");
                              reloadAppHome(data.shop!);
                            }}
                          >
                            Retry setup
                          </Button>
                          {/* Native target=_top — never navigates the Admin iframe alone */}
                          <a
                            href={oauthHref}
                            target="_top"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              startTopLevelOAuth({
                                shop: data.shop!,
                                brandKey: brandKeyFromQuery,
                                cold: !brandKeyFromQuery,
                              });
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "8px 16px",
                              borderRadius: 8,
                              border: "1px solid #8a8a8a",
                              color: "#202223",
                              textDecoration: "none",
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            Install (full window)
                          </a>
                        </InlineStack>
                      ) : showFallback && !data.shop ? (
                        <Button
                          variant="primary"
                          onClick={() => {
                            navigateTopLevel("/auth/login");
                          }}
                        >
                          Enter store domain
                        </Button>
                      ) : null}
                      <p>
                        <Link url="/privacy">Privacy policy</Link>
                      </p>
                    </BlockStack>
                  )}
                </EmptyState>
              </Card>
            </BlockStack>
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
        content: provisioning ? "Refreshing…" : "Refresh tracking",
        onAction: reProvision,
        loading: provisioning,
        disabled: provisioning || !canAuth,
      }}
    >
      <BlockStack gap="400">
        {justConnected ? (
          <Banner title="Brand key saved" tone="success">
            <p>
              Your brand key is locked to this store and tracking was
              provisioned. Use Refresh tracking anytime to reinstall scripts and
              webhooks.
            </p>
          </Banner>
        ) : null}

        {showOnboarding || data.sales.totalCount === 0 || justConnected ? (
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
                ? "Sales from your store will be recorded automatically. Place a test order when you’re ready."
                : "Confirm tracking status below. If something is missing, add a brand key if needed, then use Refresh tracking."}
            </p>
          </Banner>
        ) : null}

        <Banner tone="info" title="How we use your store data">
          <p>
            Link Flow records order ID, amount, products, referral code, and
            shop domain for affiliate attribution. We do <strong>not</strong>{" "}
            collect customer name, email, address, or phone, and we do not sell
            personal data.{" "}
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
                {!trackingActive ? (
                  <InlineStack gap="200">
                    <Button
                      onClick={reProvision}
                      loading={provisioning}
                      disabled={provisioning || !canAuth}
                      variant="primary"
                    >
                      Refresh tracking
                    </Button>
                  </InlineStack>
                ) : null}
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
                        tone={
                          store.status === "ACTIVE" ? "success" : "attention"
                        }
                      >
                        {store.status === "ACTIVE" ? "Connected" : store.status}
                      </Badge>
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm" breakWord>
                      Permissions: {store.scopes || "unknown"}
                    </Text>
                    {!store.scopes.includes("write_pixels") ||
                    !store.scopes.includes("read_customer_events") ? (
                      <Banner
                        tone="warning"
                        title="Pixel permissions incomplete"
                      >
                        <p>
                          Web Pixel needs both <strong>write_pixels</strong> and{" "}
                          <strong>read_customer_events</strong>. This install
                          has:{" "}
                          <code style={{ wordBreak: "break-all" }}>
                            {store.scopes || "none"}
                          </code>
                          . Add the missing scopes in{" "}
                          <strong>
                            Shopify Dev Dashboard → App → Versions
                          </strong>
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
                        This key links Shopify sales to your brand for
                        attribution. It was set when you installed the app (or
                        on first save) and cannot be changed here.
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Brand key"
                          value={store.brandKey ?? ""}
                          autoComplete="off"
                          monospaced
                          readOnly
                          helpText="Contact support if you need this key changed."
                        />
                      </FormLayout>
                      <Banner tone="info" title="Brand key is locked">
                        <p>
                          For security, the brand key cannot be edited in the
                          app once it is set. Contact{" "}
                          <CopyEmailLink>app support</CopyEmailLink> if you need
                          it updated or moved to another store.
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
                        Optional. Enter a brand key if one was provided with
                        your install (usually starts with <code>fb_</code>). You
                        can only set this once — after that it is locked. Warm
                        installs apply the key automatically.
                      </Text>
                      <FormLayout>
                        <TextField
                          label="Brand key"
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
                          disabled={saving || !brandKeyInput.trim() || !canAuth}
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
                  These run in the background. You don’t need to paste code into
                  your theme for basic tracking.
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
                  <CopyEmailLink>app support</CopyEmailLink> (copies contact
                  email).
                </Text>
                <Link url="/privacy">Full Privacy Policy</Link>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Recent sales
                </Text>
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
