'use strict';
// Autonomous Price-Drop Hunter & Post-Purchase Refund Concierge Plugin for Mave.

const { getPriceDropHunter } = require('../../finance/price_hunter');

module.exports = [
  {
    name: 'price_track_recent_purchase',
    description: 'Tracks a recent purchase under merchant price-match guarantee and return windows to monitor for subsequent price drops.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID or receipt confirmation number.' },
        merchant: { type: 'string', description: 'Store name (e.g., Best Buy, Amazon, Apple, B&H).' },
        item_title: { type: 'string', description: 'Name of the item purchased.' },
        price_paid: { type: 'number', description: 'Original price paid in dollars.' },
        price_match_days: { type: 'number', description: 'Price match guarantee window in days (default 14).' },
      },
      required: ['order_id', 'merchant', 'item_title', 'price_paid'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hunter = getPriceDropHunter();
      ctx.log('info', `Registering purchase for price protection: ${input.item_title}`);

      const record = hunter.trackPurchase({
        orderId: input.order_id,
        merchant: input.merchant,
        item: input.item_title,
        purchasedPrice: input.price_paid,
        priceMatchGuaranteeDays: input.price_match_days || 14,
      });

      return `🏷️ **PRICE PROTECTION ACTIVATED**:
• **Item**: **${record.item}** (${record.merchant})
• **Price Paid**: **$${record.purchasedPrice.toFixed(2)}**
• **Price Match Deadline**: \`${new Date(record.priceMatchDeadline).toLocaleDateString()}\`
• **Return Window Closes**: \`${new Date(record.returnDeadline).toLocaleDateString()}\`
*Mave will continuously monitor competitor & merchant pricing for drop refunds.*`;
    },
  },

  {
    name: 'price_check_for_refund',
    description: 'Checks if a tracked purchase qualifies for a price-match refund based on current lower market pricing.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Tracked order ID.' },
        current_market_price: { type: 'number', description: 'Current lower price observed online.' },
      },
      required: ['order_id', 'current_market_price'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hunter = getPriceDropHunter();
      ctx.log('info', `Evaluating price drop refund eligibility for ${input.order_id}...`);

      const result = hunter.checkPriceDrop(input.order_id, input.current_market_price);
      if (!result.hasDropped) {
        return `✅ **No Price Drop**: Current price ($${result.currentPrice}) is equal to or higher than original purchase ($${result.originalPrice}).`;
      }

      return `🎉 **PRICE DROP DETECTED - REFUND ELIGIBLE**:
• **Item**: ${result.item} (${result.merchant})
• **Original Price**: $${result.originalPrice.toFixed(2)} ➔ **Current Price**: **$${result.currentPrice.toFixed(2)}**
• **Potential Refund**: 💵 **$${result.savingsAmount.toFixed(2)}** (${result.dropPercentage}% drop)
• **Recommended Strategy**: \`${result.recommendedStrategy}\`
• **Price Match Window Valid**: ${result.isPriceMatchEligible ? 'YES ✅' : 'EXPIRED ❌'}`;
    },
  },

  {
    name: 'price_draft_refund_claim',
    description: 'Generates an official, polite price adjustment email ready to send to retailer customer support.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID.' },
        current_lower_price: { type: 'number', description: 'The lower price to claim difference for.' },
        customer_name: { type: 'string', description: 'Your full name.' },
      },
      required: ['order_id', 'current_lower_price'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hunter = getPriceDropHunter();
      ctx.log('info', 'Composing merchant price adjustment claim...');

      const claim = hunter.draftPriceAdjustmentClaim(input.order_id, input.current_lower_price, input.customer_name || 'Valued Customer');
      return `✉️ **PRICE ADJUSTMENT EMAIL READY TO DISPATCH**:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**To**: \`${claim.recipient}\`  
**Subject**: \`${claim.subject}\`  
**Claimed Refund**: **$${claim.savings.toFixed(2)}**

${claim.body}`;
    },
  },
];
