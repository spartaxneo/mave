'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SelfHealer, getSelfHealer } = require('../src/main/diagnostics/self_healer');
const { ScreenReader } = require('../src/main/screenread');

test('SelfHealer: classifies faults accurately', () => {
  const healer = new SelfHealer();
  
  const varFault = healer.classifyFault('options is not defined', 'what is my name');
  assert.equal(varFault.type, 'VARIABLE_REFERENCE_FAULT');

  const refFault = healer.classifyFault('ReferenceError: user is not defined');
  assert.equal(refFault.type, 'VARIABLE_REFERENCE_FAULT');

  const screenFault = healer.classifyFault('Input helper timed out on command "uitree"');
  assert.equal(screenFault.type, 'SCREEN_INSPECTION_FAULT');

  const vramFault = healer.classifyFault('CUDA out of memory in local Ollama provider');
  assert.equal(vramFault.type, 'LOCAL_MODEL_EXHAUSTION_FAULT');

  const missingCmdFault = healer.classifyFault('The term "git" is not recognized as an internal or external command');
  assert.equal(missingCmdFault.type, 'MISSING_TOOL_OR_COMMAND_FAULT');
});

test('SelfHealer: auto-recovers variable reference errors and retries task', async () => {
  let directCallCount = 0;
  const mockController = {
    recordThought: () => {},
    runTaskDirect: async (task, source, options) => {
      directCallCount++;
      assert.equal(options.selfHealed, true);
      return { ok: true, text: `Successfully answered: ${task}` };
    }
  };

  const healer = new SelfHealer({ controller: mockController });
  const rawError = new ReferenceError('options is not defined');

  const result = await healer.healAndRetry({
    task: 'what is my name',
    source: 'typed',
    options: {},
    error: rawError,
    attempt: 1
  });

  assert.equal(result.healed, true);
  assert.equal(result.result.ok, true);
  assert.equal(directCallCount, 1);
  assert.match(result.explanation, /VARIABLE_REFERENCE_FAULT/);
});

test('ScreenReader: self-heals gracefully when uitree throws or times out', async () => {
  const mockInput = {
    send: async (cmd) => {
      if (cmd === 'uitree') throw new Error('Input helper timed out on command "uitree"');
      return 'ok';
    },
    windowTitle: async () => 'Test Active Window'
  };

  const reader = new ScreenReader({ input: mockInput });
  const mockTarget = {
    physOrigin: { x: 0, y: 0 },
    phys: { width: 1920, height: 1080 }
  };

  // Should NOT throw! Should return a self-healed snapshot.
  const snap = await reader.read(mockTarget);
  assert.ok(snap);
  assert.equal(snap.healed, true);
  assert.equal(snap.window, 'Test Active Window');
  assert.deepEqual(snap.items, []);
});

test('ScreenReader: handles null target without throwing', async () => {
  const reader = new ScreenReader({ input: {} });
  const snap = await reader.read(null);
  assert.ok(snap);
  assert.equal(snap.window, 'Desktop');
  assert.deepEqual(snap.items, []);
});

test('WindowManager: destroyAll cleans up all windows and tray without throwing', () => {
  let destroyed = [];
  const mockWin = (name) => ({
    isDestroyed: () => false,
    destroy: () => destroyed.push(name)
  });

  const { WindowManager } = require('../src/main/windows');
  const wm = new WindowManager({ settings: { get: () => false } });
  wm.tray = { destroy: () => destroyed.push('tray') };
  wm.main = mockWin('main');
  wm.islandWindow = mockWin('island');
  wm.petWindow = mockWin('pet');
  wm.engine = mockWin('engine');
  wm.overlays.set(1, mockWin('overlay1'));

  wm.destroyAll();

  assert.equal(wm.quitting, true);
  assert.ok(destroyed.includes('tray'));
  assert.ok(destroyed.includes('main'));
  assert.ok(destroyed.includes('island'));
  assert.ok(destroyed.includes('pet'));
  assert.ok(destroyed.includes('engine'));
  assert.ok(destroyed.includes('overlay1'));
  assert.equal(wm.overlays.size, 0);
});

test('Controller: runTask and runTaskDirect execute "what is my name" without throwing', async () => {
  const { Controller } = require('../src/main/controller');
  const mockSettings = { get: () => 'Mave', update: () => {} };
  const mockWindows = { send: () => {}, broadcast: () => {}, chatInView: () => true };
  const mockAudio = { on: () => {}, sound: () => {}, beginStream: () => {}, acknowledge: () => {}, finishStream: async () => 'none', stopSpeaking: () => {} };
  const mockLogger = { info: () => {}, error: () => {}, audit: () => {} };
  const mockCosts = { startTask: () => {} };
  const mockActivity = { add: () => {} };
  const mockAgent = { running: false, setTarget: () => {}, run: async () => ({ status: 'done', text: 'All good' }) };

  const ctrl = new Controller({
    settings: mockSettings,
    windows: mockWindows,
    audio: mockAudio,
    logger: mockLogger,
    costs: mockCosts,
    activity: mockActivity,
    agent: mockAgent,
    local: { snapshot: () => ({ status: 'ready' }), active: () => true },
    runtime: { status: () => ({ state: 'idle' }), running: true },
  });

  // 1. Calling runTask with "what is my name" and NO options must NOT throw "options is not defined"
  const res1 = await ctrl.runTask('what is my name', 'remote-web');
  assert.equal(res1.ok, true);
  assert.match(res1.text, /Hello! You are logged in as/);

  // 2. Calling runTaskDirect with "what is my name" must return clean identity
  const res2 = await ctrl.runTaskDirect('what is my name', 'remote-web');
  assert.equal(res2.ok, true);
  assert.match(res2.text, /Hello! You are logged in as/);

  // 3. Calling runTaskDirect with "inspect screen" must return spatial screen report
  const res3 = await ctrl.runTaskDirect('inspect screen', 'remote-web');
  assert.equal(res3.ok, true);
  assert.match(res3.text, /Screen & Active Window Inspection Report/);
});
