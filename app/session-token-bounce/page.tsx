/**
 * Minimal bounce page for recovering a Shopify session token via App Bridge.
 *
 * When Admin loads the app without a valid id_token (or after a redirect that
 * dropped it), redirect here with `shopify-reload` set to the path to reopen.
 * App Bridge CDN + meta tag in the root layout re-append session info and
 * reload that path.
 *
 * See: https://shopify.dev/docs/apps/build/authentication-authorization/set-embedded-app-authorization
 */
export default function SessionTokenBouncePage() {
  return (
    <p style={{ fontFamily: "system-ui, sans-serif", padding: 24, margin: 0 }}>
      Authenticating with Shopify…
    </p>
  );
}
