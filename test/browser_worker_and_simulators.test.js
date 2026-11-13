'use strict';

require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionGuard, sessionGuard, isSessionLocked, checkSessionState } = require('../src/main/automation/session_guard');
const { ComputerExecutor } = require('../src/main/computer');
const { BrowserWorker, BrowserWorkerPool } = require('../src/main/automation/browser_worker');

const automotivePlugins = require('../src/main/plugins/builtin/automotive_sentinel');
const tapkitPlugins = require('../src/main/plugins/builtin/tapkit_iphone');
const cuaPlugins = require('../src/main/plugins/builtin/cua_sandbox');
const iotPlugins = require('../src/main/plugins/builtin/iot_device_bridge');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Windows Session Guard & Lock Detection Tests
// ─────────────────────────────────────────────────────────────────────────────
test('SessionGuard reports initial desktop session status and state', () => {
  const guard = new SessionGuard();
  const state = guard.checkSessionState();

  assert.equal(typeof state.locked, 'boolean');
  assert.ok(['active', 'locked', 'disconnected'].includes(state.state));
  assert.equal(typeof state.timestamp, 'number');
  assert.equal(typeof guard.isSessionLocked(), 'boolean');
});

test('SessionGuard supports mock locked states and emits lock status events', () => {
  const guard = new SessionGuard();
  const events = [];

  guard.on('change', (ev) => events.push({ type: 'change', ...ev }));
  guard.on('lock', () => events.push({ type: 'lock' }));
  guard.on('unlock', () => events.push({ type: 'unlock' }));

  // Simulate locking session
  guard.setMockLocked(true);
  assert.equal(guard.isSessionLocked(), true);
  assert.equal(guard.checkSessionState().state, 'locked');

  // Verify event emissions
  assert.ok(events.some((e) => e.type === 'lock'));
  assert.ok(events.some((e) => e.type === 'change' && e.locked === true));

  // Simulate unlocking session
  events.length = 0;
  guard.setMockLocked(false);
  assert.equal(guard.isSessionLocked(), false);
  assert.equal(guard.checkSessionState().state, 'active');
  assert.ok(events.some((e) => e.type === 'unlock'));

  // Simulate disconnected session
  guard.setMockState('disconnected');
  assert.equal(guard.isSessionLocked(), false);
  assert.equal(guard.checkSessionState().state, 'disconnected');

  // Reset mock
  guard.resetMock();
  assert.equal(guard.mockLocked, null);
  assert.equal(guard.mockState, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Desktop Lock Interception in ComputerExecutor Tests
// ─────────────────────────────────────────────────────────────────────────────
test('ComputerExecutor blocks physical mouse/keyboard actions when session is locked', async () => {
  const guard = new SessionGuard();
  guard.setMockLocked(true);

  const mockInput = {
    move: async () => {},
    click: async () => {},
    type: async () => {},
    keys: async () => {},
    cursor: async () => ({ x: 100, y: 100 }),
  };
  const mockScreen = {
    isRemote: false,
    checkSent: () => {},
    sentToLocalDip: (c) => ({ x: c[0], y: c[1] }),
    sentToPhysical: (c) => ({ x: c[0], y: c[1] }),
    physicalToSent: (p) => p,
    screenshot: async () => 'mock-screenshot-png',
    zoom: async () => 'mock-zoom-png',
  };
  const mockPointAt = async () => {};

  const executor = new ComputerExecutor({
    input: mockInput,
    pointAt: mockPointAt,
    sessionGuard: guard,
  });

  // Read-only actions must remain completely functional
  const waitRes = await executor.run(mockScreen, 'wait', { duration: 0.01 });
  assert.equal(waitRes, 'OK');

  const curPos = await executor.run(mockScreen, 'cursor_position', {});
  assert.equal(curPos, 'X=100, Y=100');

  const shot = await executor.run(mockScreen, 'screenshot', {});
  assert.deepEqual(shot, ['mock-screenshot-png']);

  const zoom = await executor.run(mockScreen, 'zoom', { region: [0, 0, 100, 100] });
  assert.deepEqual(zoom, ['mock-zoom-png']);

  // Physical mouse and keyboard actions must throw with [DESKTOP_LOCKED]
  await assert.rejects(
    async () => {
      await executor.run(mockScreen, 'left_click', { coordinate: [100, 100] });
    },
    /\[DESKTOP_LOCKED\] Desktop session is locked\. Physical cursor actions paused\./
  );

  await assert.rejects(
    async () => {
      await executor.run(mockScreen, 'type', { text: 'sensitive input' });
    },
    /\[DESKTOP_LOCKED\] Desktop session is locked\. Physical cursor actions paused\./
  );

  await assert.rejects(
    async () => {
      await executor.run(mockScreen, 'key', { text: 'enter' });
    },
    /\[DESKTOP_LOCKED\] Desktop session is locked\. Physical cursor actions paused\./
  );

  await assert.rejects(
    async () => {
      await executor.run(mockScreen, 'mouse_move', { coordinate: [50, 50] });
    },
    /\[DESKTOP_LOCKED\] Desktop session is locked\. Physical cursor actions paused\./
  );

  // When unlocked, actions succeed normally
  guard.setMockLocked(false);
  const clickRes = await executor.run(mockScreen, 'left_click', { coordinate: [100, 100] });
  assert.equal(clickRes, 'OK');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Headless BrowserWorker & BrowserWorkerPool Lifecycle Tests
// ─────────────────────────────────────────────────────────────────────────────
test('BrowserWorker manages isolated headless partition and executes operations', async () => {
  const worker = new BrowserWorker('agent5_session', {
    mockContent: 'Welcome to Mave Headless Automation Hub',
  });

  assert.equal(worker.partition, 'persist:worker_agent5_session');
  await worker.init();

  // Test offscreen navigation
  const nav = await worker.goto('https://example.org/dashboard');
  assert.equal(nav.ok, true);
  assert.equal(nav.url, 'https://example.org/dashboard');
  assert.equal(worker.currentUrl, 'https://example.org/dashboard');

  // Test DOM querying / script execution
  const evalRes = await worker.evaluate(() => 21 * 2);
  assert.equal(evalRes, 42);

  // Test content scraping
  const text = await worker.getText('body');
  assert.ok(text.includes('Welcome to Mave Headless Automation Hub'));

  // Test offscreen screenshot capture without physical cursor movement
  const img = await worker.capturePage();
  assert.ok(img);
  assert.equal(typeof img.toPNG, 'function');
  assert.ok(Buffer.isBuffer(img.toPNG()));
  assert.equal(typeof img.toDataURL, 'function');
  assert.ok(img.toDataURL().startsWith('data:image/png'));

  // Test cleanup
  await worker.close();
  assert.equal(worker.destroyed, true);
  await assert.rejects(async () => {
    await worker.goto('https://example.org');
  }, /destroyed/);
});

test('BrowserWorker enforces timeout guards on hung operations', async () => {
  const worker = new BrowserWorker('hung_worker', { timeoutMs: 50 });
  await worker.init();

  await assert.rejects(
    async () => {
      await worker._withTimeout(new Promise((r) => setTimeout(r, 200)), 50, 'hung_probe');
    },
    /\[TIMEOUT\] Operation "hung_probe" timed out after 50ms/
  );

  await worker.close();
});

test('BrowserWorkerPool manages concurrency, checkout, and resource pooling', async () => {
  const pool = new BrowserWorkerPool({
    maxWorkers: 2,
    workerOptions: { mockContent: 'Pool worker content' },
  });

  assert.equal(pool.stats.total, 0);
  assert.equal(pool.stats.active, 0);

  // Acquire first worker
  const w1 = await pool.acquire();
  assert.ok(w1);
  assert.equal(w1.busy, true);
  assert.equal(pool.stats.total, 1);
  assert.equal(pool.stats.active, 1);

  // Acquire second worker
  const w2 = await pool.acquire();
  assert.ok(w2);
  assert.equal(pool.stats.total, 2);
  assert.equal(pool.stats.active, 2);

  // Release first worker
  pool.release(w1);
  assert.equal(w1.busy, false);
  assert.equal(pool.stats.idle, 1);
  assert.equal(pool.stats.active, 1);

  // Execute task with withWorker helper
  const taskRes = await pool.withWorker(async (worker) => {
    assert.equal(worker.busy, true);
    return await worker.getText('body');
  });
  assert.ok(taskRes.includes('Pool worker content'));

  // Clean up pool
  await pool.closeAll();
  assert.equal(pool.destroyed, true);
  assert.equal(pool.stats.total, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sentinel Simulation Transparency Badges Tests
// ─────────────────────────────────────────────────────────────────────────────
test('AutomotiveSentinel tools feature simulation badges in descriptions and output', async () => {
  const mockCtx = { log: () => {} };

  for (const tool of automotivePlugins) {
    assert.ok(
      tool.description.includes('[SIMULATED PROTOCOL / DEMO]'),
      `Tool ${tool.name} must have badge in description`
    );
  }

  const telemTool = automotivePlugins.find((p) => p.name === 'automotive_view_telematics');
  const ctrlTool = automotivePlugins.find((p) => p.name === 'automotive_control_vehicle');
  const dtcTool = automotivePlugins.find((p) => p.name === 'automotive_diagnose_obd_dtc');
  const parkTool = automotivePlugins.find((p) => p.name === 'automotive_parking_memory');

  const telemOut = await telemTool.run({}, mockCtx);
  assert.ok(telemOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const ctrlOut = await ctrlTool.run({ action: 'lock' }, mockCtx);
  assert.ok(ctrlOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const dtcOut = await dtcTool.run({ dtc_code: 'P0300' }, mockCtx);
  assert.ok(dtcOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const parkOut = await parkTool.run({ action: 'recall' }, mockCtx);
  assert.ok(parkOut.includes('[SIMULATED PROTOCOL / DEMO]'));
});

test('TapKit iPhone tools feature simulation badges in descriptions and output', async () => {
  const mockCtx = { log: () => {} };

  for (const tool of tapkitPlugins) {
    assert.ok(
      tool.description.includes('[SIMULATED PROTOCOL / DEMO]'),
      `Tool ${tool.name} must have badge in description`
    );
  }

  const listTool = tapkitPlugins.find((p) => p.name === 'tapkit_list_phones');
  const shotTool = tapkitPlugins.find((p) => p.name === 'tapkit_phone_screenshot');
  const actTool = tapkitPlugins.find((p) => p.name === 'tapkit_phone_action');

  const listOut = await listTool.run({}, mockCtx);
  assert.ok(listOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const shotOut = await shotTool.run({}, mockCtx);
  assert.ok(shotOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const actOut = await actTool.run({ action: 'vision_tap', vision_target: 'Home button' }, mockCtx);
  assert.ok(actOut.includes('[SIMULATED PROTOCOL / DEMO]'));
});

test('Cua Sandbox tools feature simulation or prototype badges in descriptions and output', async () => {
  const mockCtx = { log: () => {} };

  for (const tool of cuaPlugins) {
    const hasBadge = tool.description.includes('[SIMULATED PROTOCOL / DEMO]') || tool.description.includes('[PROTOTYPE]');
    assert.ok(hasBadge, `Tool ${tool.name} must feature badge in description`);
  }

  const bgTool = cuaPlugins.find((p) => p.name === 'cua_background_action');
  const spaceTool = cuaPlugins.find((p) => p.name === 'cua_spaces_manage');
  const statTool = cuaPlugins.find((p) => p.name === 'cua_driver_status');

  const bgOut = await bgTool.run({ window_title: 'Terminal', action: 'click' }, mockCtx);
  assert.ok(bgOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const spaceOut = await spaceTool.run({ action: 'create_space', space_name: 'test-sandbox' }, mockCtx);
  assert.ok(spaceOut.includes('[PROTOTYPE]'));
  await spaceTool.run({ action: 'destroy_space', space_name: 'test-sandbox' }, mockCtx);

  const statOut = await statTool.run({}, mockCtx);
  assert.ok(statOut.includes('[SIMULATED PROTOCOL / DEMO]'));
});

test('IoT Device Bridge tools feature simulation badges in descriptions and output', async () => {
  const mockCtx = { log: () => {} };

  for (const tool of iotPlugins) {
    assert.ok(
      tool.description.includes('[SIMULATED PROTOCOL / DEMO]'),
      `Tool ${tool.name} must feature badge in description`
    );
  }

  const ctrlTool = iotPlugins.find((p) => p.name === 'iot_control_device');
  const listTool = iotPlugins.find((p) => p.name === 'iot_list_devices');
  const regTool = iotPlugins.find((p) => p.name === 'iot_register_device');
  const ecoTool = iotPlugins.find((p) => p.name === 'iot_query_ecosystem_status');

  const ctrlOut = await ctrlTool.run({ device_name_or_id: 'Living Room Ceiling Lights', action: 'toggle' }, mockCtx);
  assert.ok(ctrlOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const listOut = await listTool.run({}, mockCtx);
  assert.ok(listOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const regOut = await regTool.run({
    name: 'Smart Kettle',
    room: 'Kitchen',
    type: 'switch',
    protocol: 'tuya',
  }, mockCtx);
  assert.ok(regOut.includes('[SIMULATED PROTOCOL / DEMO]'));

  const ecoOut = await ecoTool.run({}, mockCtx);
  assert.ok(ecoOut.includes('[SIMULATED PROTOCOL / DEMO]'));
});
