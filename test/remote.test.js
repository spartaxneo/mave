'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { MobileWebServer, getLocalIp } = require('../src/main/remote/web');
const { TelegramBridge } = require('../src/main/remote/telegram');
const remotePlugin = require('../src/main/plugins/builtin/remote');
const { validate } = require('../src/main/plugins/registry');

test('remote builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(remotePlugin));
  assert.equal(remotePlugin.length, 3);

  for (const tool of remotePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} must be valid: ${error}`);
  }

  const names = remotePlugin.map((t) => t.name);
  assert.ok(names.includes('start_mobile_web_controller'));
  assert.ok(names.includes('start_telegram_bot'));
  assert.ok(names.includes('get_remote_control_status'));
});

test('getLocalIp returns a valid IPv4 address', () => {
  const ip = getLocalIp();
  assert.ok(typeof ip === 'string');
  assert.ok(/\d+\.\d+\.\d+\.\d+/.test(ip));
});

test('MobileWebServer serves mobile HTML and handles task requests', async () => {
  const mockController = {
    runTask: async (task) => ({ ok: true, text: `Executed task: ${task}` }),
  };

  const webServer = new MobileWebServer({
    controller: mockController,
    logger: null,
    port: 48910, // Use high ephemeral port for tests
  });

  try {
    const url = await webServer.start();
    assert.ok(url.includes(':48910'));

    // Test GET /
    const htmlRes = await fetch(url);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('Mave Mobile'));
    assert.ok(html.includes('quick-actions'));

    // Verify all client-side scripts inside HTML parse and compile without syntax errors
    const scriptMatches = html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi);
    let scriptCount = 0;
    for (const match of scriptMatches) {
      const code = match[1].trim();
      if (!code) continue;
      scriptCount++;
      assert.doesNotThrow(() => {
        new Function(code);
      }, 'Client-side script in MobileWebServer HTML must not have syntax errors');
    }
    assert.ok(scriptCount > 0, 'Must have at least one client script tag');

    // Test POST /api/task
    const taskRes = await fetch(`${url}/api/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'check system status' }),
    });
    assert.equal(taskRes.status, 200);
    const taskData = await taskRes.json();
    assert.equal(taskData.ok, true);
    assert.ok(taskData.text.includes('check system status'));
  } finally {
    webServer.stop();
  }
});

test('TelegramBridge verifies pairing and rejects unauthorized users', async () => {
  const messages = [];
  const bridge = new TelegramBridge({
    token: 'fake-token-for-test',
    authorizedChatId: '123456',
    controller: null,
    logger: null,
  });

  bridge.sendMessage = async (chatId, text) => {
    messages.push({ chatId, text });
  };

  // Unauthorized chat message
  await bridge.handleMessage({ chat: { id: '999999' }, text: 'Hello' });
  assert.equal(messages.length, 1);
  assert.ok(messages[0].text.includes('Access denied'));

  // Authorized chat message
  messages.length = 0;
  await bridge.handleMessage({ chat: { id: '123456' }, text: '/start' });
  assert.equal(messages.length, 1);
  assert.ok(messages[0].text.includes('Mave is connected'));
});

