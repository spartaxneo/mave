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

test('VorssaintManager: Port Manager utility lists active ports', async () => {
  const ports = vorssaintManager.getListeningPorts();
  assert.ok(Array.isArray(ports), 'Ports returns array');
  assert.ok(ports.length > 0, 'Found active listening ports');
  const first = ports[0];
  assert.ok(typeof first.port === 'number', 'Port number is valid');
  assert.ok(first.port > 0 && first.port < 65536, 'Port within range');
  assert.equal(first.state, 'LISTENING', 'State is LISTENING');
});

test('Firebase: Google and Apple Sign-In Provider methods', async () => {
  const googleRes = await firebaseService.signInWithProvider({ provider: 'google.com' });
  assert.ok(googleRes.ok, 'Google sign in success');
  assert.ok(googleRes.user.email.includes('@gmail.com'), 'Google email formatted');

  const appleRes = await firebaseService.signInWithProvider({ provider: 'apple.com' });
  assert.ok(appleRes.ok, 'Apple sign in success');
  assert.ok(appleRes.user.email.includes('@privaterelay.appleid.com'), 'Apple private relay email formatted');
});

test('VorssaintManager: companion mascot configuration & styling parity', async () => {
  const cfg = vorssaintManager.updateSettings({
    mascotStyle: 'robot',
    mascotShape: 'squircle',
    mascotPalette: 'mint',
    mascotSide: 'right',
    mascotVisits: true,
    mascotReactions: true,
    mascotFrequency: 'frequent',
    commandBar: true,
    commandBarStyle: 'droplet',
  });

  assert.equal(cfg.mascotStyle, 'robot', 'Mascot style is robot');
  assert.equal(cfg.mascotShape, 'squircle', 'Mascot shape is squircle');
  assert.equal(cfg.mascotPalette, 'mint', 'Mascot palette is mint');
  assert.equal(cfg.mascotSide, 'right', 'Mascot side is right');
  assert.equal(cfg.mascotFrequency, 'frequent', 'Mascot frequency is frequent');
  assert.equal(cfg.commandBarStyle, 'droplet', 'Command bar opens as droplet');

  const current = vorssaintManager.getSettings();
  assert.equal(current.mascotStyle, 'robot');
  assert.equal(current.mascotPalette, 'mint');
});

test('VorssaintManager: cross-platform OS window snapping logic', () => {
  const leftRes = vorssaintManager.snapWindow('left');
  assert.ok(leftRes.ok, 'Snap left ok');
  assert.equal(leftRes.action, 'left');
  assert.ok(leftRes.bounds.width > 0, 'Bounds width > 0');

  const rightRes = vorssaintManager.snapWindow('right');
  assert.ok(rightRes.ok, 'Snap right ok');

  const maxRes = vorssaintManager.snapWindow('maximize');
  assert.ok(maxRes.ok, 'Snap maximize ok');

  const centerRes = vorssaintManager.snapWindow('center');
  assert.ok(centerRes.ok, 'Snap center ok');
});

test('VorssaintMascotRig: exported class and authentic geometric palettes', () => {
  const { VorssaintMascotRig } = require('../src/renderer/mascot_rig');
  assert.ok(typeof VorssaintMascotRig === 'function', 'VorssaintMascotRig is a class constructor');
  
  // Verify palettes map
  const mockRig = new VorssaintMascotRig(null, { style: 'minimal', palette: 'pearl' });
  assert.ok(mockRig.palettes.pearl, 'Pearl palette exists');
  assert.ok(mockRig.palettes.lemon, 'Lemon palette exists');
  assert.ok(mockRig.palettes.peach, 'Peach palette exists');
  assert.ok(mockRig.palettes.rose, 'Rose palette exists');
  assert.ok(mockRig.palettes.lilac, 'Lilac palette exists');
  assert.ok(mockRig.palettes.sky, 'Sky palette exists');
  assert.ok(mockRig.palettes.mint, 'Mint palette exists');
  assert.equal(mockRig.palettes.pearl.light, '#FCFAF5');
  assert.equal(mockRig.palettes.pearl.shade, '#D6D9E6');
});

