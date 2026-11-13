'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  VirtualMachineManager,
  VirtualDisplayServer,
  VirtualBrowserController,
  VirtualDesktopController,
  ExecutionTargetRouter,
  VirtualComputerSession,
  ENVIRONMENTS,
} = require('../src/main/virtual_computer');

const testDir = path.join(os.tmpdir(), `mave_vc_test_${Date.now()}`);

test('VirtualMachineManager: lifecycle states, detection, and snapshots', async (t) => {
  const vmm = new VirtualMachineManager({ userDataPath: testDir });

  const caps = await vmm.detectHostCapabilities();
  assert.ok(caps.nativeIsolatedAvailable, 'Native isolated engine is available');
  assert.ok(caps.preferredBackend, 'Preferred backend determined');

  const startRes = await vmm.start('test-guest-1');
  assert.equal(startRes.ok, true);
  assert.equal(vmm.state, 'running');

  const pauseRes = await vmm.pause();
  assert.equal(pauseRes.ok, true);
  assert.equal(vmm.state, 'paused');

  const resumeRes = await vmm.resume();
  assert.equal(resumeRes.ok, true);
  assert.equal(vmm.state, 'running');

  const snapRes = await vmm.snapshot('baseline_check');
  assert.equal(snapRes.ok, true);
  assert.ok(snapRes.snapId, 'Snapshot ID generated');

  const restoreRes = await vmm.restore(snapRes.snapId);
  assert.equal(restoreRes.ok, true);

  const stopRes = await vmm.stop();
  assert.equal(stopRes.ok, true);
  assert.equal(vmm.state, 'stopped');
});

test('VirtualDisplayServer: independent framebuffer, virtual cursor, and input dispatch', async (t) => {
  const display = new VirtualDisplayServer({ width: 1280, height: 800, fps: 30 });

  assert.equal(display.width, 1280);
  assert.equal(display.height, 800);
  assert.equal(display.cursor.x, 640);
  assert.equal(display.cursor.y, 400);

  // Move virtual cursor
  const moved = await display.moveCursor(300, 250);
  assert.equal(moved.x, 300);
  assert.equal(moved.y, 250);
  assert.equal(display.cursor.x, 300);
  assert.equal(display.cursor.y, 250);

  // Virtual click
  const clickRes = await display.click(300, 250, 'left');
  assert.equal(clickRes.ok, true);
  assert.equal(clickRes.button, 'left');

  // Virtual typing
  const typeRes = await display.type('Hello MAVE Virtual World');
  assert.equal(typeRes.ok, true);
  assert.equal(typeRes.charsTyped, 24);

  // Virtual scroll
  const scrollRes = await display.scroll(0, 150);
  assert.equal(scrollRes.ok, true);

  // Virtual screenshot
  const shot = await display.captureScreenshot();
  assert.ok(shot.dataUrl.startsWith('data:image/png;base64,'));
  assert.equal(shot.width, 1280);
  assert.equal(shot.height, 800);

  // Virtual drag
  const dragRes = await display.drag(100, 100, 500, 500);
  assert.equal(dragRes.ok, true);
  assert.equal(display.cursor.x, 500);
  assert.equal(display.cursor.y, 500);
});

test('VirtualBrowserController: isolated tabs, navigation, selectors, and accessibility tree', async (t) => {
  const display = new VirtualDisplayServer();
  const browser = new VirtualBrowserController({ displayServer: display, guestRoot: testDir });

  // Initial tab
  const tabs = browser.listTabs();
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].isActive, true);

  // Create new tab
  const tab2 = browser.createTab('https://example.com');
  assert.equal(browser.listTabs().length, 2);
  assert.equal(browser.activeTabId, tab2.id);

  // Navigate
  const navRes = await browser.goto('https://news.ycombinator.com');
  assert.equal(navRes.ok, true);
  assert.equal(browser.getActiveTab().url, 'https://news.ycombinator.com');

  // Selector click and virtual coordinate click
  const clickSel = await browser.click('.morelink');
  assert.equal(clickSel.ok, true);
  assert.equal(clickSel.method, 'semantic_selector');

  const clickCoord = await browser.click({ x: 200, y: 150 });
  assert.equal(clickCoord.ok, true);

  // Typing
  const typeRes = await browser.type('input[name=q]', 'AI research');
  assert.equal(typeRes.ok, true);
  assert.equal(typeRes.charsTyped, 11);

  // Accessibility tree
  const tree = await browser.getAccessibilityTree();
  assert.ok(tree.nodes.length >= 4);

  // Close tab
  const closeRes = browser.closeTab(tab2.id);
  assert.equal(closeRes, true);
  assert.equal(browser.listTabs().length, 1);
});

