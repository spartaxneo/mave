'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  WearablesHealthHub,
  getWearablesHealthHub,
} = require('../src/main/wearables/wearables_health_hub');

const wearablesPlugins = require('../src/main/plugins/builtin/wearables_health');

test('WearablesHealthHub initializes defaults and filters by category', () => {
  const tmpFile = path.join(os.tmpdir(), `test_wearables_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const hub = new WearablesHealthHub(tmpFile);

  const all = hub.getDevices();
  assert.ok(all.length >= 6);

  // Check smartwatches
  const watches = hub.getDevices('smartwatch');
  assert.ok(watches.length >= 2);
  assert.ok(watches.some((w) => w.id === 'watch_apple_ultra'));
  assert.ok(watches.some((w) => w.id === 'watch_galaxy_6'));

  // Check help devices
  const helpDevices = hub.getDevices('help_device');
  assert.ok(helpDevices.length >= 2);
  assert.ok(helpDevices.some((h) => h.id === 'help_sos_pendant'));
  assert.ok(helpDevices.some((h) => h.id === 'pill_dispenser_smart'));

  // Check medical sensors
  const sensors = hub.getDevices('medical_sensor');
  assert.ok(sensors.length >= 2);
  assert.ok(sensors.some((s) => s.id === 'cgm_dexcom_g7'));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('WearablesHealthHub logs vitals, detects anomalies, and handles emergency SOS', () => {
  const tmpFile = path.join(os.tmpdir(), `test_wearables_vitals_${Date.now()}.json`);
  const hub = new WearablesHealthHub(tmpFile);

  // Log vitals with normal heart rate
  hub.logVitals('Apple Watch Ultra 2', { heartRateBpm: 75, hrvMs: 60 });
  const dev = hub.getDevice('Apple Watch Ultra 2');
  assert.equal(dev.vitals.heartRateBpm, 75);
  assert.equal(dev.vitals.hrvMs, 60);

  // Log vitals with spike (>140 BPM) -> triggers alert
  hub.logVitals('Apple Watch Ultra 2', { heartRateBpm: 155 });
  const activeAlerts = hub.getAlerts(true);
  assert.ok(activeAlerts.length >= 1);
  assert.equal(activeAlerts[0].type, 'high_heart_rate');

  // Trigger manual SOS
  const sos = hub.triggerEmergencyAlert({
    type: 'fall_detected',
    location: 'Staircase',
    message: 'Sudden accelerometer deceleration detected.',
  });
  assert.equal(sos.type, 'fall_detected');
  assert.equal(sos.location, 'Staircase');

  // Acknowledge alert
  const ack = hub.acknowledgeAlert(sos.id);
  assert.equal(ack, true);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('WearablesHealthHub matchIntent detects conversational health and watch requests', () => {
  const tmpFile = path.join(os.tmpdir(), `test_wearables_intent_${Date.now()}.json`);
  const hub = new WearablesHealthHub(tmpFile);

  const m1 = hub.matchIntent('can it connect with help devices, watched etc');
  assert.equal(m1.handled, true);
  assert.equal(m1.type, 'inquiry');

  const m2 = hub.matchIntent('what is my heart rate?');
  assert.equal(m2.handled, true);
  assert.equal(m2.type, 'vitals_query');

  const m3 = hub.matchIntent('did I take my medicine?');
  assert.equal(m3.handled, true);
  assert.equal(m3.type, 'medication_query');

  const m4 = hub.matchIntent('emergency sos');
  assert.equal(m4.handled, true);
  assert.equal(m4.type, 'emergency_trigger');

  const m5 = hub.matchIntent('open powershell terminal');
  assert.equal(m5.handled, false);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Wearables & Help Devices builtin plugin tools have valid schemas and run properly', async () => {
  assert.ok(Array.isArray(wearablesPlugins));
  assert.equal(wearablesPlugins.length, 4);

  const vitalsTool = wearablesPlugins.find((p) => p.name === 'wearables_query_vitals');
  const syncTool = wearablesPlugins.find((p) => p.name === 'wearables_sync_data');
  const sosTool = wearablesPlugins.find((p) => p.name === 'wearables_trigger_sos');
  const listTool = wearablesPlugins.find((p) => p.name === 'wearables_list_devices');

  assert.ok(vitalsTool);
  assert.ok(syncTool);
  assert.ok(sosTool);
  assert.ok(listTool);

  const mockCtx = {
    log: () => {},
  };

  // Test vitals query
  const vitalsRes = await vitalsTool.run({ device_name: 'Apple Watch Ultra 2' }, mockCtx);
  assert.match(vitalsRes, /APPLE WATCH ULTRA 2 VITALS REPORT/i);
  assert.match(vitalsRes, /Heart Rate/i);

  // Test overview when no device specified
  const overviewRes = await vitalsTool.run({}, mockCtx);
  assert.match(overviewRes, /Smartwatches & Fitness Rings/i);
  assert.match(overviewRes, /Help, Assistive & Medical Alert Devices/i);

  // Test sync tool
  const syncRes = await syncTool.run({
    device_id_or_name: 'Apple Watch Ultra 2',
    vitals: { heartRateBpm: 76, stepsToday: 9100 },
  }, mockCtx);
  assert.match(syncRes, /TELEMETRY SYNCED/i);

  // Test emergency SOS tool
  const sosRes = await sosTool.run({
    type: 'fall_detected',
    location: 'Bathroom',
    message: 'Pendant impact sensor triggered.',
  }, mockCtx);
  assert.match(sosRes, /EMERGENCY DISTRESS DISPATCHED/i);

  // Test list tool
  const listRes = await listTool.run({ category: 'all' }, mockCtx);
  assert.match(listRes, /CONNECTED WEARABLES & HELP DEVICES/i);
});
