'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  EnergyOptimizer,
  getEnergyOptimizer,
} = require('../src/main/energy/energy_optimizer');

const energyPlugins = require('../src/main/plugins/builtin/energy_optimizer');

test('EnergyOptimizer retrieves live solar, battery and grid metrics', () => {
  const tmpFile = path.join(os.tmpdir(), `test_energy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const opt = new EnergyOptimizer(tmpFile);

  const m = opt.getEnergyMetrics();
  assert.ok(m.solarProductionKw > 0);
  assert.ok(m.homeConsumptionKw > 0);
  assert.equal(m.batteryStorage.socPct, 92);
  assert.ok(m.touTier);
  assert.ok(m.currentRateUsd > 0);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('EnergyOptimizer generates smart load shift recommendations during solar surplus', () => {
  const opt = getEnergyOptimizer();
  const recs = opt.getApplianceRecommendations();
  assert.ok(Array.isArray(recs));
  assert.ok(recs.length >= 1);
  assert.ok(recs.some((r) => r.appliance.includes('Vehicle') || r.appliance.includes('Dishwasher')));
});

test('Energy Optimizer builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(energyPlugins));
  assert.equal(energyPlugins.length, 2);

  const solarTool = energyPlugins.find((p) => p.name === 'energy_view_solar_grid');
  const recTool = energyPlugins.find((p) => p.name === 'energy_get_appliance_load_recommendations');

  assert.ok(solarTool);
  assert.ok(recTool);

  const mockCtx = { log: () => {} };

  const solarRes = await solarTool.run({}, mockCtx);
  assert.match(solarRes, /SOLAR & HOUSEHOLD ENERGY DASHBOARD/i);

  const recRes = await recTool.run({}, mockCtx);
  assert.match(recRes, /SMART APPLIANCE LOAD SHIFTING/i);
});