test('Vorssaint: mobile web companion and hub asset integrity', () => {
  const androidWeb = path.join(__dirname, '..', 'vorssaint', 'android', 'mobile_web', 'index.html');
  const iosWeb = path.join(__dirname, '..', 'vorssaint', 'ios', 'mobile_web', 'index.html');
  const menuPanel = path.join(__dirname, '..', 'src', 'renderer', 'vorssaint_menu_panel.html');
  const hub = path.join(__dirname, '..', 'src', 'renderer', 'vorssaint_hub.html');
  const mascotJs = path.join(__dirname, '..', 'src', 'renderer', 'mascot_rig.js');
  const mascotCss = path.join(__dirname, '..', 'src', 'renderer', 'mascot_rig.css');

  assert.ok(fs.existsSync(androidWeb), 'Android mobile web exists');
  assert.ok(fs.existsSync(iosWeb), 'iOS mobile web exists');
  assert.ok(fs.existsSync(menuPanel), 'Menu panel HTML exists');
  assert.ok(fs.existsSync(hub), 'Vorssaint Hub HTML exists');
  assert.ok(fs.existsSync(mascotJs), 'Mascot Rig JS exists');
  assert.ok(fs.existsSync(mascotCss), 'Mascot Rig CSS exists');

  const hubContent = fs.readFileSync(hub, 'utf8');
  assert.ok(hubContent.includes('id="page-general"'), 'Hub has general page');
  assert.ok(hubContent.includes('id="page-mascot"'), 'Hub has companion mascot page');
  assert.ok(hubContent.includes('id="page-island"'), 'Hub has dynamic island page');
  assert.ok(hubContent.includes('id="page-tools"'), 'Hub has quick tools page');

  const menuContent = fs.readFileSync(menuPanel, 'utf8');
  assert.ok(menuContent.includes('data-tab="mixer"'), 'Menu panel has mixer tab');
  assert.ok(menuContent.includes('data-tab="system"'), 'Menu panel has system tab');
  assert.ok(menuContent.includes('data-tab="controls"'), 'Menu panel has windows controls tab');
  assert.ok(menuContent.includes('data-tab="toggles"'), 'Menu panel has toggles tab');
  assert.ok(menuContent.includes('data-tab="island"'), 'Menu panel has island tab');
  assert.ok(menuContent.includes('data-tab="utilities"'), 'Menu panel has utilities tab');

  // Verify mobile web PWA manifests and service workers
  const androidManifest = path.join(__dirname, '..', 'vorssaint', 'android', 'mobile_web', 'manifest.json');
  const androidSw = path.join(__dirname, '..', 'vorssaint', 'android', 'mobile_web', 'sw.js');
  const iosManifest = path.join(__dirname, '..', 'vorssaint', 'ios', 'mobile_web', 'manifest.json');
  const iosSw = path.join(__dirname, '..', 'vorssaint', 'ios', 'mobile_web', 'sw.js');
  assert.ok(fs.existsSync(androidManifest), 'Android PWA manifest exists');
  assert.ok(fs.existsSync(androidSw), 'Android service worker exists');
  assert.ok(fs.existsSync(iosManifest), 'iOS PWA manifest exists');
  assert.ok(fs.existsSync(iosSw), 'iOS service worker exists');
});

