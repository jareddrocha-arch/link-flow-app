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

const LAST_UPDATED = "July 29, 2026";

/** Force light legal-page styling regardless of system dark mode */
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  width: "100%",
  backgroundColor: "#fafafa",
  color: "#18181b",
  colorScheme: "light",
};

const shellStyle: React.CSSProperties = {
  maxWidth: "42rem",
  margin: "0 auto",
  padding: "3rem 1.5rem 4rem",
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: "16px",
  lineHeight: 1.7,
  color: "#27272a",
};

const h1Style: React.CSSProperties = {
  marginTop: "0.5rem",
  fontSize: "1.875rem",
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.25,
  color: "#09090b",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 600,
  lineHeight: 1.4,
  color: "#09090b",
};

const mutedStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#52525b",
  lineHeight: 1.5,
};

const linkStyle: React.CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 500,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const codeStyle: React.CSSProperties = {
  borderRadius: "0.25rem",
  backgroundColor: "#f4f4f5",
  padding: "0.1rem 0.35rem",
  fontSize: "0.875rem",
  color: "#18181b",
  border: "1px solid #e4e4e7",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "2rem",
};

const listStyle: React.CSSProperties = {
  marginTop: "0.75rem",
  marginBottom: 0,
  paddingLeft: "1.25rem",
  listStyleType: "disc",
};

const liStyle: React.CSSProperties = {
  marginBottom: "0.35rem",
};

