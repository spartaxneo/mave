'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AutomotiveSentinel,
  getAutomotiveSentinel,
  DTC_DATABASE,
} = require('../src/main/automotive/automotive_sentinel');

const automotivePlugins = require('../src/main/plugins/builtin/automotive_sentinel');

test('AutomotiveSentinel loads default vehicle and reports telematics', () => {
  const tmpFile = path.join(os.tmpdir(), `test_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const auto = new AutomotiveSentinel(tmpFile);

  const v = auto.getVehicle();
  assert.ok(v);
  assert.equal(v.make, 'Tesla');
  assert.equal(v.model, 'Model 3 Long Range');
  assert.ok(v.batteryOrFuelPct > 50);
  assert.ok(v.estimatedRangeMiles > 100);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('AutomotiveSentinel controls lock and climate preconditioning', () => {
  const tmpFile = path.join(os.tmpdir(), `test_auto_ctrl_${Date.now()}.json`);
  const auto = new AutomotiveSentinel(tmpFile);

  // Unlock vehicle
  const unlockRes = auto.controlVehicle(null, 'unlock');
  assert.equal(unlockRes.ok, true);
  assert.equal(unlockRes.state.locked, false);

  // Start climate
  const climateRes = auto.controlVehicle(null, 'start_climate', { target_temp_c: 22.5 });
  assert.equal(climateRes.ok, true);
  assert.equal(climateRes.state.climateActive, true);
  assert.equal(climateRes.state.targetTempC, 22.5);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('AutomotiveSentinel translates OBD-II DTC codes accurately', () => {
  const auto = getAutomotiveSentinel();

  const res1 = auto.readDiagnosticCode('P0300');
  assert.equal(res1.found, true);
  assert.match(res1.name, /Misfire/i);
  assert.equal(res1.severity, 'High');

  const res2 = auto.readDiagnosticCode('P0455');
  assert.equal(res2.found, true);
  assert.match(res2.advice, /gas cap/i);

  const unknown = auto.readDiagnosticCode('U0100');
  assert.equal(unknown.found, false);
});

test('AutomotiveSentinel saves and recalls parking spot memory', () => {
  const tmpFile = path.join(os.tmpdir(), `test_auto_park_${Date.now()}.json`);
  const auto = new AutomotiveSentinel(tmpFile);

  auto.setParkingLocation({
    locationNote: 'Level 4, Yellow Zone, Space 88 near South Exit',
  });

  const spot = auto.getParkingLocation();
  assert.equal(spot.locationNote, 'Level 4, Yellow Zone, Space 88 near South Exit');

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Automotive builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(automotivePlugins));
  assert.equal(automotivePlugins.length, 4);

  const telemTool = automotivePlugins.find((p) => p.name === 'automotive_view_telematics');
  const ctrlTool = automotivePlugins.find((p) => p.name === 'automotive_control_vehicle');
  const dtcTool = automotivePlugins.find((p) => p.name === 'automotive_diagnose_obd_dtc');
  const parkTool = automotivePlugins.find((p) => p.name === 'automotive_parking_memory');

  assert.ok(telemTool);
  assert.ok(ctrlTool);
  assert.ok(dtcTool);
  assert.ok(parkTool);

  const mockCtx = { log: () => {} };

  const telemRes = await telemTool.run({}, mockCtx);
  assert.match(telemRes, /VEHICLE TELEMATICS REPORT/i);

  const ctrlRes = await ctrlTool.run({ action: 'lock' }, mockCtx);
  assert.match(ctrlRes, /VEHICLE COMMAND DISPATCHED/i);

  const dtcRes = await dtcTool.run({ dtc_code: 'P0420' }, mockCtx);
  assert.match(dtcRes, /Catalyst System Efficiency/i);

  const parkRes = await parkTool.run({ action: 'recall' }, mockCtx);
  assert.match(parkRes, /SAVED PARKING LOCATION/i);
});
