'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  FinancialSentinel,
  getFinancialSentinel,
} = require('../src/main/finance/financial_sentinel');

const financePlugins = require('../src/main/plugins/builtin/financial_sentinel');

test('FinancialSentinel calculates portfolio metrics and updates holdings', () => {
  const tmpFile = path.join(os.tmpdir(), `test_finance_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const fin = new FinancialSentinel(tmpFile);

  const p = fin.getPortfolio();
  assert.ok(p.totalValueUsd > 0);
  assert.ok(p.assets.length >= 4);

  // Add new holding
  fin.addOrUpdateAsset({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 25,
    buyPriceUsd: 180,
    currentPriceUsd: 230,
    assetType: 'stock',
  });

  const updatedP = fin.getPortfolio();
  assert.ok(updatedP.assets.some((a) => a.symbol === 'AAPL'));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('FinancialSentinel audits subscriptions and identifies expiring trials', () => {
  const tmpFile = path.join(os.tmpdir(), `test_finance_subs_${Date.now()}.json`);
  const fin = new FinancialSentinel(tmpFile);

  const subs = fin.getSubscriptions();
  assert.ok(subs.count >= 4);
  assert.ok(subs.totalMonthlyUsd > 0);

  // Add a trial expiring in 2 days
  const twoDaysLater = new Date(Date.now() + 2 * 86400 * 1000).toISOString().slice(0, 10);
  fin.addSubscription({
    name: 'Video AI Cloud Trial',
    costMonthlyUsd: 49.0,
    nextRenewal: twoDaysLater,
    isTrial: true,
  });

  const expiring = fin.checkTrialExpirations(3);
  assert.ok(expiring.length >= 1);
  assert.ok(expiring.some((e) => e.name === 'Video AI Cloud Trial'));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('FinancialSentinel records expenses and computes budget runway', () => {
  const tmpFile = path.join(os.tmpdir(), `test_finance_exp_${Date.now()}.json`);
  const fin = new FinancialSentinel(tmpFile);

  const exp = fin.recordExpense({
    vendor: 'Newegg Workstation Parts',
    amountUsd: 450.0,
    category: 'Hardware',
    taxDeductible: true,
  });

  assert.equal(exp.vendor, 'Newegg Workstation Parts');
  assert.equal(exp.taxDeductible, true);

  const budget = fin.getBudgetRunway();
  assert.ok(budget.savingsRatePct > 0);
  assert.equal(budget.monthlyIncomeUsd, 9500);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Financial Sentinel builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(financePlugins));
  assert.equal(financePlugins.length, 4);

  const portTool = financePlugins.find((p) => p.name === 'finance_view_portfolio');
  const subsTool = financePlugins.find((p) => p.name === 'finance_audit_subscriptions');
  const expTool = financePlugins.find((p) => p.name === 'finance_record_expense');
  const bgtTool = financePlugins.find((p) => p.name === 'finance_budget_runway');

  assert.ok(portTool);
  assert.ok(subsTool);
  assert.ok(expTool);
  assert.ok(bgtTool);

  const mockCtx = { log: () => {} };

  const portRes = await portTool.run({}, mockCtx);
  assert.match(portRes, /INVESTMENT PORTFOLIO DASHBOARD/i);

  const subsRes = await subsTool.run({ alert_days_ahead: 5 }, mockCtx);
  assert.match(subsRes, /SUBSCRIPTION SENTINEL AUDIT/i);

  const expRes = await expTool.run({ vendor: 'Office Supply Co', amount_usd: 85.5 }, mockCtx);
  assert.match(expRes, /EXPENSE LOGGED/i);

  const bgtRes = await bgtTool.run({}, mockCtx);
  assert.match(bgtRes, /MONTHLY BUDGET & SAVINGS RUNWAY/i);
});
