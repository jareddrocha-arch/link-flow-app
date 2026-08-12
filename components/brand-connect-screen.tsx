/**
 * @deprecated App Store review: external brand-connect signup is disabled.
 * Cold installs use the in-app merchant dashboard (tracking + optional brand key).
 * Warm installs still apply brandKey via OAuth/bootstrap.
 *
 * The /api/brand/connect route remains for optional server-side use but is not
 * linked from any embedded app UI.
 */

export function BrandConnectScreen(_props: {
  shop: string;
  actionToken?: string | null;
  onConnected?: () => void;
}) {
  // Intentionally empty — do not render external account or website CTAs.
  return null;
}
