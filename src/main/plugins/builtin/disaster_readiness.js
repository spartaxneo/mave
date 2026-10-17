'use strict';
// Autonomous Emergency Survival & Disaster Readiness Sentinel Plugin for Mave.

const { getDisasterReadinessSentinel } = require('../../safety/disaster_readiness');

module.exports = [
  {
    name: 'disaster_triage_emergency_alert',
    description: 'Triages incoming severe weather warnings (Tornado, Flash Flood, Earthquake, Wildfire) and gives immediate life-saving shelter protocols.',
    input_schema: {
      type: 'object',
      properties: {
        event_title: { type: 'string', description: 'Name of the severe alert (e.g., Tornado Warning, Flash Flood Warning).' },
        severity: { type: 'string', enum: ['EXTREME', 'SEVERE', 'MODERATE', 'MINOR'], description: 'Alert severity.' },
      },
      required: ['event_title'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getDisasterReadinessSentinel();
      ctx.log('info', `Triaging emergency disaster alert: ${input.event_title}`);

      const triage = sentinel.triageWeatherAlert({
        event: input.event_title,
        severity: input.severity || 'SEVERE',
      });

      return `🚨 **EMERGENCY LIFE-SAFETY DISPATCH**:
• **Threat Event**: **${triage.event}** (\`${triage.urgencyLevel}\`)
• **Required Protocol**: \`${triage.shelterProtocol}\`
• **Immediate Life-Saving Action**:
  👉 **${triage.immediateInstructions}**
• **Essential Gear to Grab**: \`${triage.essentialGear.join(', ')}\``;
    },
  },

  {
    name: 'disaster_calculate_survival_provisions',
    description: 'Calculates potable water gallons and high-density nutritional rations needed for family survival reserves.',
    input_schema: {
      type: 'object',
      properties: {
        family_members_count: { type: 'number', description: 'Number of people in household.' },
        duration_days: { type: 'number', description: 'Number of survival days to provision for (default 3).' },
      },
      required: ['family_members_count'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getDisasterReadinessSentinel();
      ctx.log('info', 'Calculating FEMA survival rations and potable water quotas...');

      const prov = sentinel.calculateWaterAndRations(input.family_members_count, input.duration_days || 3);
      return `🚰 **SURVIVAL PROVISIONS QUOTA** (${prov.familyMembers} people, ${prov.daysCovered} days):
• **Potable Water Required**: **${prov.requiredWaterGallons} Gallons** (~${prov.requiredWaterLiters} Liters)
• **Total Caloric Reserves**: **${prov.totalCaloriesRequired.toLocaleString()} kcal**
• **Recommended Storage**:
${prov.recommendedRationTypes.map(r => `  • ${r}`).join('\n')}`;
    },
  },

  {
    name: 'disaster_calculate_outage_runtime',
    description: 'Calculates remaining electrical runtime across EV vehicle-to-load, home battery storage, and UPS units during a blackout.',
    input_schema: {
      type: 'object',
      properties: {
        ev_battery_kwh: { type: 'number', description: 'EV battery pack capacity in kWh (default 75).' },
        ev_charge_percentage: { type: 'number', description: 'Current EV battery state of charge (e.g. 80%).' },
        operational_mode: {
          type: 'string',
          enum: ['ESSENTIAL', 'BALANCED', 'EXTENDED'],
          description: 'Power conservation mode: ESSENTIAL (50W), BALANCED (200W), EXTENDED (400W).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getDisasterReadinessSentinel();
      ctx.log('info', 'Computing blackout power endurance runtime...');

      const runtime = sentinel.calculatePowerOutageEndurance({
        evBatteryKWh: input.ev_battery_kwh || 75,
        evChargePercentage: input.ev_charge_percentage || 80,
        operationalMode: input.operational_mode || 'BALANCED',
      });

      return `🔋 **BLACKOUT SURVIVAL ENDURANCE ESTIMATE**:
• **Operational Mode**: \`${runtime.operationalMode}\` (~${runtime.estimatedDrawWatts} Watts continuous draw)
• **Total Stored Energy**: **${(runtime.totalStoredEnergyWh / 1000).toFixed(1)} kWh**
• **Estimated Power Runtime**: **${runtime.totalRuntimeHours} Hours** (~**${runtime.totalRuntimeDays} Days**)
• **Supported Devices**: *${runtime.appliancesSupported}*`;
    },
  },
];
