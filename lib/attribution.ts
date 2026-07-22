/** Cookie / query param used for first-click affiliate attribution. */
export const REFERRAL_QUERY_PARAM = "fa_ref";

/** First-click attribution window (days). After this, a new click can win. */
export const REFERRAL_ATTRIBUTION_DAYS = 90;

export const BRAND_CONSOLE_PREFIX = "Link Flow";

/**
 * Shared browser helpers: first-click capture, 90-day storage
 * (localStorage + sessionStorage + cookie).
 */
export function buildClientFirstClickHelpersJs(): string {
  return `var REF_PARAM=${JSON.stringify(REFERRAL_QUERY_PARAM)};
var REF_DAYS=${REFERRAL_ATTRIBUTION_DAYS};
var REF_MS=REF_DAYS*24*60*60*1000;
function faNow(){return Date.now();}
function faParseStored(raw){if(!raw)return null;try{var j=JSON.parse(raw);if(j&&j.code)return{code:String(j.code),capturedAt:typeof j.capturedAt==="number"?j.capturedAt:faNow()};}catch(e){}if(raw&&raw.charAt(0)!=="{")return{code:String(raw),capturedAt:faNow()};return null;}
function faIsActive(entry){return !!(entry&&entry.code&&(faNow()-entry.capturedAt)<REF_MS);}
function faReadCookie(name){try{var m=document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));return m?decodeURIComponent(m[1]):null;}catch(e){return null;}}
function faReadStored(){try{var a=faParseStored(localStorage.getItem(REF_PARAM));if(faIsActive(a))return a;}catch(e){}try{var b=faParseStored(sessionStorage.getItem(REF_PARAM));if(faIsActive(b))return b;}catch(e){}var c=faParseStored(faReadCookie(REF_PARAM));if(faIsActive(c))return c;return null;}
function faWriteStored(entry){var raw=JSON.stringify({code:entry.code,capturedAt:entry.capturedAt});try{localStorage.setItem(REF_PARAM,raw);}catch(e){}try{sessionStorage.setItem(REF_PARAM,raw);}catch(e){}try{document.cookie=REF_PARAM+"="+encodeURIComponent(raw)+"; path=/; max-age="+(REF_DAYS*86400)+"; SameSite=Lax";}catch(e){}}
/** First-click: only store a new code when none is active (or after 90 days). */
function faCaptureFirstClickFromUrl(){try{var p=new URLSearchParams(location.search);var code=p.get(REF_PARAM)||p.get("ref");if(!code)return;if(faIsActive(faReadStored()))return;faWriteStored({code:code,capturedAt:faNow()});}catch(e){}}
function faReadReferralCode(){faCaptureFirstClickFromUrl();var s=faReadStored();if(s)return s.code;return(window.FlowAffiliates&&window.FlowAffiliates.referralCode)||null;}`;
}

/** Public origin for embedding in third-party storefront scripts. */
export function getPublicSiteUrl(requestOrigin?: string): string {
  const fromEnv = process.env.HOST?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (requestOrigin) return requestOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}
