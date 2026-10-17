'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AcousticSceneAnalyzer,
  getAcousticSceneAnalyzer,
  ACOUSTIC_SIGNATURES,
} = require('../src/main/acoustic/acoustic_scene_analyzer');

const acousticPlugins = require('../src/main/plugins/builtin/acoustic_scene');

test('AcousticSceneAnalyzer classifies events and escalates safety alerts', () => {
  const tmpFile = path.join(os.tmpdir(), `test_acoustic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const analyzer = new AcousticSceneAnalyzer(tmpFile);

  // Initial state nominal
  const initialStatus = analyzer.getActiveSafetyStatus();
  assert.equal(initialStatus.status, 'nominal_secure');
  assert.equal(initialStatus.activeAlerts, 0);

  // Classify a doorbell ring
  const db = analyzer.classifyAcousticEvent({
    eventType: 'doorbell_ring',
    room: 'Front Porch',
  });
  assert.equal(db.eventType, 'doorbell_ring');
  assert.equal(db.severity, 'informational');

  // Classify a smoke alarm (critical emergency)
  const smoke = analyzer.classifyAcousticEvent({
    eventType: 'smoke_alarm',
    room: 'Kitchen',
  });
  assert.equal(smoke.severity, 'critical_emergency');

  // Status should now be danger_alert
  const activeStatus = analyzer.getActiveSafetyStatus();
  assert.equal(activeStatus.status, 'danger_alert');
  assert.equal(activeStatus.activeAlerts, 1);
  assert.match(activeStatus.message, /smoke/i);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('AcousticSceneAnalyzer maintains recent events history', () => {
  const tmpFile = path.join(os.tmpdir(), `test_acoustic_hist_${Date.now()}.json`);
  const analyzer = new AcousticSceneAnalyzer(tmpFile);

  analyzer.classifyAcousticEvent({ eventType: 'baby_crying', room: 'Nursery' });
  analyzer.classifyAcousticEvent({ eventType: 'water_leak', room: 'Basement' });

  const events = analyzer.getRecentEvents(5);
  assert.ok(events.length >= 2);
  assert.equal(events[0].eventType, 'water_leak');

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Acoustic Scene builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(acousticPlugins));
  assert.equal(acousticPlugins.length, 3);

  const classifyTool = acousticPlugins.find((p) => p.name === 'acoustic_classify_sound_event');
  const statusTool = acousticPlugins.find((p) => p.name === 'acoustic_get_safety_status');
  const listTool = acousticPlugins.find((p) => p.name === 'acoustic_list_recent_events');

  assert.ok(classifyTool);
  assert.ok(statusTool);
  assert.ok(listTool);

  const mockCtx = { log: () => {} };

  const classifyRes = await classifyTool.run({ eventType: 'glass_break', room: 'Living Room' }, mockCtx);
  assert.match(classifyRes, /ACOUSTIC EVENT RECORDED/i);

  const statusRes = await statusTool.run({}, mockCtx);
  assert.match(statusRes, /HOUSEHOLD ACOUSTIC SAFETY AUDIT/i);

  const listRes = await listTool.run({}, mockCtx);
  assert.match(listRes, /RECENT ACOUSTIC EVENTS/i);
});
