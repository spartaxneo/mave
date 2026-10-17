'use strict';
// Personal Financial Sentinel & Wealth Intelligence Engine for Mave.
// 1. Portfolio & Asset Tracker (Stocks, ETFs, Crypto, Real Estate)
// 2. Subscription Sentinel (Detects recurring charges, alerts on expiring free trials, one-click cancel guidance)
// 3. Receipt & Expense Auditor (Categorizes spending, flags tax-deductible items, forecasts monthly burn)
// Operates 100% sovereignly and locally with zero banking data sent to third parties.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultFinanceDir() {
  const base = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(base, 'finance', 'financial_data.json');
}

const DEFAULT_PORTFOLIO = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', quantity: 45, buyPriceUsd: 110.0, currentPriceUsd: 138.5, assetType: 'stock' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', quantity: 60, buyPriceUsd: 480.0, currentPriceUsd: 535.2, assetType: 'etf' },
  { symbol: 'BTC', name: 'Bitcoin', quantity: 0.65, buyPriceUsd: 58000.0, currentPriceUsd: 68500.0, assetType: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', quantity: 4.2, buyPriceUsd: 2900.0, currentPriceUsd: 3600.0, assetType: 'crypto' },
];

const DEFAULT_SUBSCRIPTIONS = [
  { id: 'sub_aws', name: 'Amazon Web Services (AWS)', costMonthlyUsd: 34.5, nextRenewal: '2026-11-01', category: 'Cloud/Dev', isTrial: false, cancelUrl: 'https://console.aws.amazon.com/billing' },
  { id: 'sub_github', name: 'GitHub Copilot / Team', costMonthlyUsd: 19.0, nextRenewal: '2026-11-05', category: 'Dev Tools', isTrial: false, cancelUrl: 'https://github.com/settings/billing' },
  { id: 'sub_gym', name: 'Equinox / Local Gym', costMonthlyUsd: 120.0, nextRenewal: '2026-11-01', category: 'Health', isTrial: false, cancelUrl: 'https://gym.com/membership' },
  { id: 'sub_ai_trial', name: 'Claude Pro Trial', costMonthlyUsd: 20.0, nextRenewal: '2026-10-20', category: 'AI Tools', isTrial: true, cancelUrl: 'https://claude.ai/settings/billing' },
];

