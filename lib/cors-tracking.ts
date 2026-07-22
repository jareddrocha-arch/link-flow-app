/**
 * Tracking snippet is embedded on third-party brand storefronts, so CORS is open.
 * Auth is the brand tracking key in the body — rotate keys if leaked.
 */
export function corsHeadersForTracking(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false",
  };
}

export function corsHeadersForScript(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}
