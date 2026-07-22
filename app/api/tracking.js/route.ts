import { NextRequest, NextResponse } from "next/server";
import {
  BRAND_CONSOLE_PREFIX,
  buildClientFirstClickHelpersJs,
  getPublicSiteUrl,
} from "@/lib/attribution";
import { corsHeadersForScript } from "@/lib/cors-tracking";
import { buildShopifyOrderDetectJs } from "@/lib/shopify-order-detect";

export const dynamic = "force-dynamic";

/**
 * Hosted brand tracking script (first-click attribution + thank-you sale tracking).
 *
 * Install (site-wide or thank-you):
 *   <script src="https://YOUR_HOST/api/tracking.js?k=fb_…" async></script>
 *
 * Thank-you only (forces order auto-detect retries):
 *   <script src="https://YOUR_HOST/api/tracking.js?k=fb_…&ty=1" async></script>
 *
 * Behavior:
 * - First-click capture from ?fa_ref= / ?ref= (90-day storage)
 * - Brand key from query `k` / `brandKey` or data-brand-key attribute
 * - On thank-you pages: auto-detect order via Shopify.checkout, dataLayer,
 *   ShopifyAnalytics, URL params, and DOM fallbacks
 * - Public API: FlowAffiliates.trackSale(payload), getReferralCode(), detectOrder()
 */
