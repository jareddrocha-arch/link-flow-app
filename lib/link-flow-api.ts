/** Production Link Flow Affiliates platform (commission / brandKey backend). */
export const DEFAULT_LINK_FLOW_API_URL = "https://www.linkflowaffiliates.com";

/**
 * Base URL for the main Link Flow API.
 * Defaults to production; override with LINK_FLOW_API_URL if needed.
 * Set LINK_FLOW_API_URL= (empty) or LINK_FLOW_FORWARD=false to disable forwarding.
 */
export function getLinkFlowApiUrl(): string | null {
  if (process.env.LINK_FLOW_FORWARD === "false") {
    return null;
  }

  const configured = process.env.LINK_FLOW_API_URL;
  if (configured !== undefined) {
    const trimmed = configured.trim().replace(/\/$/, "");
    return trimmed || null;
  }

  return DEFAULT_LINK_FLOW_API_URL;
}

export function getLinkFlowSalesTrackUrl(): string | null {
  const base = getLinkFlowApiUrl();
  return base ? `${base}/api/sales/track` : null;
}