test('MobileWebServer remote control, voice, and camera endpoints work', async () => {
  const mouseCalls = [];
  const keyCalls = [];
  let transcribedWav = null;
  let analyzedImage = null;

  const mockInput = {
    move: async (x, y) => { mouseCalls.push({ type: 'move', x, y }); },
    click: async (btn, count) => { mouseCalls.push({ type: 'click', btn, count }); },
    mouseDown: async (btn) => { mouseCalls.push({ type: 'down', btn }); },
    mouseUp: async (btn) => { mouseCalls.push({ type: 'up', btn }); },
    scroll: async (dx, dy) => { mouseCalls.push({ type: 'scroll', dx, dy }); },
    type: async (text) => { keyCalls.push({ type: 'type', text }); },
    keys: async (combo) => { keyCalls.push({ type: 'key', combo }); },
  };

  const mockSpeech = {
    transcribe: async (wav) => {
      transcribedWav = wav;
      return 'open Chrome and check the weather';
    },
  };

  const mockController = {
    input: mockInput,
    speech: mockSpeech,
    runTask: async (task, source, options = {}) => {
      if (options.image) {
        analyzedImage = options.image;
        return { ok: true, text: `Analyzed camera image for: ${task}` };
      }
      return { ok: true, text: `Executed task: ${task}` };
    },
  };

  const webServer = new MobileWebServer({
    controller: mockController,
    logger: null,
    port: 48920,
  });

  try {
    const url = await webServer.start();

    // 1. Test POST /api/control/mouse
    const mouseRes = await fetch(`${url}/api/control/mouse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'click', xRatio: 0.5, yRatio: 0.5, button: 'left' }),
    });
    assert.equal(mouseRes.status, 200);
    const mouseData = await mouseRes.json();
    assert.equal(mouseData.ok, true);
    assert.ok(mouseCalls.some((c) => c.type === 'move'));
    assert.ok(mouseCalls.some((c) => c.type === 'click'));

    // 2. Test POST /api/control/keyboard
    const typeRes = await fetch(`${url}/api/control/keyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'type', text: 'Hello Mave' }),
    });
    assert.equal(typeRes.status, 200);
    assert.ok(keyCalls.some((c) => c.type === 'type' && c.text === 'Hello Mave'));

    const keyRes = await fetch(`${url}/api/control/keyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'key', combo: 'win' }),
    });
    assert.equal(keyRes.status, 200);
    assert.ok(keyCalls.some((c) => c.type === 'key' && c.combo === 'win'));

    // 3. Test POST /api/voice/transcribe
    const dummyWav = Buffer.alloc(100, 0x12);
    const voiceRes = await fetch(`${url}/api/voice/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: dummyWav,
    });
    assert.equal(voiceRes.status, 200);
    const voiceData = await voiceRes.json();
    assert.equal(voiceData.ok, true);
    assert.equal(voiceData.transcript, 'open Chrome and check the weather');
    assert.ok(voiceData.reply.includes('weather'));
    assert.ok(voiceData.audioUrl.includes('/api/voice/tts'));
    assert.ok(transcribedWav != null);

    // 4. Test POST /api/camera/analyze
    const dummyImgBase64 = Buffer.from('fake-camera-jpg-bytes').toString('base64');
    const camRes = await fetch(`${url}/api/camera/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dummyImgBase64, prompt: 'What object is in this camera frame?' }),
    });
    assert.equal(camRes.status, 200);
    const camData = await camRes.json();
    assert.equal(camData.ok, true);
    assert.ok(camData.text.includes('Analyzed camera image'));
    assert.ok(analyzedImage != null);
  } finally {
    webServer.stop();
  }
});

test('MobileWebServer enforces 3-tier role-based PIN security (8080, 0509, 1508)', async () => {
  const { MobileWebServer } = require('../src/main/remote/web');
  const mockSettings = {
    get: (key) => {
      if (key === 'readPassword') return '8080';
      if (key === 'operatePassword') return '0509';
      if (key === 'adminPassword') return '1508';
      if (key === 'securityEnabled') return true;
      return null;
    },
    set: () => {}
  };

  const webServer = new MobileWebServer({
    controller: { settings: mockSettings, runTask: async () => ({ ok: true, text: 'Done' }) },
    port: 48930
  });

  try {
    const url = await webServer.start();

    // 1. Invalid PIN should return 401
    const badLogin = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' })
    });
    assert.equal(badLogin.status, 401);

    // 2. Login with 8080 (Read-Only)
    const readLogin = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '8080' })
    });
    assert.equal(readLogin.status, 200);
    const readData = await readLogin.json();
    assert.equal(readData.ok, true);
    assert.equal(readData.tier, 'read');
    assert.ok(readData.token);

    // 3. Login with 0509 (Operate / Chat)
    const operateLogin = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0509' })
    });
    assert.equal(operateLogin.status, 200);
    const operateData = await operateLogin.json();
    assert.equal(operateData.ok, true);
    assert.equal(operateData.tier, 'operate');
    assert.ok(operateData.token);

    // 4. Login with 1508 (Admin)
    const adminLogin = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1508' })
    });
    assert.equal(adminLogin.status, 200);
    const adminData = await adminLogin.json();
    assert.equal(adminData.ok, true);
    assert.equal(adminData.tier, 'admin');
    assert.ok(adminData.token);

    // 5. Check auth status endpoint
    const statusRes = await fetch(`${url}/api/auth/status`, {
      headers: { 'X-Mave-Token': operateData.token }
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.authenticated, true);
  } finally {
    webServer.stop();
  }
});

test('MobileWebServer renders Light Theme support and handles theme switching via settings', async () => {
  let savedTheme = 'dark';
  const mockController = {
    settings: {
      get: (k) => (k === 'theme' ? savedTheme : '8080'),
      publicView: () => ({ theme: savedTheme }),
      update: (patch) => {
        if (patch.theme) savedTheme = patch.theme;
      }
    }
  };

  const webServer = new MobileWebServer({
    controller: mockController,
    logger: null,
    port: 48940,
  });

  try {
    const url = await webServer.start();

    // 1. Verify HTML includes light theme CSS tokens and controls
    const htmlRes = await fetch(url);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();

    assert.ok(html.includes('[data-theme="light"]'), 'Must include [data-theme="light"] CSS rules');
    assert.ok(html.includes('theme-light'), 'Must include theme-light CSS rules');
    assert.ok(html.includes('prefers-color-scheme: light'), 'Must support OS prefers-color-scheme light');
    assert.ok(html.includes('id="theme-toggle-btn"'), 'Must have header theme quick toggle button');
    assert.ok(html.includes('id="theme-segmented"'), 'Must have theme segmented control in Appearance settings');
    assert.ok(html.includes('data-theme-val="light"'), 'Must have light theme option');
    assert.ok(html.includes('data-theme-val="dark"'), 'Must have dark theme option');
    assert.ok(html.includes('data-theme-val="system"'), 'Must have system theme option');

    // 2. Test GET /api/settings returns theme
    const getSettingsRes = await fetch(`${url}/api/settings`);
    assert.equal(getSettingsRes.status, 200);
    const getSettingsData = await getSettingsRes.json();
    assert.equal(getSettingsData.ok, true);
    assert.equal(getSettingsData.settings.theme, 'dark');

    // 3. Test POST /api/settings updates theme to light
    const postSettingsRes = await fetch(`${url}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'light' })
    });
    assert.equal(postSettingsRes.status, 200);
    assert.equal(savedTheme, 'light');
  } finally {
    webServer.stop();
  }
});