export async function GET(request: NextRequest) {
  const siteUrl = getPublicSiteUrl(request.nextUrl.origin);
  const apiUrl = `${siteUrl}/api/sales/track`;
  const helpers = buildClientFirstClickHelpersJs();
  const shopifyDetect = buildShopifyOrderDetectJs();

  const brandKeyFromQuery =
    request.nextUrl.searchParams.get("k")?.trim() ||
    request.nextUrl.searchParams.get("brandKey")?.trim() ||
    "";

  const forceThankYou =
    request.nextUrl.searchParams.get("ty") === "1" ||
    request.nextUrl.searchParams.get("mode") === "thankyou" ||
    request.nextUrl.searchParams.get("mode") === "thank-you";

  const script = `(function(){
"use strict";
var API_URL=${JSON.stringify(apiUrl)};
var EMBEDDED_BRAND_KEY=${JSON.stringify(brandKeyFromQuery)};
var PREFIX=${JSON.stringify(BRAND_CONSOLE_PREFIX)};
var FORCE_THANK_YOU=${forceThankYou ? "true" : "false"};
var SENT_KEY="lf_ty_sent_"+(EMBEDDED_BRAND_KEY||"global");
${helpers}
${shopifyDetect}

var fa=window.FlowAffiliates=window.FlowAffiliates||{};
var _queue=Array.isArray(fa._queue)?fa._queue:[];
fa._queue=_queue;

function readBrandKey(){
  if(EMBEDDED_BRAND_KEY)return EMBEDDED_BRAND_KEY;
  try{
    var scripts=document.getElementsByTagName("script");
    for(var i=scripts.length-1;i>=0;i--){
      var s=scripts[i];
      var src=s.getAttribute("src")||"";
      if(src.indexOf("/api/tracking.js")===-1&&src.indexOf("tracking.js")===-1)continue;
      var dk=s.getAttribute("data-brand-key");
      if(dk)return dk;
      try{
        var u=new URL(src,location.href);
        var q=u.searchParams.get("k")||u.searchParams.get("brandKey");
        if(q)return q;
      }catch(e){}
    }
  }catch(e){}
  if(fa.brandKey)return String(fa.brandKey);
  return null;
}

function faGetReferralCode(){
  return faReadReferralCode();
}

function normalizePayload(input){
  input=input||{};
  var brandKey=input.brandKey||readBrandKey();
  var amount=input.amount!=null?Number(input.amount):(fa.amount!=null?Number(fa.amount):null);
  var productId=input.productId!=null?String(input.productId):(fa.productId!=null?String(fa.productId):"auto");
  if(!productId)productId="auto";
  var orderId=input.orderId!=null?input.orderId:(fa.orderId!=null?fa.orderId:null);
  var productName=input.productName!=null?input.productName:(fa.productName!=null?fa.productName:null);
  var referralCode=input.referralCode!=null?input.referralCode:faGetReferralCode();
  return{
    brandKey:brandKey,
    productId:productId,
    amount:amount,
    orderId:orderId,
    productName:productName,
    referralCode:referralCode,
    pageUrl:location.href
  };
}

function sendTrack(payload){
  if(!payload||!payload.brandKey){
    if(typeof console!=="undefined"&&console.warn)console.warn("["+PREFIX+"] Missing brand key — use tracking.js?k=YOUR_KEY");
    return Promise.resolve({ok:false,error:"missing_brand_key"});
  }
  if(!payload.amount||!(payload.amount>0)){
    return Promise.resolve({ok:false,error:"missing_amount"});
  }
  var orderId=payload.orderId!=null?String(payload.orderId):null;
  if(alreadySent(orderId||String(payload.amount))){
    return Promise.resolve({ok:true,duplicate:true});
  }
  return fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      brandKey:payload.brandKey,
      productId:payload.productId||"auto",
      amount:payload.amount,
      orderId:orderId,
      productName:payload.productName,
      referralCode:payload.referralCode,
      pageUrl:payload.pageUrl||location.href
    }),
    keepalive:true,
    credentials:"omit"
  }).then(function(res){
    return res.json().catch(function(){return {ok:res.ok};}).then(function(body){
      return {ok:res.ok,status:res.status,body:body};
    });
  }).catch(function(err){
    if(typeof console!=="undefined"&&console.warn)console.warn("["+PREFIX+"] Track request failed",err);
    return {ok:false,error:String(err&&err.message||err)};
  });
}

function trackSale(input){
  faCaptureFirstClickFromUrl();
  var payload=normalizePayload(input);
  return sendTrack(payload);
}

function flushQueue(){
  while(_queue.length){
    var item=_queue.shift();
    try{trackSale(item);}catch(e){}
  }
}

function trackDetectedOrder(order){
  if(!order||!order.amount||!(order.amount>0))return Promise.resolve({ok:false,error:"missing_amount"});
  return trackSale({
    productId:order.productId||"auto",
    amount:order.amount,
    orderId:order.orderId,
    productName:order.productName,
    referralCode:order.referralCode||faGetReferralCode()
  });
}

function readScriptDataAmount(){
  try{
    var scripts=document.getElementsByTagName("script");
    for(var i=scripts.length-1;i>=0;i--){
      var s=scripts[i];
      var src=s.getAttribute("src")||"";
      if(src.indexOf("tracking.js")===-1&&!s.getAttribute("data-brand-key"))continue;
      var da=s.getAttribute("data-amount");
      if(da!=null&&da!=="")return Number(da);
    }
  }catch(e){}
  return null;
}

/**
 * Thank-you / confirmation auto-track:
 * - Explicit FlowAffiliates.amount or data-amount
 * - Full Shopify multi-source order detection with short retries
 *   (Shopify.checkout often hydrates async after page load)
 */
function tryAutoTrackFromPage(){
  var scriptAmount=readScriptDataAmount();
  if(fa.amount!=null||(scriptAmount!=null&&scriptAmount>0)){
    trackSale({amount:fa.amount!=null?Number(fa.amount):scriptAmount});
    return;
  }

  if(!isLikelyThankYouPage())return;

  var attempts=0;
  var maxAttempts=12;
  function schedule(){
    faCaptureFirstClickFromUrl();
    var order=detectShopifyOrder();
    if(order&&order.amount>0){
      trackDetectedOrder(order);
      return;
    }
    attempts+=1;
    if(attempts>=maxAttempts){
      if(typeof console!=="undefined"&&console.warn){
        console.warn("["+PREFIX+"] Thank-you tracker: could not detect order details yet. Set window.FlowAffiliates.amount or ensure this runs on the confirmation page.");
      }
      return;
    }
    setTimeout(schedule,attempts<4?400:1000);
  }
  schedule();
}

fa.getReferralCode=faGetReferralCode;
fa.detectOrder=detectShopifyOrder;
fa.trackSale=function(input){
  if(!_ready){_queue.push(input||{});return Promise.resolve({ok:false,queued:true});}
  return trackSale(input);
};
fa.capture=function(){faCaptureFirstClickFromUrl();return faGetReferralCode();};
fa.brandKey=fa.brandKey||EMBEDDED_BRAND_KEY||null;

var _ready=false;
function boot(){
  faCaptureFirstClickFromUrl();
  _ready=true;
  fa.brandKey=readBrandKey()||fa.brandKey;
  flushQueue();
  tryAutoTrackFromPage();
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
})();`;

  const cacheControl = brandKeyFromQuery
    ? "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
    : "public, max-age=3600";

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": cacheControl,
      ...corsHeadersForScript(),
    },
  });
}