test('VirtualDesktopController: sandboxed guest filesystem, command runner, and export bridge', async (t) => {
  const desktop = new VirtualDesktopController({ userDataPath: testDir });

  // Write guest file
  const writeRes = await desktop.writeGuestFile('workspace/index.html', '<h1>MAVE Virtual Website</h1>');
  assert.equal(writeRes.ok, true);

  // Read guest file
  const readRes = await desktop.readGuestFile('workspace/index.html');
  assert.equal(readRes.content, '<h1>MAVE Virtual Website</h1>');

  // Path traversal escape protection
  await assert.rejects(
    async () => {
      await desktop.readGuestFile('../../Windows/System32/drivers/etc/hosts');
    },
    /Security Violation/
  );

  // Run terminal command inside guest workspace
  const cmdRes = await desktop.runTerminalCommand('node -e "console.log(\'GUEST_OK_\' + (40 + 2))"');
  assert.equal(cmdRes.exitCode, 0);
  assert.ok(cmdRes.stdout.includes('GUEST_OK_42'));

  // Export file to host
  const hostOut = path.join(testDir, 'host_export', 'exported_index.html');
  const exportRes = await desktop.exportFileToHost('workspace/index.html', hostOut);
  assert.equal(exportRes.ok, true);
  assert.ok(fs.existsSync(hostOut));
  assert.equal(fs.readFileSync(hostOut, 'utf8'), '<h1>MAVE Virtual Website</h1>');
});

test('ExecutionTargetRouter: strict environment resolution and no silent host fallback', () => {
  const router = new ExecutionTargetRouter();

  // Research / Web -> Virtual Browser
  const r1 = router.resolveTarget('Research ten suppliers and compare prices on websites');
  assert.equal(r1.environment, ENVIRONMENTS.VIRTUAL_BROWSER);
  assert.equal(r1.isGuest, true);
  assert.equal(r1.requiresConfirmation, false);

  // Coding / Build -> Virtual Computer
  const r2 = router.resolveTarget('Write a Python script to parse CSV files and run unit tests');
  assert.equal(r2.environment, ENVIRONMENTS.VIRTUAL_COMPUTER);
  assert.equal(r2.isGuest, true);
  assert.equal(r2.requiresConfirmation, false);

  // Explicit host request -> Host Computer with required confirmation
  const r3 = router.resolveTarget('Control my physical mouse and click on my actual desktop screen');
  assert.equal(r3.environment, ENVIRONMENTS.HOST_COMPUTER);
  assert.equal(r3.isGuest, false);
  assert.equal(r3.requiresConfirmation, true);

  // Authorization management
  assert.equal(router.isHostAuthorized('sess_1'), false);
  router.authorizeHostSession('sess_1');
  assert.equal(router.isHostAuthorized('sess_1'), true);
  router.revokeHostSession('sess_1');
  assert.equal(router.isHostAuthorized('sess_1'), false);

  // Non-Interference Invariant: Assert no silent fallback
  assert.throws(() => {
    router.assertNoSilentHostFallback(ENVIRONMENTS.VIRTUAL_BROWSER, new Error('Virtual browser page timeout'));
  }, /Silent fallback to host computer is strictly prohibited/);
});

test('VirtualComputerSession: unified execution dispatcher and manual takeover mode', async () => {
  const session = new VirtualComputerSession({ userDataPath: testDir });
  await session.init();

  session.setActiveTask('Research Quantum Computing and write summary report');
  assert.equal(session.activeTask, 'Research Quantum Computing and write summary report');
  assert.equal(session.currentEnvironment, ENVIRONMENTS.VIRTUAL_BROWSER);

  // Execute guest actions
  const nav = await session.executeGuestAction('open_url', { url: 'https://arxiv.org' });
  assert.equal(nav.ok, true);

  const shot = await session.executeGuestAction('screenshot');
  assert.ok(shot.dataUrl);

  const file = await session.executeGuestAction('write_file', { path: 'workspace/report.md', content: '# Quantum Computing Report' });
  assert.equal(file.ok, true);

  // Manual Takeover Protocol
  assert.equal(session.inManualTakeover, false);
  session.startTakeover();
  assert.equal(session.inManualTakeover, true);

  // While in takeover, agent actions must be rejected
  await assert.rejects(async () => {
    await session.executeGuestAction('click', { coordinate: { x: 100, y: 100 } });
  }, /Manual Takeover/);

  // User input dispatched through viewer
  const userClick = await session.dispatchUserInput({ type: 'click', x: 250, y: 350, button: 'left' });
  assert.equal(userClick.ok, true);

  session.stopTakeover();
  assert.equal(session.inManualTakeover, false);

  await session.close();
});