export default function PrivacyPolicyPage() {
  return (
    <div style={pageStyle}>
      <article style={shellStyle}>
        <p style={{ ...mutedStyle, fontWeight: 600, margin: 0 }}>
          Link Flow Affiliates
        </p>
        <h1 style={h1Style}>Privacy Policy</h1>
        <p style={{ ...mutedStyle, marginTop: "0.5rem" }}>
          Last updated: {LAST_UPDATED}
        </p>

        <div style={{ marginTop: "2rem" }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>Who we are</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Link Flow Affiliates (“Link Flow”, “we”, “us”) provides affiliate
              tracking tools for Shopify merchants. This policy explains what
              data our Shopify app collects, why we collect it, and how
              merchants can request deletion.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>What data we collect</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              We only collect data needed to track sales and affiliate
              attribution for your store:
            </p>
            <ul style={listStyle}>
              <li style={liStyle}>
                <strong>Shop domain</strong> (for example,{" "}
                <code style={codeStyle}>your-store.myshopify.com</code>)
              </li>
              <li style={liStyle}>
                <strong>Order ID</strong> (or order number) from completed
                checkouts
              </li>
              <li style={liStyle}>
                <strong>Order amount</strong> and <strong>currency</strong>
              </li>
              <li style={liStyle}>
                <strong>Product information</strong> such as product ID and
                product name (when available)
              </li>
              <li style={liStyle}>
                <strong>Referral code</strong> (for example, an affiliate{" "}
                <code style={codeStyle}>fa_ref</code> code), when a customer was
                referred
              </li>
              <li style={liStyle}>
                Technical install data such as your app access token, tracking
                brand key, and whether scripts or webhooks are installed
              </li>
              <li style={liStyle}>
                <strong>Brand account data</strong> (when you create or log in
                to a free Link Flow brand account from the app): brand name,
                email, and password — handled by the Link Flow platform at{" "}
                <a
                  style={linkStyle}
                  href="https://www.linkflowaffiliates.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  linkflowaffiliates.com
                </a>{" "}
                so we can issue a tracking key and run commissions
              </li>
            </ul>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>
              What we do <em>not</em> collect
            </h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              We do <strong>not</strong> collect or store customer personal
              contact details, including:
            </p>
            <ul style={listStyle}>
              <li style={liStyle}>Customer name</li>
              <li style={liStyle}>Email address</li>
              <li style={liStyle}>Shipping or billing address</li>
              <li style={liStyle}>Phone number</li>
            </ul>
            <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              Our tracking focuses on order and referral data for
              commissions—not on building customer profiles. We may receive
              order IDs and amounts via Shopify order webhooks or the web pixel;
              we do <strong>not</strong> store customer identity fields from
              those payloads even if Shopify includes them.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>How merchants access the app</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              The embedded app is meant to be opened from{" "}
              <strong>Shopify Admin</strong>. We authenticate merchant sessions
              with Shopify session tokens (and a short-lived signed cookie after
              verification). We do not expose sales history or brand keys on
              public URLs that only include a shop domain.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>Why we collect this data</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              We use this information to:
            </p>
            <ul style={listStyle}>
              <li style={liStyle}>
                Attribute orders to the correct affiliate (first-click referral
                tracking)
              </li>
              <li style={liStyle}>
                Calculate and support{" "}
                <strong>tier ranking commissions</strong> and related affiliate
                payouts
              </li>
              <li style={liStyle}>
                Show merchants a simple sales summary inside the Shopify app
              </li>
              <li style={liStyle}>
                Keep tracking working after install (scripts, pixels, webhooks)
              </li>
            </ul>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>We do not sell personal data</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              We do <strong>not sell</strong> personal data. We do not share
              your store’s order data with third parties for advertising or data
              brokerage. Data may be processed by infrastructure providers that
              host our app (for example, our hosting and database providers)
              only to run the service.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>How long we keep data</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              In general, we keep order and attribution records for as long as
              your store remains installed and for a reasonable period afterward
              so commissions and history can still be reviewed.
            </p>
            <ul style={listStyle}>
              <li style={liStyle}>
                <strong>While the app is installed:</strong> order IDs, amounts,
                products, referral codes, and shop domain are retained for
                tracking and reporting.
              </li>
              <li style={liStyle}>
                <strong>After uninstall:</strong> we remove active access tokens
                and tracking keys. Historical sales rows may be retained for a
                limited time for audit or reinstall continuity, then removed on
                request or when a shop-level deletion request is received.
              </li>
              <li style={liStyle}>
                <strong>Typical retention target:</strong> up to{" "}
                <strong>24 months</strong> after last activity, unless a
                merchant asks us to delete sooner or law requires longer
                retention.
              </li>
            </ul>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>How to request data deletion</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Merchants can request deletion by:
            </p>
            <ul style={listStyle}>
              <li style={liStyle}>
                Emailing us at{" "}
                <a style={linkStyle} href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                with your shop domain and what you want deleted
              </li>
              <li style={liStyle}>
                Uninstalling the app (we clear access tokens and tracking
                credentials automatically)
              </li>
            </ul>
            <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              When Shopify sends a required deletion request (for example,{" "}
              <code style={codeStyle}>shop/redact</code>), we process it and
              remove store data we hold for that shop.
            </p>
            <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
              Because we do not store customer name, email, address, or phone,{" "}
              <code style={codeStyle}>customers/redact</code> and{" "}
              <code style={codeStyle}>customers/data_request</code> typically
              confirm that we hold no customer contact information for that
              customer.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>Cookies</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              On the merchant’s storefront, our tracking may store a first-party
              referral cookie (such as <code style={codeStyle}>fa_ref</code>) so
              the first affiliate click can be remembered for a limited time
              (about 90 days). This is used for attribution, not for selling
              ads.
            </p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>Contact</h2>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Questions about privacy or data deletion:{" "}
              <a style={linkStyle} href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Website:{" "}
              <a
                style={linkStyle}
                href="https://www.linkflowaffiliates.com"
                target="_blank"
                rel="noreferrer"
              >
                linkflowaffiliates.com
              </a>
            </p>
          </section>
        </div>

        <div
          style={{
            marginTop: "3rem",
            borderTop: "1px solid #e4e4e7",
            paddingTop: "1.5rem",
            fontSize: "0.875rem",
            color: "#52525b",
          }}
        >
          <Link href="/" style={linkStyle}>
            ← Back to app
          </Link>
        </div>
      </article>
    </div>
  );
}
