'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const { ModelAutoUpdater } = require('../src/main/local/auto_updater');
const modelAutoUpdaterPlugin = require('../src/main/plugins/builtin/model_auto_updater');
const { validate } = require('../src/main/plugins/registry');
const catalog = require('../src/main/local/catalog');

function createMockSettings(initial = {}) {
  const store = {
    autoUpdateModels: true,
    autoUpdateIntervalHours: 6,
    localModel: 'qwen3-vl-4b',
    ...initial
  };
  return {
    get(k) { return store[k]; },
    update(patch) { Object.assign(store, patch); return store; },
    _store: store
  };
}

function createMockManager(installedId = 'qwen3-vl-4b') {
  const manager = new EventEmitter();
  manager.startedModel = null;
  manager.startCalls = 0;
  manager.installedId = () => installedId;
  manager.start = (modelId) => {
    manager.startedModel = modelId;
    manager.startCalls++;
    manager.emit('downloading', { modelId, progress: 0 });
  };
  return manager;
}

test('ModelAutoUpdater respects settings defaults and enabled state', () => {
  const settings = createMockSettings({ autoUpdateModels: true, autoUpdateIntervalHours: 12 });
  const updater = new ModelAutoUpdater({ settings });

  assert.equal(updater.isEnabled(), true);
  assert.equal(updater.getIntervalHours(), 12);

  settings.update({ autoUpdateModels: false });
  assert.equal(updater.isEnabled(), false);
});

test('ModelAutoUpdater detects hardware tier upgrade (4B -> 8B on 8GB+ GPU) and auto-installs', async () => {
  const settings = createMockSettings({ localModel: 'qwen3-vl-4b', autoUpdateModels: true });
  const manager = createMockManager('qwen3-vl-4b');
  const mockHardware = {
    detect: async () => ({ dedicated: true, vramGB: 12, label: 'NVIDIA RTX 4070' })
  };

  const updater = new ModelAutoUpdater({
    manager,
    settings,
    hardwareImpl: mockHardware
  });

  let updateEmitted = null;
  let autoInstallEmitted = null;
  updater.on('update-available', (info) => { updateEmitted = info; });
  updater.on('auto-install-started', (info) => { autoInstallEmitted = info; });

  const res = await updater.checkForUpdates({ autoInstall: true });

  assert.equal(res.updateAvailable, true);
  assert.equal(res.targetModel, 'qwen3-vl-8b');
  assert.equal(res.type, 'tier_upgrade');
  assert.equal(res.autoInstalling, true);

  assert.ok(updateEmitted);
  assert.equal(updateEmitted.targetModel, 'qwen3-vl-8b');
  assert.ok(autoInstallEmitted);
  assert.equal(autoInstallEmitted.modelId, 'qwen3-vl-8b');

  assert.equal(manager.startCalls, 1);
  assert.equal(manager.startedModel, 'qwen3-vl-8b');
});

test('ModelAutoUpdater detects 30B tier upgrade on 24GB+ dedicated GPU', async () => {
  const settings = createMockSettings({ localModel: 'qwen3-vl-8b', autoUpdateModels: true });
  const manager = createMockManager('qwen3-vl-8b');
  const mockHardware = {
    detect: async () => ({ dedicated: true, vramGB: 24, label: 'NVIDIA RTX 4090' })
  };

  const updater = new ModelAutoUpdater({
    manager,
    settings,
    hardwareImpl: mockHardware
  });

  const res = await updater.checkForUpdates({ autoInstall: false });

  assert.equal(res.updateAvailable, true);
  assert.equal(res.targetModel, 'qwen3-vl-30b');
  assert.equal(res.type, 'tier_upgrade');
  assert.equal(manager.startCalls, 0); // autoInstall was false
});

test('ModelAutoUpdater detects remote Hugging Face revision update and auto-installs', async () => {
  const settings = createMockSettings({ localModel: 'qwen3-vl-8b', autoUpdateModels: true });
  const manager = createMockManager('qwen3-vl-8b');
  const mockHardware = {
    detect: async () => ({ dedicated: true, vramGB: 8, label: 'RTX 3070' })
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ sha: '111122223333444455556666777788889999aaaa' })
  });

  const updater = new ModelAutoUpdater({
    manager,
    settings,
    hardwareImpl: mockHardware,
    fetchImpl: mockFetch
  });

  const res = await updater.checkForUpdates({ autoInstall: true });

  assert.equal(res.updateAvailable, true);
  assert.equal(res.type, 'revision_update');
  assert.equal(res.targetModel, 'qwen3-vl-8b');
  assert.equal(res.autoInstalling, true);
  assert.equal(manager.startCalls, 1);
  assert.equal(manager.startedModel, 'qwen3-vl-8b');
});

test('ModelAutoUpdater reports up to date when weights and tier are optimal', async () => {
  const settings = createMockSettings({ localModel: 'qwen3-vl-8b', autoUpdateModels: true });
  const manager = createMockManager('qwen3-vl-8b');
  const mockHardware = {
    detect: async () => ({ dedicated: true, vramGB: 8, label: 'RTX 3070' })
  };

  const model8b = catalog.modelById('qwen3-vl-8b');
  const currentRev = model8b.files[0].url.split('/resolve/')[1].split('/')[0];

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ sha: currentRev })
  });

  const updater = new ModelAutoUpdater({
    manager,
    settings,
    hardwareImpl: mockHardware,
    fetchImpl: mockFetch
  });

  let upToDateEmitted = false;
  updater.on('up-to-date', () => { upToDateEmitted = true; });

  const res = await updater.checkForUpdates();

  assert.equal(res.updateAvailable, false);
  assert.equal(upToDateEmitted, true);
  assert.equal(manager.startCalls, 0);
});

test('ModelAutoUpdater manages periodic timer lifecycle', () => {
  const updater = new ModelAutoUpdater({});
  assert.equal(updater.timer, null);

  updater.startAutoCheckTimer(1);
  assert.ok(updater.timer !== null);

  updater.stopAutoCheckTimer();
  assert.equal(updater.timer, null);
});

test('model_auto_updater builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(modelAutoUpdaterPlugin));
  assert.equal(modelAutoUpdaterPlugin.length, 2);

  for (const tool of modelAutoUpdaterPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Plugin tool ${tool.name} must be valid: ${error}`);
  }

  const names = modelAutoUpdaterPlugin.map((t) => t.name);
  assert.ok(names.includes('check_model_updates'));
  assert.ok(names.includes('configure_model_auto_update'));
});

test('model_auto_updater plugin tools execute properly', async () => {
  const settings = createMockSettings({ localModel: 'qwen3-vl-8b' });
  const manager = createMockManager('qwen3-vl-8b');
  const logs = [];
  const ctx = {
    settings,
    log: (level, msg) => logs.push({ level, msg })
  };

  const checkTool = modelAutoUpdaterPlugin.find((t) => t.name === 'check_model_updates');
  const configTool = modelAutoUpdaterPlugin.find((t) => t.name === 'configure_model_auto_update');

  // Test configure
  const configRes = await configTool.run({ enabled: true, interval_hours: 12 }, ctx);
  assert.ok(configRes.includes('MODEL AUTO-UPDATE CONFIGURATION SAVED'));
  assert.ok(configRes.includes('12 hours'));
  assert.equal(settings.get('autoUpdateIntervalHours'), 12);

  // Test check updates tool
  const checkRes = await checkTool.run({ auto_install: false }, ctx);
  assert.ok(typeof checkRes === 'string');
  assert.ok(checkRes.includes('MODEL'));
});