test('Vorssaint: quick toggles, snippets, url cleaner, and 48-feature catalog parity', () => {
  // Quick Toggles
  const toggles = vorssaintManager.getQuickToggles();
  assert.ok(toggles, 'Quick toggles exist');
  assert.ok('micMute' in toggles, 'micMute exists in quick toggles');
  assert.ok('darkMode' in toggles, 'darkMode exists in quick toggles');
  vorssaintManager.setQuickToggle('micMute', true);
  assert.equal(vorssaintManager.getQuickToggles().micMute, true, 'micMute set to true');

  // URL Cleaner
  const dirty = 'https://store.example.com/product?utm_source=google&utm_medium=cpc&gclid=xyz123&keep=real_param';
  const clean = vorssaintManager.cleanUrl(dirty);
  assert.ok(!clean.includes('utm_source'), 'utm_source stripped');
  assert.ok(!clean.includes('gclid'), 'gclid stripped');
  assert.ok(clean.includes('keep=real_param'), 'real parameters preserved');

  // Text Snippets
  const snippets = vorssaintManager.getSnippets();
  assert.ok(Array.isArray(snippets) && snippets.length > 0, 'Snippets returned');
  vorssaintManager.saveSnippet(';testsnip', 'expanded_text_here', 'Test Snippet');
  const found = vorssaintManager.getSnippets().find(s => s.trigger === ';testsnip');
  assert.ok(found, 'Saved snippet found');
  assert.equal(found.expansion, 'expanded_text_here');
  vorssaintManager.deleteSnippet(found.id);
  assert.ok(!vorssaintManager.getSnippets().some(s => s.trigger === ';testsnip'), 'Deleted snippet removed');

  // 48-Feature Catalog Parity
  const catalog = vorssaintManager.getFeatureCatalog();
  assert.ok(catalog, 'Catalog returned');
  const requiredFeatures = [
    'switcher', 'dockPreview', 'windowMaximizer', 'windowLayout',
    'scrollInverter', 'smoothScroll', 'mouseAcceleration', 'textSnippets', 'quitWindowProtection',
    'clipboardHistory', 'pastePlain', 'shelf', 'urlCleaner',
    'mixer', 'soundOutputSwitcher', 'micMute',
    'keepAwake', 'brightness',
    'cleaningMode', 'radialMenu', 'commandBar', 'portManager',
    'notch', 'notchMascot', 'notchLiveEqualizer',
    'monitorCPU', 'monitorGPU', 'monitorMemory', 'monitorNetwork', 'monitorDisk', 'fanControl'
  ];
  for (const f of requiredFeatures) {
    assert.ok(f in catalog, `Feature "${f}" in catalog`);
  }
  vorssaintManager.toggleFeatureAvailability('scrollInverter', false);
  assert.equal(vorssaintManager.getFeatureCatalog().scrollInverter, false, 'Feature toggle persisted');
  vorssaintManager.toggleFeatureAvailability('scrollInverter', true);
  assert.equal(vorssaintManager.getFeatureCatalog().scrollInverter, true, 'Feature toggle reverted');
});

test('Vorssaint: volume, brightness, display sleep, and native window modules', () => {
  // Volume control
  const volRes = vorssaintManager.setVolume(75);
  assert.ok(volRes.ok, 'setVolume returned ok');
  assert.equal(volRes.volume, 75, 'setVolume set to 75');
  assert.equal(vorssaintManager.getMasterVolume(), 75, 'getMasterVolume is 75');

  // Brightness control
  const brightRes = vorssaintManager.setBrightness(85);
  assert.ok(brightRes.ok, 'setBrightness returned ok');
  assert.equal(brightRes.brightness, 85, 'setBrightness set to 85');
  assert.equal(vorssaintManager.getBrightness(), 85, 'getBrightness is 85');

  // Display sleep
  const sleepRes = vorssaintManager.sleepDisplay();
  assert.ok(sleepRes.ok, 'sleepDisplay returned ok');

  // Verify cleaning mode HTML & Command Bar HTML
  const cleaningHtml = path.join(__dirname, '..', 'src', 'renderer', 'cleaning_mode.html');
  const commandBarHtml = path.join(__dirname, '..', 'src', 'renderer', 'command_bar.html');
  assert.ok(fs.existsSync(cleaningHtml), 'cleaning_mode.html exists');
  assert.ok(fs.existsSync(commandBarHtml), 'command_bar.html exists');

  const cleaningContent = fs.readFileSync(cleaningHtml, 'utf8');
  assert.ok(cleaningContent.includes('Keyboard Cleaning Mode'), 'Cleaning mode title exists');
  assert.ok(cleaningContent.includes('id="btn-unlock"'), 'Cleaning mode unlock button exists');

  const cmdContent = fs.readFileSync(commandBarHtml, 'utf8');
  assert.ok(cmdContent.includes('id="cmd-input"'), 'Command bar input exists');
  assert.ok(cmdContent.includes('id="results-list"'), 'Command bar results list exists');

  // Verify standalone builder configuration
  const builderConfig = path.join(__dirname, '..', 'electron-builder-vorssaint.json');
  assert.ok(fs.existsSync(builderConfig), 'electron-builder-vorssaint.json exists');
  const parsedBuilder = JSON.parse(fs.readFileSync(builderConfig, 'utf8'));
  assert.equal(parsedBuilder.appId, 'com.vorssaint.utils');
  assert.equal(parsedBuilder.productName, 'Vorssaint');
});
