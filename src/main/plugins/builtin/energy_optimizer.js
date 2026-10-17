'use strict';
// Smart Home Solar & Grid Energy Optimizer Plugin for Mave.

const { getEnergyOptimizer } = require('../../energy/energy_optimizer');

module.exports = [
  {
    name: 'energy_view_solar_grid',
    description: 'Check live household solar generation, home power consumption, battery storage percentage, grid export, and Time-of-Use (TOU) electricity pricing.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const opt = getEnergyOptimizer();
      ctx.log('info', 'Auditing live solar power and grid flow...');

      const m = opt.getEnergyMetrics();
      const netIcon = m.gridNetKw < 0 ? '☀️ Exporting to Grid' : '🔌 Importing from Grid';

      return `⚡ **SOLAR & HOUSEHOLD ENERGY DASHBOARD**:
• **Solar Generation**: **${m.solarProductionKw} kW** (Produced Today: ${m.todaySolarGeneratedKwh} kWh)
• **Home Consumption**: **${m.homeConsumptionKw} kW**
• **Solar Surplus**: **${m.surplusKw} kW** (${m.isSelfSustaining ? '🟢 100% Solar Powered' : 'Grid supplemented'})
• **Battery Storage (Powerwall)**: **${m.batteryStorage.socPct}%** (${m.batteryStorage.capacityKwh} kWh capacity)
• **Net Grid Exchange**: **${Math.abs(m.gridNetKw)} kW** (${netIcon})

💲 **Rate & Economics**:
• **Active TOU Tier**: **${m.touTier}** ($${m.currentRateUsd}/kWh)
• **Today\'s Avoided Cost Savings**: **$${m.dailyCostSavingsUsd}**
• **Guidance**: ${m.rateAdvice}`;
    },
  },

  {
    name: 'energy_get_appliance_load_recommendations',
    description: 'Get autonomous smart scheduling recommendations for EV charging, dishwasher, laundry, and climate control to maximize free solar and minimize peak utility bills.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const opt = getEnergyOptimizer();
      const recs = opt.getApplianceRecommendations();

      if (!recs.length) {
        return '☀️ Energy grid nominal: Normal appliance usage is fine at current rate tier.';
      }

      const rows = recs.map((r) => `• **${r.appliance}** (\`${r.status}\`): ${r.reason}`).join('\n');

      return `💡 **SMART APPLIANCE LOAD SHIFTING RECOMMENDATIONS**:\n\n${rows}`;
    },
  },
];
