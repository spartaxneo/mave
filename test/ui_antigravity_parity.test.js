'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Settings } = require('../src/main/settings');

const ROOT = path.join(__dirname, '..');

test('Zero dummy marketing banners, fake models, or mock telemetry remain in renderer & IPC', () => {
  const files = [
    'src/renderer/app.html',
    'src/renderer/app.js',
    'src/renderer/home.js',
    'src/main/ipc.js',
  ];
  const forbidden = [
    'GPT-6',
    'Luna Light',
    'Try Plus free',
    'empty-gpt6-banner',
    'Ask ChatGPT',
    'Work with Codex',
    '98.4% Hit Rate',
    '88/100',
    '4.2h',
    'Pass ONDC',
    'btn-add-mock-shelf',
    'Engineering</td><td>250,000',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${rel} must not contain dummy token: ${token}`);
    }
  }
});

test('Settings tabs map 1:1 to real unique settings panes with zero orphans or dead tabs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/app.html'), 'utf8');

  const tabsMatch = html.match(/<aside class="settings-sidebar-col" id="settings-tabs">([\s\S]*?)<\/aside>/);
  assert.ok(tabsMatch, '#settings-tabs sidebar exists');

  const contentMatch = html.match(/<div class="settings-content scroll" id="settings-content">([\s\S]*?)<!-- "Meet Voice" Modal/);
  assert.ok(contentMatch, '#settings-content container exists');

  const tabMatches = [...tabsMatch[1].matchAll(/class="settings-tab-btn[^"]*"[^>]*data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tabMatches.length, 7, 'Settings sidebar displays 7 user-friendly primary categories');

  const uniqueTabs = new Set(tabMatches);
  assert.equal(uniqueTabs.size, tabMatches.length, 'Every settings tab must be unique without duplicates');

  const paneMatches = [...contentMatch[1].matchAll(/<section\s+data-pane="([^"]+)"/g)].map((m) => m[1]);
  const uniquePanes = new Set(paneMatches);
  assert.equal(uniquePanes.size, paneMatches.length, 'Every settings section pane must be unique (no duplicate models pane)');

  for (const tab of tabMatches) {
    assert.ok(uniquePanes.has(tab), `Settings tab "${tab}" must have matching <section data-pane="${tab}">`);
  }

  // Every sub-setting in SETTINGS_CATEGORIES must map 1:1 to a valid <section data-pane="...">
  const appJs = fs.readFileSync(path.join(ROOT, 'src/renderer/app.js'), 'utf8');
  const subPanes = [...appJs.matchAll(/\{\s*pane:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(subPanes.length >= 18, 'All secondary/advanced settings remain accessible inside organized sub-settings');
  for (const subPane of subPanes) {
    assert.ok(uniquePanes.has(subPane), `Sub-setting "${subPane}" must map to <section data-pane="${subPane}">`);
  }
});

test('Antigravity workspace shell: unified sidebar, split inspector, real model catalog, and CSS rules', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/app.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/app.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'src/renderer/app.js'), 'utf8');
  const homeJs = fs.readFileSync(path.join(ROOT, 'src/renderer/home.js'), 'utf8');

  assert.equal(html.includes('id="icon-rail"'), false, 'Redundant legacy icon rail removed for clean Antigravity sidebar');
  assert.ok(html.includes('id="workspace-inspector"'), 'Collapsible right workspace inspector exists');
  assert.ok(html.includes('id="workspace-panel-toggle-btn"'), 'Header workspace toggle exists');
  assert.ok(html.includes('id="workspace-files-pane"'), 'Workspace files explorer pane exists');
  assert.ok(html.includes('id="capsule-model-options-list"'), 'Dynamic model selector list exists');
  assert.ok(html.includes('id="open-settings-btn"'), 'Direct bottom Settings row exists in sidebar');

  assert.ok(css.includes('#nav .nav-item'), 'CSS defines borderless stacked #nav .nav-item rules');
  assert.ok(css.includes('.new-chat-btn'), 'CSS defines borderless .new-chat-btn rules');
  assert.ok(css.includes('.project-threads-nested'), 'CSS defines expandable project nested conversation rules');
  assert.ok(css.includes('.workspace-inspector'), 'CSS defines right workspace inspector split pane');

  assert.ok(appJs.includes("api.invoke('models:catalog')"), 'app.js loads models from real backend catalog');
  assert.ok(appJs.includes("api.invoke('ghost:workspace-tree'"), 'app.js loads live workspace files');
  assert.ok(appJs.includes("api.invoke('dialog:openDirectory')"), 'app.js uses real OS directory picker');
  assert.ok(homeJs.includes('formatRelativeTime'), 'home.js renders Antigravity relative timestamps');
  assert.ok(homeJs.includes("api.invoke('firebase:get-config')"), 'home.js loads Firebase project config dynamically');
});

test('Settings schema persists all UI, appearance, agent, virtual computer, and node keys', () => {
  const tmpFile = path.join(os.tmpdir(), `mave-ui-settings-${Date.now()}.json`);
  const s = new Settings(tmpFile);
  const updated = s.update({
    theme: 'light',
    accentColor: 'blue',
    fullAccess: false,
    defaultPermissions: true,
    fileOpenDest: 'vscode',
    terminalShell: 'powershell',
    confirmCloseWindow: 'always',
    projectlessChatFolder: 'C:\\Workspaces\\Mave',
    vcCpuCores: 6,
    vcRamGb: 8,
    vramQuotaGb: 6,
    missionControlEnabled: false,
    deepResearchEnabled: true,
    skillForgeEnabled: false,
    nodeRole: 'host',
    nodeGpuAccel: true,
    nodeCamRelay: false,
    nodeIosAudio: true,
    mascotStyle: 'robot',
    mascotPalette: 'mint',
  });

  assert.equal(updated.theme, 'light');
  assert.equal(updated.accentColor, 'blue');
  assert.equal(updated.fullAccess, false);
  assert.equal(updated.fileOpenDest, 'vscode');
  assert.equal(updated.terminalShell, 'powershell');
  assert.equal(updated.confirmCloseWindow, 'always');
  assert.equal(updated.projectlessChatFolder, 'C:\\Workspaces\\Mave');
  assert.equal(updated.vcCpuCores, 6);
  assert.equal(updated.vcRamGb, 8);
  assert.equal(updated.vramQuotaGb, 6);
  assert.equal(updated.missionControlEnabled, false);
  assert.equal(updated.skillForgeEnabled, false);
  assert.equal(updated.mascotStyle, 'robot');
  assert.equal(updated.mascotPalette, 'mint');

  const reloaded = new Settings(tmpFile);
  assert.equal(reloaded.get('vcCpuCores'), 6);
  assert.equal(reloaded.get('accentColor'), 'blue');
  assert.equal(reloaded.get('fullAccess'), false);
  fs.rmSync(tmpFile, { force: true });
});

test('Preload IPC allowlist and main IPC handlers expose new real endpoints without fake fallbacks', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src/main/preload.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(ROOT, 'src/main/ipc.js'), 'utf8');

  for (const ch of ['dialog:openDirectory', 'models:catalog', 'ghost:workspace-tree', 'ghost:read-file', 'data:import-file']) {
    assert.ok(preload.includes(`'${ch}'`), `preload allowlists ${ch}`);
    assert.ok(ipc.includes(`handle('${ch}'`), `ipc registers ${ch}`);
  }
  assert.ok(ipc.includes('hasData'), 'analytics:stats distinguishes empty telemetry from tracked activity');
});

test('Full-window Antigravity/Codex Settings, slash/mention popover, and in-pane file preview are wired', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/app.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/app.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'src/renderer/app.js'), 'utf8');
  const homeJs = fs.readFileSync(path.join(ROOT, 'src/renderer/home.js'), 'utf8');

  assert.ok(css.includes('#settings-modal .settings-modal-dialog'), 'Settings uses dedicated full-window flex-direction:row rules');
  assert.match(css, /flex-direction:\s*row\s*!important/, 'Settings sidebar and content render side-by-side horizontally');
  assert.ok(html.includes('id="composer-suggest-popover"'), 'Composer slash/@ suggest popover exists in DOM');
  assert.ok(html.includes('class="sidebar-footer-bar"'), 'Compact 1-row sidebar footer bar exists');
  assert.ok(homeJs.includes('SLASH_COMMANDS') && homeJs.includes('ensureWorkspaceMentions'), 'home.js wires interactive / commands and @ mentions');
  assert.ok(appJs.includes("api.invoke('ghost:read-file'"), 'Workspace explorer opens files inside Antigravity Preview/Canvas pane');
});

test('Square corners, smooth animations, in-window loader, Vorssaint notch click, zero dummy strings, and clean shutdown', () => {
  const stylesCss = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
  const appCss = fs.readFileSync(path.join(ROOT, 'src/renderer/app.css'), 'utf8');
  const appHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/app.html'), 'utf8');
  const homeJs = fs.readFileSync(path.join(ROOT, 'src/renderer/home.js'), 'utf8');
  const overlayLoader = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay-loader.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  const windowsJs = fs.readFileSync(path.join(ROOT, 'src/main/windows.js'), 'utf8');
  const mascotRig = fs.readFileSync(path.join(ROOT, 'src/renderer/mascot_rig.js'), 'utf8');
  const islandHtml = fs.readFileSync(path.join(ROOT, 'src/renderer/island.html'), 'utf8');
  const islandJs = fs.readFileSync(path.join(ROOT, 'src/renderer/island.js'), 'utf8');

  // 1. Square window corners (no outer black triangular gaps) & no idle float animation
  assert.ok(stylesCss.includes('--r-window: 0px'), 'Root window radius is 0px');
  assert.match(stylesCss, /html,\s*body\s*\{[^}]*background:\s*var\(--bg\)/, 'Window root background is opaque, avoiding corner halos');
  assert.match(stylesCss, /\.window\s*\{[^}]*border-radius:\s*0/, 'Window chrome uses sharp square corners');
  assert.ok(!appCss.includes('animation: float'), 'Empty mark float loop removed for clean stationary rendering');

  // 2. Startup status renders inside main window, never as a floating desktop overlay snackbar
  assert.ok(!mainJs.includes("windows.broadcast('loader'"), 'Main process does not broadcast loader snackbars to desktop overlays');
  assert.ok(!overlayLoader.includes("api.on('loader'"), 'Overlay loader no longer pops floating corner snackbar');
  assert.ok(homeJs.includes('renderWindowLoader'), 'Main window renders startup progress internally');
  assert.ok(appHtml.includes('id="settings-sub-header"') && appHtml.includes('id="settings-subnav-wrap"'), 'Settings supports clean primary + sub-settings hierarchy');

  // 3. Top notch click/resize + clean blur collapse without mascot propagation block
  assert.ok(!mascotRig.includes('e.stopPropagation();'), 'Mascot rig allows notch clicks to bubble cleanly');
  assert.ok(windowsJs.includes('setResizable(true)'), 'Island window enables resizing so notch expansion succeeds on Windows');
  assert.ok(islandJs.includes("api.on('island:blur'"), 'Expanded island collapses cleanly when focus leaves');

  // 4. Zero dummy music/app-mixer/calendar/quota strings or Math.random sparklines
  for (const forbidden of ['Lo-Fi Deep Focus', 'Architecture Review', 'GitHub Copilot CLI', 'reacts to your Mac']) {
    assert.equal(islandHtml.includes(forbidden), false, `island.html must not contain dummy string: ${forbidden}`);
  }
  assert.equal(islandJs.includes('Lo-Fi Deep Focus'), false, 'island.js must not contain dummy lyrics/track copy');

  // 5. Clean shutdown tears down all singletons & background workers
  for (const svc of ['getJarvisButler().stop()', 'getJarvisTelemetry().stopMonitoring()', 'getAutonomousSentinel().stop()', 'audio.stop()']) {
    assert.ok(mainJs.includes(svc), `Clean shutdown stops ${svc}`);
  }

  // 6. Minimalist Ponder-style Onboarding & Gmail-only auth (zero guest/anonymous login)
  const onboardingCss = fs.readFileSync(path.join(ROOT, 'src/renderer/onboarding.css'), 'utf8');
  const onboardingWiz = fs.readFileSync(path.join(ROOT, 'src/renderer/onboarding_wizard.js'), 'utf8');
  assert.ok(onboardingCss.includes('--onb-bg: #ffffff'), 'Onboarding uses calm pure white minimalist canvas');
  assert.equal(appHtml.includes('nom-auth-tab-guest'), false, 'Account modal has no anonymous guest tab');
  assert.equal(appHtml.includes('nom-auth-guest-btn'), false, 'Account modal has no skip-login guest button');
  assert.ok(onboardingWiz.includes('device_role') && onboardingWiz.includes('connect_host') && onboardingWiz.includes('device_features') && onboardingWiz.includes('installing'), 'Onboarding includes Step 3 Host/Companion choice, QR/Gmail connect, hardware scan feature picker, and setup installer');
});
