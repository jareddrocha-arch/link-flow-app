/**
 * Browser-side Shopify order detection helpers (thank-you / order status pages).
 * Ported from Link Flow Affiliates thank-you tracking.
 *
 * Detection order:
 * 1. window.FlowAffiliates (explicit)
 * 2. Shopify.checkout / Checkout.Order
 * 3. dataLayer (GA4 / UA / gtag purchase)
 * 4. ShopifyAnalytics.meta
 * 5. URL params + light DOM fallbacks
 */
export function buildShopifyOrderDetectJs(): string {
  return `
function toNum(v){
  if(v==null||v==="")return null;
  if(typeof v==="number"&&isFinite(v))return v;
  var s=String(v).replace(/[^0-9.,-]/g,"").replace(/,/g,"");
  var n=parseFloat(s);
  return isFinite(n)?n:null;
}

/** Shopify checkout money is usually integer cents; decimals are already major units. */
function moneyToAmount(raw,assumeCents){
  var n=toNum(raw);
  if(n==null||n<=0)return null;
  var s=String(raw);
  if(s.indexOf(".")!==-1)return n;
  if(assumeCents||(Math.floor(n)===n&&n>=100))return n/100;
  return n;
}

function shopifyNumericId(value){
  if(value==null||value==="")return null;
  var s=String(value);
  var m=s.match(/\\/(?:Product|Order)\\/(\\d+)/i)||s.match(/^gid:\\/\\/shopify\\/(?:Product|Order)\\/(\\d+)/i)||s.match(/^(\\d+)$/);
  return m?m[1]:s;
}

function fromFlowAffiliates(){
  var amount=fa.amount!=null?toNum(fa.amount):null;
  if(!amount||amount<=0)return null;
  return{
    productId:fa.productId!=null?String(fa.productId):"auto",
    amount:amount,
    orderId:fa.orderId!=null?String(fa.orderId):null,
    productName:fa.productName!=null?String(fa.productName):null,
    referralCode:fa.referralCode||null
  };
}

function fromShopifyCheckout(){
  try{
    var c=(window.Shopify&&window.Shopify.checkout)||(window.Shopify&&window.Shopify.Checkout&&window.Shopify.Checkout.Order)||null;
    if(!c)return null;
    var amount=moneyToAmount(c.total_price!=null?c.total_price:c.payment_due,true)||moneyToAmount(c.totalPrice&&c.totalPrice.amount,false)||moneyToAmount(c.total_price,false);
    if(!amount||amount<=0)return null;
    var items=c.line_items||c.lineItems||[];
    var first=items[0]||null;
    var productId=(first&&(first.product_id||first.productId||(first.product&&first.product.id)||(first.variant&&first.variant.product_id)))||null;
    var productName=(first&&(first.title||first.name||(first.product&&first.product.title)))||null;
    var orderId=c.order_id||c.order_number||c.orderId||c.name||(c.order&&(c.order.id||c.order.number))||c.token||null;
    return{
      productId:shopifyNumericId(productId)||"auto",
      amount:amount,
      orderId:orderId!=null?String(shopifyNumericId(orderId)||orderId):null,
      productName:productName,
      referralCode:null
    };
  }catch(e){return null;}
}

function fromDataLayer(){
  try{
    var dl=window.dataLayer;
    if(!dl||!dl.length)return null;
    for(var i=dl.length-1;i>=0;i--){
      var e=dl[i]||{};
      var purchase=null;
      var products=[];
      if(e.event==="purchase"&&e.ecommerce){
        purchase=e.ecommerce;
        products=e.ecommerce.items||e.ecommerce.products||[];
      }
      if(!purchase&&e.ecommerce&&e.ecommerce.purchase){
        purchase=e.ecommerce.purchase;
        products=purchase.products||[];
      }
      if(!purchase&&e[0]==="event"&&e[1]==="purchase"&&e[2]){
        purchase=e[2];
        products=purchase.items||purchase.products||[];
      }
      if(!purchase)continue;
      var af=purchase.actionField||purchase;
      var amount=toNum(af.revenue)||toNum(af.value)||toNum(purchase.value)||toNum(purchase.revenue);
      if(!amount||amount<=0)continue;
      var p0=products[0]||null;
      return{
        productId:shopifyNumericId((p0&&(p0.id||p0.item_id||p0.product_id))||null)||"auto",
        amount:amount,
        orderId:af.id!=null?String(af.id):(purchase.transaction_id!=null?String(purchase.transaction_id):null),
        productName:(p0&&(p0.name||p0.item_name||p0.title))||null,
        referralCode:null
      };
    }
  }catch(e){}
  return null;
}

function fromShopifyAnalytics(){
  try{
    var order=(window.ShopifyAnalytics&&window.ShopifyAnalytics.meta&&(window.ShopifyAnalytics.meta.order||window.ShopifyAnalytics.meta.checkout))||null;
    if(!order)return null;
    var amount=moneyToAmount(order.total_price!=null?order.total_price:order.value,true)||toNum(order.total_price);
    if(!amount||amount<=0)return null;
    return{
      productId:"auto",
      amount:amount,
      orderId:order.id!=null?String(order.id):(order.number!=null?String(order.number):null),
      productName:null,
      referralCode:null
    };
  }catch(e){return null;}
}

function fromUrlAndDom(){
  try{
    var params=new URLSearchParams(location.search);
    var orderId=params.get("order_id")||params.get("order_number")||params.get("checkout_id")||null;
    if(!orderId){
      var m=location.pathname.match(/\\/orders\\/(\\d+)/i);
      if(m)orderId=m[1];
    }
    var amount=null;
    var moneyNodes=document.querySelectorAll("[data-checkout-payment-due-target], .payment-due__price, .total-line__price span, .order-summary__emphasis, .total-recap__final-price");
    for(var i=0;i<moneyNodes.length;i++){
      var t=moneyNodes[i].textContent||"";
      if(!/[0-9]/.test(t))continue;
      amount=toNum(t);
      if(amount&&amount>0)break;
    }
    if(!orderId){
      var bodyText=(document.body&&document.body.innerText)||"";
      var om=bodyText.match(/\\bOrder\\s*#?\\s*([A-Z0-9-]+)/i);
      if(om)orderId=om[1];
    }
    if(!amount||amount<=0)return null;
    return{productId:"auto",amount:amount,orderId:orderId,productName:null,referralCode:null};
  }catch(e){return null;}
}

function detectShopifyOrder(){
  return fromFlowAffiliates()||fromShopifyCheckout()||fromDataLayer()||fromShopifyAnalytics()||fromUrlAndDom();
}

function isLikelyThankYouPage(){
  try{
    var p=(location.pathname||"").toLowerCase();
    var s=(location.search||"").toLowerCase();
    if(/thank[_-]?you|order[_-]?status|\\/orders\\/|checkouts\\/.+\\/thank|confirmation|post[_-]?purchase/.test(p))return true;
    if(s.indexOf("thank")!==-1)return true;
    if(window.Shopify&&window.Shopify.checkout)return true;
    if(fa.amount!=null||fa.orderId!=null)return true;
    if(FORCE_THANK_YOU)return true;
  }catch(e){}
  return false;
}

function alreadySent(orderId){
  try{
    var key=SENT_KEY+"_"+String(orderId||"na");
    if(sessionStorage.getItem(key))return true;
    sessionStorage.setItem(key,"1");
    return false;
  }catch(e){return false;}
}
`;
}
