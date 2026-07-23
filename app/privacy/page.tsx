import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Link Flow Affiliates",
  description:
    "How Link Flow Affiliates handles shop and order data for Shopify affiliate tracking.",
};

const SUPPORT_EMAIL =
  process.env.PRIVACY_CONTACT_EMAIL?.trim() ||
  "support@linkflowaffiliates.com";

const LAST_UPDATED = "July 23, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-zinc-800">
      <p className="text-sm font-medium text-zinc-500">Link Flow Affiliates</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-zinc-700">
        <section>
          <h2 className="text-lg font-semibold text-zinc-900">Who we are</h2>
          <p className="mt-2">
            Link Flow Affiliates (“Link Flow”, “we”, “us”) provides affiliate
            tracking tools for Shopify merchants. This policy explains what
            data our Shopify app collects, why we collect it, and how merchants
            can request deletion.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            What data we collect
          </h2>
          <p className="mt-2">
            We only collect data needed to track sales and affiliate
            attribution for your store:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <strong>Shop domain</strong> (for example,{" "}
              <code className="rounded bg-zinc-100 px-1 text-sm">
                your-store.myshopify.com
              </code>
              )
            </li>
            <li>
              <strong>Order ID</strong> (or order number) from completed
              checkouts
            </li>
            <li>
              <strong>Order amount</strong> and <strong>currency</strong>
            </li>
            <li>
              <strong>Product information</strong> such as product ID and
              product name (when available)
            </li>
            <li>
              <strong>Referral code</strong> (for example, an affiliate{" "}
              <code className="rounded bg-zinc-100 px-1 text-sm">fa_ref</code>{" "}
              code), when a customer was referred
            </li>
            <li>
              Technical install data such as your app access token, tracking
              brand key, and whether scripts or webhooks are installed
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            What we do <em>not</em> collect
          </h2>
          <p className="mt-2">
            We do <strong>not</strong> collect or store customer personal
            contact details, including:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Customer name</li>
            <li>Email address</li>
            <li>Shipping or billing address</li>
            <li>Phone number</li>
          </ul>
          <p className="mt-3">
            Our tracking focuses on order and referral data for commissions—not
            on building customer profiles.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            Why we collect this data
          </h2>
          <p className="mt-2">We use this information to:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              Attribute orders to the correct affiliate (first-click referral
              tracking)
            </li>
            <li>
              Calculate and support <strong>tier ranking commissions</strong>{" "}
              and related affiliate payouts
            </li>
            <li>
              Show merchants a simple sales summary inside the Shopify app
            </li>
            <li>Keep tracking working after install (scripts, pixels, webhooks)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            We do not sell personal data
          </h2>
          <p className="mt-2">
            We do <strong>not sell</strong> personal data. We do not share your
            store’s order data with third parties for advertising or data
            brokerage. Data may be processed by infrastructure providers that
            host our app (for example, our hosting and database providers) only
            to run the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            How long we keep data
          </h2>
          <p className="mt-2">
            In general, we keep order and attribution records for as long as
            your store remains installed and for a reasonable period afterward
            so commissions and history can still be reviewed.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <strong>While the app is installed:</strong> order IDs, amounts,
              products, referral codes, and shop domain are retained for
              tracking and reporting.
            </li>
            <li>
              <strong>After uninstall:</strong> we remove active access tokens
              and tracking keys. Historical sales rows may be retained for a
              limited time for audit or reinstall continuity, then removed on
              request or when a shop-level deletion request is received.
            </li>
            <li>
              <strong>Typical retention target:</strong> up to{" "}
              <strong>24 months</strong> after last activity, unless a merchant
              asks us to delete sooner or law requires longer retention.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">
            How to request data deletion
          </h2>
          <p className="mt-2">Merchants can request deletion by:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              Emailing us at{" "}
              <a
                className="font-medium text-zinc-900 underline"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with your shop domain and what you want deleted
            </li>
            <li>
              Uninstalling the app (we clear access tokens and tracking
              credentials automatically)
            </li>
          </ul>
          <p className="mt-3">
            When Shopify sends a required deletion request (for example,{" "}
            <code className="rounded bg-zinc-100 px-1 text-sm">shop/redact</code>
            ), we process it and remove store data we hold for that shop.
          </p>
          <p className="mt-3">
            Because we do not store customer name, email, address, or phone,{" "}
            <code className="rounded bg-zinc-100 px-1 text-sm">
              customers/redact
            </code>{" "}
            and{" "}
            <code className="rounded bg-zinc-100 px-1 text-sm">
              customers/data_request
            </code>{" "}
            typically confirm that we hold no customer contact information for
            that customer.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">Cookies</h2>
          <p className="mt-2">
            On the merchant’s storefront, our tracking may store a first-party
            referral cookie (such as{" "}
            <code className="rounded bg-zinc-100 px-1 text-sm">fa_ref</code>) so
            the first affiliate click can be remembered for a limited time
            (about 90 days). This is used for attribution, not for selling ads.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900">Contact</h2>
          <p className="mt-2">
            Questions about privacy or data deletion:{" "}
            <a
              className="font-medium text-zinc-900 underline"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-2">
            Website:{" "}
            <a
              className="font-medium text-zinc-900 underline"
              href="https://www.linkflowaffiliates.com"
              target="_blank"
              rel="noreferrer"
            >
              linkflowaffiliates.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
        <Link href="/" className="font-medium text-zinc-800 underline">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
