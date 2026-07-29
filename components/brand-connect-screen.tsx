"use client";

import { FormEvent, useCallback, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";

type Mode = "signup" | "login";

type Props = {
  shop: string;
  actionToken?: string | null;
  onConnected?: () => void;
};

/**
 * App Store install path when the shop has no brandKey yet.
 * Create a Link Flow brand or log in; then the parent reloads the dashboard.
 */
export function BrandConnectScreen({
  shop,
  actionToken = null,
  onConnected,
}: Props) {
  const [mode, setMode] = useState<Mode>("signup");
  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (actionToken) {
          headers.Authorization = `Bearer ${actionToken}`;
        }
        // Prefer App Bridge session token when available
        try {
          if (typeof window !== "undefined" && window.shopify?.idToken) {
            const t = await window.shopify.idToken();
            if (t) headers.Authorization = `Bearer ${t}`;
          }
        } catch {
          /* keep actionToken */
        }

        const res = await fetch("/api/brand/connect", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            shop,
            mode,
            email: email.trim(),
            password,
            brandName: mode === "signup" ? brandName.trim() : undefined,
            actionToken: actionToken || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || "Could not connect your brand account.");
          return;
        }
        if (onConnected) {
          onConnected();
        } else {
          window.location.href = `/?shop=${encodeURIComponent(shop)}&connected=1`;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [actionToken, brandName, email, mode, onConnected, password, shop],
  );

  return (
    <Page title="Connect your brand">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner title="Finish setup for this store" tone="info">
              <p>
                Create a free Link Flow brand account or log in with an existing
                one. We’ll generate your brand key, lock it to{" "}
                <strong>{shop}</strong>, and install tracking automatically.
              </p>
            </Banner>

            {error ? (
              <Banner
                title="Couldn’t connect"
                tone="critical"
                onDismiss={() => setError(null)}
              >
                <p>{error}</p>
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200">
                  <Button
                    variant={mode === "signup" ? "primary" : "secondary"}
                    onClick={() => setMode("signup")}
                    disabled={busy}
                  >
                    Create brand account
                  </Button>
                  <Button
                    variant={mode === "login" ? "primary" : "secondary"}
                    onClick={() => setMode("login")}
                    disabled={busy}
                  >
                    Log in
                  </Button>
                </InlineStack>

                <Text as="p" tone="subdued">
                  {mode === "signup"
                    ? "New to Link Flow? Create a brand account to get a tracking key and open the full dashboard later."
                    : "Already have a brand on linkflowaffiliates.com? Log in to link this store."}
                </Text>

                <form onSubmit={submit}>
                  <FormLayout>
                    {mode === "signup" ? (
                      <TextField
                        label="Brand name"
                        value={brandName}
                        onChange={setBrandName}
                        autoComplete="organization"
                        requiredIndicator
                        disabled={busy}
                      />
                    ) : null}
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={setEmail}
                      autoComplete="email"
                      requiredIndicator
                      disabled={busy}
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      requiredIndicator
                      disabled={busy}
                      helpText={
                        mode === "signup"
                          ? "At least 6 characters"
                          : undefined
                      }
                    />
                    <Button
                      submit
                      variant="primary"
                      loading={busy}
                      disabled={
                        busy ||
                        !email.trim() ||
                        !password ||
                        (mode === "signup" && !brandName.trim())
                      }
                    >
                      {mode === "signup"
                        ? "Create account & connect store"
                        : "Log in & connect store"}
                    </Button>
                  </FormLayout>
                </form>

                <Text as="p" tone="subdued" variant="bodySm">
                  Product, affiliate, and commission management stays on the
                  full Link Flow website after you connect.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
