'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { ChatGPTNervousSystemBridge, getChatGPTNervousSystemBridge } = require('../src/main/chatgpt_brain/chatgpt_bridge');
const chatgptPlugin = require('../src/main/plugins/builtin/chatgpt_brain_bridge');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

function createMockController() {
  const actions = [];
  return {
    input: {
      windowTitle: async () => 'Visual Studio Code - Mave Project',
      screenshot: async () => Buffer.from('fake-screenshot-data'),
      screenSize: () => ({ width: 2560, height: 1440 }),
      click: async (x, y) => actions.push({ type: 'click', x, y }),
      doubleClick: async (x, y) => actions.push({ type: 'double_click', x, y }),
      type: async (text) => actions.push({ type: 'type', text }),
      key: async (k) => actions.push({ type: 'key', k }),
      hotkey: async (keys) => actions.push({ type: 'hotkey', keys }),
      scroll: async (x, y) => actions.push({ type: 'scroll', x, y }),
    },
    audio: {
      speak: async (text) => actions.push({ type: 'speak', text }),
    },
    actions
  };
}

test('ChatGPTNervousSystemBridge: Generates valid OpenAPI 3.1 schema and Custom GPT instructions', () => {
  const bridge = new ChatGPTNervousSystemBridge({ port: 4040 });

  const spec = bridge.getOpenApiSpec('https://mave.myhome.net:4043');
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'Mave Nervous System API');
  assert.equal(spec.servers[0].url, 'https://mave.myhome.net:4043');

  // Verify core nervous system paths
  assert.ok(spec.paths['/api/chatgpt/eyes/screen']);
  assert.ok(spec.paths['/api/chatgpt/eyes/camera']);
  assert.ok(spec.paths['/api/chatgpt/hands/action']);
  assert.ok(spec.paths['/api/chatgpt/hands/terminal']);
  assert.ok(spec.paths['/api/chatgpt/voice/speak']);
  assert.ok(spec.paths['/api/chatgpt/status']);

  const instructions = bridge.getCustomGptInstructions('https://mave.myhome.net:4043');
  assert.ok(instructions.includes('Mave Central Brain Directives'));
  assert.ok(instructions.includes('mave_see_screen'));
  assert.ok(instructions.includes('mave_execute_action'));
  assert.ok(instructions.includes('mave_run_terminal_command'));
});

test('ChatGPTNervousSystemBridge: Eyes & Hands physical computer execution', async () => {
  const controller = createMockController();
  const bridge = new ChatGPTNervousSystemBridge({ controller, port: 4040 });

  // 1. Eyes: Capture Screen
  const screen = await bridge.captureScreen();
  assert.equal(screen.ok, true);
  assert.equal(screen.activeWindow, 'Visual Studio Code - Mave Project');
  assert.equal(screen.screenDimensions.width, 2560);
  assert.equal(screen.screenDimensions.height, 1440);
  assert.ok(screen.imageUrl.startsWith('data:image/jpeg;base64,'));

  // 2. Eyes: Capture Camera
  const cam = await bridge.captureCamera({ prompt: 'Find car keys' });
  assert.equal(cam.ok, true);
  assert.ok(cam.perception.includes('Find car keys'));

  // 3. Hands: Click
  const clickRes = await bridge.executeHandsAction({ action: 'click', x: 500, y: 350 });
  assert.equal(clickRes.ok, true);
  assert.equal(clickRes.action, 'click');
  assert.ok(controller.actions.some(a => a.type === 'click' && a.x === 500 && a.y === 350));

  // 4. Hands: Type
  const typeRes = await bridge.executeHandsAction({ action: 'type', text: 'console.log("Hello from ChatGPT");' });
  assert.equal(typeRes.ok, true);
  assert.ok(controller.actions.some(a => a.type === 'type' && a.text.includes('console.log')));

  // 5. Hands: Hotkey combo
  const hotkeyRes = await bridge.executeHandsAction({ action: 'hotkey', keys: ['Control', 'Shift', 'P'] });
  assert.equal(hotkeyRes.ok, true);
  assert.ok(controller.actions.some(a => a.type === 'hotkey'));

  // 6. Voice: Speak aloud
  const speakRes = await bridge.speakAloud({ text: 'Task completed successfully on your computer.' });
  assert.equal(speakRes.ok, true);
  assert.ok(controller.actions.some(a => a.type === 'speak' && a.text.includes('Task completed')));
});

