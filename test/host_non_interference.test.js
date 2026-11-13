'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  VirtualComputerSession,
  ExecutionTargetRouter,
  ENVIRONMENTS,
} = require('../src/main/virtual_computer');
const { ComputerExecutor } = require('../src/main/computer');
const { MissionController } = require('../src/main/autonomous/mission_controller');
const { SkillForge } = require('../src/main/evolution/skill_forge');

test('Non-Interference Suite: Host cursor and window state remain 100% undisturbed during guest execution', async (t) => {
  // Create an instrumentation spy on the physical InputHelper
  let physicalMoveCalls = 0;
  let physicalClickCalls = 0;
  let physicalTypeCalls = 0;
  let physicalCursorX = 500;
  let physicalCursorY = 500;

  const mockPhysicalInput = {
    move: async (x, y) => {
      physicalMoveCalls++;
      physicalCursorX = x;
      physicalCursorY = y;
    },
    click: async (button, count) => {
      physicalClickCalls++;
    },
    type: async (text) => {
      physicalTypeCalls++;
    },
    cursor: async () => ({ x: physicalCursorX, y: physicalCursorY }),
    windowTitle: async () => 'User Host Browser - Playing Video',
  };

  const session = new VirtualComputerSession({
    guestRoot: path.join(os.tmpdir(), 'mave_non_interference_test_fs'),
  });
  await session.init();

  const computer = new ComputerExecutor({
    input: mockPhysicalInput,
    pointAt: async () => {},
  });

  const virtualTarget = session.getScreenTarget();

  await t.test('1. Guest actions dispatch cleanly through VirtualScreenTarget with 0 physical host calls', async () => {
    // Record baseline physical cursor position
    const startCursor = await mockPhysicalInput.cursor();
    assert.equal(startCursor.x, 500);
    assert.equal(startCursor.y, 500);

    // Run guest screenshot
    const shot = await computer.run(virtualTarget, 'screenshot', {});
    assert(Array.isArray(shot) && Buffer.isBuffer(shot[0]), 'Screenshot must return a PNG buffer');

    // Run guest open_url
    const navResult = await computer.run(virtualTarget, 'open_url', { url: 'https://docs.python.org' });
    assert(navResult.url.includes('docs.python.org'));

    // Run guest click at (350, 420)
    await computer.run(virtualTarget, 'click', { coordinate: [350, 420] });
    assert.equal(session.displayServer.cursor.x, 350, 'Virtual cursor should move to (350, 420)');
    assert.equal(session.displayServer.cursor.y, 420);

    // Run guest typing
    await computer.run(virtualTarget, 'type', { text: 'import asyncio' });

    // Run guest scrolling
    await computer.run(virtualTarget, 'scroll', { scroll_direction: 'down', scroll_amount: 5 });

    // Verify physical host cursor remained completely untouched
    const endCursor = await mockPhysicalInput.cursor();
    assert.equal(endCursor.x, 500, 'Physical host cursor X MUST not move');
    assert.equal(endCursor.y, 500, 'Physical host cursor Y MUST not move');
    assert.equal(physicalMoveCalls, 0, 'Physical InputHelper.move() must be called 0 times');
    assert.equal(physicalClickCalls, 0, 'Physical InputHelper.click() must be called 0 times');
    assert.equal(physicalTypeCalls, 0, 'Physical InputHelper.type() must be called 0 times');
  });

  await t.test('2. ExecutionTargetRouter rejects silent host fallback and mandates authorization', async () => {
    const router = new ExecutionTargetRouter();

    // Standard tasks route to guest environments
    const webTask = router.resolveTarget('search the web for modern CSS patterns');
    assert.equal(webTask.environment, ENVIRONMENTS.VIRTUAL_BROWSER);
    assert.equal(webTask.isGuest, true);
    assert.equal(webTask.requiresConfirmation, false);

    const codingTask = router.resolveTarget('write a python script to parse csv data');
    assert.equal(codingTask.environment, ENVIRONMENTS.VIRTUAL_COMPUTER);
    assert.equal(codingTask.isGuest, true);
    assert.equal(codingTask.requiresConfirmation, false);

    // Physical host desktop tasks require explicit confirmation
    const hostTask = router.resolveTarget('control my actual mouse on my physical computer screen');
    assert.equal(hostTask.environment, ENVIRONMENTS.HOST_COMPUTER);
    assert.equal(hostTask.isGuest, false);
    assert.equal(hostTask.requiresConfirmation, true);

    // Assert no silent fallback
    assert.throws(() => {
      router.assertNoSilentHostFallback(ENVIRONMENTS.VIRTUAL_BROWSER, new Error('Guest browser crashed'));
    }, /Silent fallback to host computer is strictly prohibited/);
  });

  await t.test('3. MissionController executes multi-worker workflows inside guest environment', async () => {
    const missionCtrl = new MissionController({ session });

    const result = await missionCtrl.startMission('Verify Python environment in guest', [
      {
        id: 'node_check',
        title: 'Check runtime version in isolated sandbox',
        params: { command: 'node -v' },
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(missionCtrl.status, 'completed');
    assert.equal(result.stats.completed, 1);
  });

  await t.test('4. SkillForge authors, tests, and registers skills in guest sandbox', async () => {
    const forge = new SkillForge({ session });

    const forgeResult = await forge.forgeSkill({
      name: 'math_multiplier',
      description: 'Multiplies two numbers',
      code: 'module.exports = { multiply: (a, b) => a * b };',
      testCode: `
        const assert = require('assert');
        const { multiply } = require('./math_multiplier.js');
        assert.strictEqual(multiply(6, 7), 42);
        console.log('Multiplier verified');
      `,
    });

    assert.equal(forgeResult.ok, true);
    assert.equal(forgeResult.skill.name, 'math_multiplier');
    assert.equal(forgeResult.skill.status, 'verified');

    const retrieved = forge.getSkill('math_multiplier');
    assert.equal(retrieved.name, 'math_multiplier');
  });

  await session.close();
});
