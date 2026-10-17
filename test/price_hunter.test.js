'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PriceDropHunter } = require('../src/main/finance/price_hunter');
const priceHunterPlugin = require('../src/main/plugins/builtin/price_hunter');

test('PriceDropHunter tracks purchases and accurately calculates drop savings and deadlines', () => {
  const hunter = new PriceDropHunter();
  const purchase = hunter.trackPurchase({
    orderId: 'BBY-98214',
    merchant: 'Best Buy',
    item: 'Sony WH-1000XM5 Headphones',
    purchasedPrice: 399.99,
    purchaseDate: '2026-10-10T12:00:00Z',
    priceMatchGuaranteeDays: 14,
    returnWindowDays: 30
  });

  assert.equal(purchase.orderId, 'BBY-98214');
  assert.equal(purchase.purchasedPrice, 399.99);

  // Check when price drops to 329.99 on day 5 (within 14 days)
  const dropCheck = hunter.checkPriceDrop('BBY-98214', 329.99, {
    currentDate: '2026-10-15T12:00:00Z'
  });

  assert.equal(dropCheck.hasDropped, true);
  assert.equal(dropCheck.savingsAmount, 70.00);
  assert.equal(dropCheck.dropPercentage, 18);
  assert.equal(dropCheck.isPriceMatchEligible, true);
  assert.equal(dropCheck.recommendedStrategy, 'FILE_PRICE_MATCH_CLAIM');
});

test('PriceDropHunter handles expired price match window but valid return window', () => {
  const hunter = new PriceDropHunter();
  hunter.trackPurchase({
    orderId: 'AMZ-1122',
    merchant: 'Amazon',
    item: '4K OLED Gaming Monitor',
    purchasedPrice: 899.99,
    purchaseDate: '2026-10-01T12:00:00Z',
    priceMatchGuaranteeDays: 7,
    returnWindowDays: 30
  });

  // Check on day 15 (price match expired, return still valid)
  const dropCheck = hunter.checkPriceDrop('AMZ-1122', 749.99, {
    currentDate: '2026-10-16T12:00:00Z'
  });

  assert.equal(dropCheck.isPriceMatchEligible, false);
  assert.equal(dropCheck.isReturnWindowEligible, true);
  assert.equal(dropCheck.recommendedStrategy, 'REBUY_AND_RETURN_ORIGINAL');
});

test('PriceDropHunter drafts professional refund claim letters', () => {
  const hunter = new PriceDropHunter();
  hunter.trackPurchase({
    orderId: 'TGT-5544',
    merchant: 'Target',
    item: 'Dyson V15 Vacuum',
    purchasedPrice: 749.99,
    purchaseDate: new Date().toISOString()
  });

  const claim = hunter.draftPriceAdjustmentClaim('TGT-5544', 649.99, 'Alexander Hamilton');
  assert.equal(claim.savings, 100);
  assert.ok(claim.subject.includes('TGT-5544'));
  assert.ok(claim.body.includes('$100.00'));
  assert.ok(claim.body.includes('Alexander Hamilton'));
});

test('PriceDropHunter maximizes coupon stacks and discounts', () => {
  const hunter = new PriceDropHunter();
  const coupons = [
    { code: 'SAVE10', type: 'percent', value: 10 },
    { code: 'FLAT25', type: 'fixed', value: 25, minSpend: 100 },
    { code: 'SAVE20', type: 'percent', value: 20, maxDiscount: 30, minSpend: 50 }
  ];

  // Cart total 200:
  // SAVE10: 20 off
  // FLAT25: 25 off
  // SAVE20: 40 capped at 30 off -> 30 off wins!
  const stack = hunter.evaluateCouponStack(200, coupons);
  assert.equal(stack.savings, 30);
  assert.equal(stack.finalTotal, 170);
  assert.equal(stack.bestCouponCode, 'SAVE20');
});

test('Price Drop Hunter builtin plugin tools run properly', async () => {
  const trackTool = priceHunterPlugin.find(t => t.name === 'price_track_recent_purchase');
  const checkTool = priceHunterPlugin.find(t => t.name === 'price_check_for_refund');

  assert.ok(trackTool);
  assert.ok(checkTool);

  const mockCtx = { log: () => {} };
  await trackTool.run({
    order_id: 'TEST-123',
    merchant: 'Apple',
    item_title: 'MacBook Pro M4',
    price_paid: 1999.00
  }, mockCtx);

  const checkOut = await checkTool.run({
    order_id: 'TEST-123',
    current_market_price: 1799.00
  }, mockCtx);

  assert.ok(checkOut.includes('PRICE DROP DETECTED'));
  assert.ok(checkOut.includes('200.00'));
});
