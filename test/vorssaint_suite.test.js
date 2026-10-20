'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getVorssaintManager } = require('../src/main/vorssaint/vorssaint_manager');
const { firebaseService } = require('../src/main/firebase');

const vorssaintManager = getVorssaintManager();

test('VorssaintManager: telemetry structure and system metrics', async () => {
  const tele = await vorssaintManager.getTelemetry();
  assert.ok(tele, 'Telemetry returned');
  assert.ok(typeof tele.cpu.loadPercent === 'number', 'CPU load is number');
  assert.ok(tele.cpu.cores > 0, 'CPU cores > 0');
  assert.ok(tele.ram.totalGB > 0, 'RAM total > 0');
  assert.ok(typeof tele.ram.usedPercent === 'number', 'RAM used percent is number');
  assert.ok(typeof tele.gpu.model === 'string', 'GPU model is string');
  assert.ok(typeof tele.disk.freeGB === 'number', 'Disk free is number');
  assert.ok(typeof tele.network.downloadKBps === 'number', 'Net download is number');
  assert.ok(typeof tele.battery.percent === 'number', 'Battery percent is number');
});

test('VorssaintManager: AI Agents and Copilot monitor status', async () => {
  const agents = await vorssaintManager.getAgentsStatus();
  assert.ok(agents, 'Agents returned');
  assert.ok(agents.local, 'Local model exists');
  assert.equal(agents.local.modelName, 'Qwen 3-VL 8B');
  assert.ok(agents.claude, 'Claude exists');
  assert.ok(agents.chatgpt, 'ChatGPT exists');
  assert.ok(agents.copilot, 'Copilot exists');
  assert.equal(agents.copilot.status, 'active');
});

test('VorssaintManager: clipboard history shelf and sensitive masking', async () => {
  vorssaintManager.addClipboardItem('git clone https://github.com/example/repo.git');
  vorssaintManager.addClipboardItem('sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz');

  const history = vorssaintManager.getClipboardHistory();
  assert.ok(history.length >= 2, 'History has items');

  const apiKeyItem = history.find(i => i.isSensitive);
  assert.ok(apiKeyItem, 'Detected sensitive API key in clipboard');
  assert.equal(apiKeyItem.isSensitive, true);

  const copied = vorssaintManager.copyClipboardItem(history[0].id);
  assert.ok(copied, 'Item found and copied');

  vorssaintManager.clearClipboardHistory();
  assert.equal(vorssaintManager.getClipboardHistory().length, 0, 'History cleared');
});

test('VorssaintManager: floating scratchpad persistence', async () => {
  const testNote = '## Test Vorssaint Note\n- Item 1\n- Item 2';
  vorssaintManager.saveScratchpad(testNote);
  const data = vorssaintManager.getScratchpad();
  assert.equal(data.text, testNote, 'Scratchpad note persisted and matched');
});

test('VorssaintManager: Keep Awake (Caffeinate) state transitions', async () => {
  const res15 = vorssaintManager.setKeepAwake('15m');
  assert.equal(res15.mode, '15m');
  assert.equal(res15.active, true);

  const resOff = vorssaintManager.setKeepAwake('off');
  assert.equal(resOff.mode, 'off');
  assert.equal(resOff.active, false);
});

test('VorssaintManager: settings management', async () => {
  const updated = vorssaintManager.updateSettings({
    notchMascot: true,
    showTelemetryHUD: true,
    autoStrollFrequency: 'medium'
  });
  assert.equal(updated.autoStrollFrequency, 'medium');

  const current = vorssaintManager.getSettings();
  assert.equal(current.autoStrollFrequency, 'medium');
  assert.equal(current.notchMascot, true);
});

test('Firebase: Google and Apple Sign-In Provider methods', async () => {
  const googleRes = await firebaseService.signInWithProvider({ provider: 'google.com' });
  assert.ok(googleRes.ok, 'Google sign in success');
  assert.ok(googleRes.user.email.includes('@gmail.com'), 'Google email formatted');

  const appleRes = await firebaseService.signInWithProvider({ provider: 'apple.com' });
  assert.ok(appleRes.ok, 'Apple sign in success');
  assert.ok(appleRes.user.email.includes('@privaterelay.appleid.com'), 'Apple private relay email formatted');
});