class FinancialSentinel {
  constructor(filePath = defaultFinanceDir()) {
    this.filePath = filePath;
    this.portfolio = [];
    this.subscriptions = [];
    this.expenses = [];
    this.monthlyBudget = { monthlyIncomeUsd: 9500, fixedCostTargetUsd: 3800, discretionaryBudgetUsd: 2000 };
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.portfolio)) this.portfolio = data.portfolio;
        if (Array.isArray(data.subscriptions)) this.subscriptions = data.subscriptions;
        if (Array.isArray(data.expenses)) this.expenses = data.expenses;
        if (data.monthlyBudget) this.monthlyBudget = { ...this.monthlyBudget, ...data.monthlyBudget };
        return;
      }
    } catch {}

    this.portfolio = JSON.parse(JSON.stringify(DEFAULT_PORTFOLIO));
    this.subscriptions = JSON.parse(JSON.stringify(DEFAULT_SUBSCRIPTIONS));
    this.saveSync();
  }

  saveSync() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload = {
        updatedAt: Date.now(),
        portfolio: this.portfolio,
        subscriptions: this.subscriptions,
        expenses: this.expenses.slice(0, 500),
        monthlyBudget: this.monthlyBudget,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSync();
    }, 1500);
  }

  getPortfolio() {
    let totalValue = 0;
    let totalCost = 0;

    const assets = this.portfolio.map((a) => {
      const val = a.quantity * a.currentPriceUsd;
      const cost = a.quantity * a.buyPriceUsd;
      const pnl = val - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      totalValue += val;
      totalCost += cost;
      return {
        ...a,
        totalValueUsd: Number(val.toFixed(2)),
        unrealizedPnlUsd: Number(pnl.toFixed(2)),
        pnlPct: Number(pnlPct.toFixed(2)),
      };
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    return {
      totalValueUsd: Number(totalValue.toFixed(2)),
      totalCostUsd: Number(totalCost.toFixed(2)),
      totalPnlUsd: Number(totalPnl.toFixed(2)),
      totalPnlPct: Number(totalPnlPct.toFixed(2)),
      assets,
    };
  }

  addOrUpdateAsset({ symbol, name, quantity, buyPriceUsd, currentPriceUsd, assetType = 'stock' }) {
    if (!symbol) throw new Error('Symbol is required.');
    const s = symbol.toUpperCase().trim();
    const idx = this.portfolio.findIndex((p) => p.symbol === s);

    const record = {
      symbol: s,
      name: name || s,
      quantity: Number(quantity) || 0,
      buyPriceUsd: Number(buyPriceUsd) || 0,
      currentPriceUsd: Number(currentPriceUsd) || buyPriceUsd,
      assetType: String(assetType).toLowerCase(),
    };

    if (idx >= 0) {
      this.portfolio[idx] = { ...this.portfolio[idx], ...record };
    } else {
      this.portfolio.push(record);
    }

    this.scheduleSave();
    return record;
  }

  getSubscriptions() {
    const totalMonthly = this.subscriptions.reduce((sum, s) => sum + (s.costMonthlyUsd || 0), 0);
    return {
      count: this.subscriptions.length,
      totalMonthlyUsd: Number(totalMonthly.toFixed(2)),
      totalAnnualUsd: Number((totalMonthly * 12).toFixed(2)),
      subscriptions: this.subscriptions,
    };
  }

  addSubscription({ name, costMonthlyUsd, nextRenewal, category = 'General', isTrial = false, cancelUrl = '' }) {
    if (!name || costMonthlyUsd == null) throw new Error('Subscription name and monthly cost are required.');
    const sub = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: String(name).trim(),
      costMonthlyUsd: Number(costMonthlyUsd),
      nextRenewal: String(nextRenewal || 'Next Month'),
      category: String(category).trim(),
      isTrial: Boolean(isTrial),
      cancelUrl: String(cancelUrl).trim(),
    };
    this.subscriptions.push(sub);
    this.scheduleSave();
    return sub;
  }

  checkTrialExpirations(daysAhead = 4) {
    const now = new Date();
    const expiring = [];

    for (const sub of this.subscriptions) {
      if (sub.nextRenewal) {
        const renDate = new Date(sub.nextRenewal);
        if (!isNaN(renDate.getTime())) {
          const diffDays = Math.ceil((renDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (diffDays >= 0 && diffDays <= daysAhead) {
            expiring.push({
              ...sub,
              daysRemaining: diffDays,
              warning: sub.isTrial
                ? `🚨 FREE TRIAL ENDING: ${sub.name} will charge $${sub.costMonthlyUsd} in ${diffDays} day(s). Cancel at: ${sub.cancelUrl || 'Account settings'}`
                : `Upcoming renewal: ${sub.name} ($${sub.costMonthlyUsd}) in ${diffDays} day(s).`,
            });
          }
        }
      }
    }

    return expiring;
  }

  recordExpense({ vendor, amountUsd, category = 'General', date = new Date().toISOString().slice(0, 10), taxDeductible = false, receiptNote = '' }) {
    if (!vendor || amountUsd == null) throw new Error('Vendor and amount are required.');
    const expense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      vendor: String(vendor).trim(),
      amountUsd: Number(amountUsd),
      category: String(category).trim(),
      date: String(date),
      taxDeductible: Boolean(taxDeductible),
      receiptNote: String(receiptNote).trim(),
      createdAt: Date.now(),
    };
    this.expenses.unshift(expense);
    this.scheduleSave();
    return expense;
  }

  getBudgetRunway() {
    const totalSubs = this.subscriptions.reduce((sum, s) => sum + (s.costMonthlyUsd || 0), 0);
    const fixed = this.monthlyBudget.fixedCostTargetUsd + totalSubs;
    const projectedSavings = Math.max(0, this.monthlyBudget.monthlyIncomeUsd - fixed - this.monthlyBudget.discretionaryBudgetUsd);
    const savingsRatePct = this.monthlyBudget.monthlyIncomeUsd > 0
      ? (projectedSavings / this.monthlyBudget.monthlyIncomeUsd) * 100
      : 0;

    return {
      monthlyIncomeUsd: this.monthlyBudget.monthlyIncomeUsd,
      fixedExpensesUsd: fixed,
      discretionaryBudgetUsd: this.monthlyBudget.discretionaryBudgetUsd,
      projectedSavingsUsd: projectedSavings,
      savingsRatePct: Number(savingsRatePct.toFixed(1)),
      runwayHealth: savingsRatePct >= 20 ? 'Excellent (>20% savings)' : 'Moderate',
    };
  }
}

let financialSentinelInstance = null;
function getFinancialSentinel(customPath = null) {
  if (customPath) return new FinancialSentinel(customPath);
  if (!financialSentinelInstance) financialSentinelInstance = new FinancialSentinel();
  return financialSentinelInstance;
}

module.exports = {
  FinancialSentinel,
  getFinancialSentinel,
  DEFAULT_PORTFOLIO,
  DEFAULT_SUBSCRIPTIONS,
};
