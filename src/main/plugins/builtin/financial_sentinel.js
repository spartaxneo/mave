'use strict';
// Personal Financial Sentinel & Wealth Plugin for Mave.

const { getFinancialSentinel } = require('../../finance/financial_sentinel');

module.exports = [
  {
    name: 'finance_view_portfolio',
    description: 'View real-time investment portfolio metrics (stocks, ETFs, crypto), unrealized profit/loss (P&L), and asset allocations.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const fin = getFinancialSentinel();
      ctx.log('info', 'Calculating portfolio performance and unrealized gains...');

      const p = fin.getPortfolio();
      const rows = p.assets.map((a) => `• **${a.symbol}** (${a.name}): ${a.quantity} units @ $${a.currentPriceUsd} | Value: **$${a.totalValueUsd.toLocaleString()}** (P&L: ${a.unrealizedPnlUsd >= 0 ? '+' : ''}$${a.unrealizedPnlUsd} / ${a.pnlPct}%)`).join('\n');

      return `📈 **INVESTMENT PORTFOLIO DASHBOARD**:
• **Total Portfolio Value**: **$${p.totalValueUsd.toLocaleString()}**
• **Total Cost Basis**: $${p.totalCostUsd.toLocaleString()}
• **Total Unrealized P&L**: **${p.totalPnlUsd >= 0 ? '🟢 +' : '🔴 '}$${p.totalPnlUsd.toLocaleString()} (${p.totalPnlPct}%)**

📊 **Holdings**:
${rows}`;
    },
  },

  {
    name: 'finance_audit_subscriptions',
    description: 'Audit recurring monthly/annual subscriptions, calculate annual recurring cost, and detect expiring free trials before they auto-renew.',
    input_schema: {
      type: 'object',
      properties: {
        alert_days_ahead: { type: 'number', description: 'Days ahead to check for expiring free trials (default: 4).' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const fin = getFinancialSentinel();
      const subs = fin.getSubscriptions();
      const expiring = fin.checkTrialExpirations(Number(input.alert_days_ahead) || 4);

      const rows = subs.subscriptions.map((s) => `• **${s.name}** [${s.category}]: **$${s.costMonthlyUsd}/mo** (Renews: ${s.nextRenewal}) ${s.isTrial ? '⚠️ *Trial*' : ''}`).join('\n');
      const expiringBanner = expiring.length > 0
        ? `🚨 **EXPIRING FREE TRIALS / IMMINENT CHARGES (${expiring.length})**:\n` + expiring.map((e) => `• ${e.warning}`).join('\n') + '\n\n---\n'
        : '✅ **No free trials expiring in immediate window.**\n\n---\n';

      return `💳 **SUBSCRIPTION SENTINEL AUDIT**:
${expiringBanner}• **Total Active Subscriptions**: **${subs.count}**
• **Monthly Recurring Burn**: **$${subs.totalMonthlyUsd}/month**
• **Annualized Cost**: **$${subs.totalAnnualUsd.toLocaleString()}/year**

📋 **Monitored Services**:
${rows}`;
    },
  },

  {
    name: 'finance_record_expense',
    description: 'Log an expense or parsed receipt with vendor, category, amount, and tax-deductible status into private financial memory.',
    input_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'Store, merchant, or service name (e.g. "Micro Center", "GitHub", "Trader Joe\'s").' },
        amount_usd: { type: 'number', description: 'Expense amount in USD.' },
        category: { type: 'string', description: 'Category (e.g. "Hardware", "Groceries", "Software", "Travel").' },
        tax_deductible: { type: 'boolean', description: 'Whether this expense qualifies as a tax deduction.' },
        receipt_note: { type: 'string', description: 'Optional details (e.g. "RAM upgrade for local AI model workstation").' },
      },
      required: ['vendor', 'amount_usd'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const fin = getFinancialSentinel();
      const exp = fin.recordExpense({
        vendor: input.vendor,
        amountUsd: input.amount_usd,
        category: input.category || 'General',
        taxDeductible: input.tax_deductible,
        receiptNote: input.receipt_note,
      });

      return `🧾 **EXPENSE LOGGED**:
• **Vendor**: **${exp.vendor}**
• **Amount**: **$${exp.amountUsd.toFixed(2)}**
• **Category**: \`${exp.category}\`
• **Tax Deductible**: ${exp.taxDeductible ? '✅ Yes (Business/Equipment)' : 'No'}
• **Note**: ${exp.receiptNote || 'Logged to personal ledger'}`;
    },
  },

  {
    name: 'finance_budget_runway',
    description: 'Calculate monthly budget runway, fixed expenses, discretionary spending limit, and projected savings rate.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const fin = getFinancialSentinel();
      const b = fin.getBudgetRunway();

      return `💰 **MONTHLY BUDGET & SAVINGS RUNWAY**:
• **Target Monthly Income**: **$${b.monthlyIncomeUsd.toLocaleString()}**
• **Fixed Overhead & Subscriptions**: **$${b.fixedExpensesUsd.toLocaleString()}**
• **Discretionary Allowance**: **$${b.discretionaryBudgetUsd.toLocaleString()}**
• **Projected Net Monthly Savings**: **$${b.projectedSavingsUsd.toLocaleString()}**
• **Savings Rate**: **${b.savingsRatePct}%** (Health: \`${b.runwayHealth}\`)`;
    },
  },
];