test('ChatGPTNervousSystemBridge: Executes terminal PowerShell commands on host', async () => {
  const bridge = new ChatGPTNervousSystemBridge();

  const res = await bridge.executeTerminalCommand({
    command: 'Write-Output "MAVE_NERVOUS_SYSTEM_ACTIVE"'
  });

  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  assert.ok(res.stdout.includes('MAVE_NERVOUS_SYSTEM_ACTIVE'));
  assert.ok(res.output.includes('MAVE_NERVOUS_SYSTEM_ACTIVE'));
});

test('ChatGPT Brain Bridge Plugin: Validates tool schemas and runs setup generator', async () => {
  assert.equal(Array.isArray(chatgptPlugin), true);
  assert.equal(chatgptPlugin.length, 2);

  for (const def of chatgptPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = { log: () => {} };

  // 1. Test get_chatgpt_brain_setup
  const setupTool = chatgptPlugin.find(t => t.name === 'get_chatgpt_brain_setup');
  const setupRes = await setupTool.run({ public_url: 'https://my-mave.tunnel.me' }, mockCtx);

  assert.ok(setupRes.includes('CHATGPT CENTRAL BRAIN + MAVE NERVOUS SYSTEM'));
  assert.ok(setupRes.includes('https://my-mave.tunnel.me/api/chatgpt/openapi.json'));
  assert.ok(setupRes.includes('mave_see_screen'));
  assert.ok(setupRes.includes('mave_run_terminal_command'));

  // 2. Test chatgpt_brain_status
  const statusTool = chatgptPlugin.find(t => t.name === 'chatgpt_brain_status');
  const statusRes = await statusTool.run({}, mockCtx);

  assert.ok(statusRes.includes('MAVE NERVOUS SYSTEM BRIDGE STATUS'));
  assert.ok(statusRes.includes('Connected & Ready'));
});

test('MobileWebServer: Serves ChatGPT Action endpoints over HTTP', async () => {
  const controller = createMockController();
  const testPort = 4920;
  const webServer = new MobileWebServer({ controller, port: testPort });

  await webServer.start();

  try {
    // 1. GET /api/chatgpt/openapi.json
    const specData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/openapi.json`, 'GET');
    assert.equal(specData.statusCode, 200);
    const spec = JSON.parse(specData.body);
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.paths['/api/chatgpt/eyes/screen']);

    // 2. GET /api/chatgpt/status
    const statusData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/status`, 'GET');
    assert.equal(statusData.statusCode, 200);
    const status = JSON.parse(statusData.body);
    assert.equal(status.ok, true);
    assert.ok(status.role.includes('Nervous System'));

    // 3. POST /api/chatgpt/eyes/screen
    const screenData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/eyes/screen`, 'POST', {});
    assert.equal(screenData.statusCode, 200);
    const screen = JSON.parse(screenData.body);
    assert.equal(screen.ok, true);
    assert.equal(screen.activeWindow, 'Visual Studio Code - Mave Project');

    // 4. POST /api/chatgpt/hands/terminal
    const termData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/hands/terminal`, 'POST', {
      command: 'Write-Output "HTTP_NERVOUS_OK"'
    });
    assert.equal(termData.statusCode, 200);
    const term = JSON.parse(termData.body);
    assert.equal(term.ok, true);
    assert.ok(term.stdout.includes('HTTP_NERVOUS_OK'));

  } finally {
    webServer.stop();
  }
});

function makeRequest(urlStr, method = 'GET', bodyObj = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    });

    req.on('error', reject);

    if (bodyObj) {
      req.write(JSON.stringify(bodyObj));
    }
    req.end();
  });
}
