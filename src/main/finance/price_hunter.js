'use strict';

/**
 * PriceDropHunter - Autonomous Post-Purchase Price Protection & Refund Concierge
 * 
 * Tracks past purchases within retailer return / price-guarantee windows (14-30 days),
 * monitors active price fluctuations, and auto-drafts merchant price adjustment claims.
 */

class PriceDropHunter {
  constructor() {
    this.trackedPurchases = new Map(); // orderId -> purchaseRecord
    this.wishlist = new Map();         // itemId -> wishlistRecord
  }

  trackPurchase(record = {}) {
    if (!record.orderId || !record.item || typeof record.purchasedPrice !== 'number') {
      throw new Error('Valid orderId, item title, and purchasedPrice are required');
    }

    const purchaseDate = record.purchaseDate ? new Date(record.purchaseDate) : new Date();
    const returnDays = record.returnWindowDays ?? 30;
    const priceMatchDays = record.priceMatchGuaranteeDays ?? 14;

    const returnDeadline = new Date(purchaseDate.getTime() + returnDays * 24 * 60 * 60 * 1000);
    const priceMatchDeadline = new Date(purchaseDate.getTime() + priceMatchDays * 24 * 60 * 60 * 1000);

    const purchase = {
      orderId: record.orderId,
      merchant: record.merchant || 'Retailer',
      item: record.item,
      purchasedPrice: record.purchasedPrice,
      purchaseDate: purchaseDate.toISOString(),
      returnDeadline: returnDeadline.toISOString(),
      priceMatchDeadline: priceMatchDeadline.toISOString(),
      active: true,
      refundClaimed: false
    };

    this.trackedPurchases.set(record.orderId, purchase);
    return purchase;
  }

  checkPriceDrop(orderId, currentPrice, options = {}) {
    const purchase = this.trackedPurchases.get(orderId);
    if (!purchase) throw new Error(`Tracked purchase ${orderId} not found`);

    const now = options.currentDate ? new Date(options.currentDate) : new Date();
    const matchDeadline = new Date(purchase.priceMatchDeadline);
    const returnDeadline = new Date(purchase.returnDeadline);

    const isPriceMatchEligible = now <= matchDeadline;
    const isReturnWindowEligible = now <= returnDeadline;

    const diff = purchase.purchasedPrice - currentPrice;
    const hasDropped = diff > 0.01;

    const percentage = hasDropped ? Math.round((diff / purchase.purchasedPrice) * 100) : 0;

    return {
      orderId,
      item: purchase.item,
      merchant: purchase.merchant,
      originalPrice: purchase.purchasedPrice,
      currentPrice,
      savingsAmount: hasDropped ? Math.round(diff * 100) / 100 : 0,
      dropPercentage: percentage,
      hasDropped,
      isPriceMatchEligible,
      isReturnWindowEligible,
      recommendedStrategy: hasDropped && isPriceMatchEligible
        ? 'FILE_PRICE_MATCH_CLAIM'
        : hasDropped && isReturnWindowEligible
        ? 'REBUY_AND_RETURN_ORIGINAL'
        : 'NO_ACTION'
    };
  }

  draftPriceAdjustmentClaim(orderId, currentPrice, customerName = 'Valued Customer') {
    const check = this.checkPriceDrop(orderId, currentPrice);
    if (!check.hasDropped) {
      throw new Error('Current price is not lower than the original purchased price.');
    }

    const subject = `Price Adjustment Request: Order #${check.orderId} - ${check.item}`;
    const body = `Dear ${check.merchant} Customer Support Team,

I recently purchased "${check.item}" on ${new Date().toLocaleDateString()} under Order #${check.orderId} for $${check.originalPrice.toFixed(2)}.

I noticed today that the price on your store has dropped to $${check.currentPrice.toFixed(2)}, which represents a difference of $${check.savingsAmount.toFixed(2)}.

Since this purchase is well within your price protection and return window, I would appreciate it if you could issue a price adjustment refund of $${check.savingsAmount.toFixed(2)} to my original payment method, rather than having me initiate a return and repurchase.

Thank you very much for your outstanding customer service.

Warm regards,
${customerName}
Order #${check.orderId}`;

    return {
      subject,
      recipient: `support@${check.merchant.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      savings: check.savingsAmount,
      body
    };
  }

  evaluateCouponStack(cartTotal, availableCoupons = []) {
    let bestDiscount = 0;
    let bestCoupon = null;

    for (const c of availableCoupons) {
      if (cartTotal < (c.minSpend || 0)) continue;
      let discount = 0;
      if (c.type === 'percent') {
        discount = (cartTotal * c.value) / 100;
        if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
      } else if (c.type === 'fixed') {
        discount = c.value;
      }

      if (discount > bestDiscount) {
        bestDiscount = discount;
        bestCoupon = c;
      }
    }

    const finalTotal = Math.max(0, cartTotal - bestDiscount);
    return {
      originalTotal: cartTotal,
      savings: Math.round(bestDiscount * 100) / 100,
      finalTotal: Math.round(finalTotal * 100) / 100,
      bestCouponCode: bestCoupon ? bestCoupon.code : null
    };
  }
}

let _hunter = null;
function getPriceDropHunter() {
  if (!_hunter) {
    _hunter = new PriceDropHunter();
  }
  return _hunter;
}

module.exports = { PriceDropHunter, getPriceDropHunter };
