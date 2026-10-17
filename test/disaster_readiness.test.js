'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DisasterReadinessSentinel } = require('../src/main/safety/disaster_readiness');
const disasterPlugin = require('../src/main/plugins/builtin/disaster_readiness');

test('DisasterReadinessSentinel triages severe tornado alerts with interior room shelter protocol', () => {
  const sentinel = new DisasterReadinessSentinel();
  const triage = sentinel.triageWeatherAlert({
    event: 'Tornado Warning',
    severity: 'EXTREME'
  });

  assert.equal(triage.threatType, 'TORNADO');
  assert.equal(triage.urgencyLevel, 'CRITICAL_IMMEDIATE_ACTION');
  assert.equal(triage.shelterProtocol, 'SHELTER_INTERIOR_LOWEST_FLOOR');
  assert.ok(triage.immediateInstructions.includes('lowest floor'));
  assert.ok(triage.essentialGear.includes('Helmet'));
});

test('DisasterReadinessSentinel calculates potable water and caloric rations for family', () => {
  const sentinel = new DisasterReadinessSentinel();
  const provisions = sentinel.calculateWaterAndRations(4, 3); // 4 people, 3 days

  assert.equal(provisions.familyMembers, 4);
  assert.equal(provisions.daysCovered, 3);
  assert.equal(provisions.requiredWaterGallons, 12); // 4 * 3 * 1 gal
  assert.equal(provisions.totalCaloriesRequired, 26400); // 4 * 3 * 2200 kcal
});

test('DisasterReadinessSentinel calculates realistic blackout power endurance using EV V2L', () => {
  const sentinel = new DisasterReadinessSentinel();
  const outage = sentinel.calculatePowerOutageEndurance({
    evBatteryKWh: 80,
    evChargePercentage: 80,
    homeUpsWh: 1500,
    portableBanksWh: 500,
    operationalMode: 'BALANCED' // 200W
  });

  // Usable EV: 80,000 * 0.80 * 0.85 = 54,400 Wh
  // Total Wh: 54,400 + 1500 + 500 = 56,400 Wh
  // Runtime at 200W: 56,400 / 200 = 282 hours (~11.75 days)
  assert.equal(outage.operationalMode, 'BALANCED');
  assert.equal(outage.estimatedDrawWatts, 200);
  assert.ok(outage.totalRuntimeHours > 250);
  assert.ok(outage.totalRuntimeDays > 10);
  assert.ok(outage.appliancesSupported.includes('refrigerator'));
});

test('Disaster Readiness builtin plugin tools run properly', async () => {
  const triageTool = disasterPlugin.find(t => t.name === 'disaster_triage_emergency_alert');
  const provTool = disasterPlugin.find(t => t.name === 'disaster_calculate_survival_provisions');
  const outageTool = disasterPlugin.find(t => t.name === 'disaster_calculate_outage_runtime');

  assert.ok(triageTool);
  assert.ok(provTool);
  assert.ok(outageTool);

  const mockCtx = { log: () => {} };
  const triageOut = await triageTool.run({ event_title: 'Flash Flood Warning', severity: 'SEVERE' }, mockCtx);
  assert.ok(triageOut.includes('EMERGENCY LIFE-SAFETY DISPATCH'));
  assert.ok(triageOut.includes('SEEK_HIGHER_GROUND'));

  const provOut = await provTool.run({ family_members_count: 2, duration_days: 7 }, mockCtx);
  assert.ok(provOut.includes('SURVIVAL PROVISIONS QUOTA'));

  const outageOut = await outageTool.run({ ev_battery_kwh: 75, operational_mode: 'ESSENTIAL' }, mockCtx);
  assert.ok(outageOut.includes('BLACKOUT SURVIVAL ENDURANCE ESTIMATE'));
});
