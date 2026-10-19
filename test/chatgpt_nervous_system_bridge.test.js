'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ChatGPTNervousSystemBridge, getChatGPTNervousSystemBridge } = require('../src/main/chatgpt_brain/chatgpt_bridge');
const chatgptPlugin = require('../src/main/plugins/builtin/chatgpt_brain_bridge');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

function createMockController() {
  const actions = [];
  let currentPos = { x: 100, y: 200 };
  return {
    input: {
      windowTitle: async () => 'Visual Studio Code - Mave Project',
      screenshot: async () => Buffer.from('fake-screenshot-data'),
      screenSize: () => ({ width: 2560, height: 1440 }),
      cursor: async () => ({ ...currentPos }),
      move: async (x, y) => {
        currentPos = { x, y };
        actions.push({ type: 'move', x, y });
      },
      click: async (button = 'left', count = 1) => actions.push({ type: 'click', button, count }),
      doubleClick: async (button = 'left') => actions.push({ type: 'double_click', button }),
      rightClick: async (x, y) => actions.push({ type: 'right_click', x, y }),
      mouseDown: async (button = 'left') => actions.push({ type: 'mouse_down', button }),
      mouseUp: async (button = 'left') => actions.push({ type: 'mouse_up', button }),
      type: async (text) => actions.push({ type: 'type', text }),
      key: async (k) => actions.push({ type: 'key', k }),
      keys: async (combo, repeat = 1) => actions.push({ type: 'keys', combo, repeat }),
      hotkey: async (keys) => actions.push({ type: 'hotkey', keys }),
      scroll: async (dx, dy) => actions.push({ type: 'scroll', dx, dy }),
    },
    mockElements: [
      { id: 1, kind: 'button', name: 'Save File', rect: { x: 120, y: 50, w: 80, h: 30 }, center: { x: 160, y: 65 } },
      { id: 2, kind: 'box', name: 'Search Code', value: 'find me', rect: { x: 300, y: 50, w: 200, h: 30 }, center: { x: 400, y: 65 } },
      { id: 3, kind: 'link', name: 'Documentation', rect: { x: 600, y: 50, w: 100, h: 30 }, center: { x: 650, y: 65 } }
    ],
    audio: {
      speak: async (text) => actions.push({ type: 'speak', text }),
    },
    runTask: async (text, source, options) => {
      actions.push({ type: 'run_task', text, source });
      return { ok: true, text: `Mave local agent completed: ${text}`, thoughts: ['Decomposed high-level goal', 'Executed physical steps'] };
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

  // Verify all low-level motor & sensory paths are present in spec
  assert.ok(spec.paths['/api/chatgpt/eyes/screen-detailed']);
  assert.ok(spec.paths['/api/chatgpt/eyes/elements']);
  assert.ok(spec.paths['/api/chatgpt/motor/mouse/click']);
  assert.ok(spec.paths['/api/chatgpt/motor/mouse/move']);
  assert.ok(spec.paths['/api/chatgpt/motor/mouse/scroll']);
  assert.ok(spec.paths['/api/chatgpt/motor/keyboard/type']);
  assert.ok(spec.paths['/api/chatgpt/motor/keyboard/key']);
  assert.ok(spec.paths['/api/chatgpt/fs/read']);
  assert.ok(spec.paths['/api/chatgpt/fs/write']);
  assert.ok(spec.paths['/api/chatgpt/fs/list']);
  assert.ok(spec.paths['/api/chatgpt/instruct']);
  assert.ok(spec.paths['/api/chatgpt/eyes/screen']);
  assert.ok(spec.paths['/api/chatgpt/eyes/camera']);
  assert.ok(spec.paths['/api/chatgpt/hands/action']);
  assert.ok(spec.paths['/api/chatgpt/hands/terminal']);
  assert.ok(spec.paths['/api/chatgpt/voice/speak']);
  assert.ok(spec.paths['/api/chatgpt/status']);

  const instructions = bridge.getCustomGptInstructions('https://mave.myhome.net:4043');
  assert.ok(instructions.includes('Mave Central Brain Directives'));
  assert.ok(instructions.includes('Low-Level Cognitive Intelligence') || instructions.includes('Low-Level Operational Brain'));
  assert.ok(instructions.includes('mave_see_screen_detailed'));
  assert.ok(instructions.includes('mave_mouse_click'));
  assert.ok(instructions.includes('mave_keyboard_type'));
  assert.ok(instructions.includes('mave_keyboard_press_key'));
  assert.ok(instructions.includes('mave_read_file'));
  assert.ok(instructions.includes('mave_write_file'));
  assert.ok(instructions.includes('mave_run_terminal_command'));
});

test('ChatGPTNervousSystemBridge: Detailed spatial perception and element search', async () => {
  const controller = createMockController();
  const bridge = new ChatGPTNervousSystemBridge({ controller, port: 4040 });

  // 1. Detailed Screen Perception
  const detailed = await bridge.captureScreenDetailed();
  assert.equal(detailed.ok, true);
  assert.equal(detailed.activeWindow, 'Visual Studio Code - Mave Project');
  assert.equal(detailed.screenDimensions.width, 2560);
  assert.equal(detailed.screenDimensions.height, 1440);
  assert.equal(detailed.cursorPosition.x, 100);
  assert.equal(detailed.cursorPosition.y, 200);
  assert.equal(detailed.elementCount, 3);
  assert.equal(detailed.elements[0].name, 'Save File');
  assert.equal(detailed.elements[0].center.x, 160);
  assert.ok(detailed.summary.includes('Visual Studio Code'));
  assert.ok(detailed.imageUrl.startsWith('data:image/jpeg;base64,'));

  // 2. Element search by text
  const searchRes = await bridge.findScreenElements({ query: 'search' });
  assert.equal(searchRes.ok, true);
  assert.equal(searchRes.count, 1);
  assert.equal(searchRes.matches[0].name, 'Search Code');
  assert.equal(searchRes.matches[0].center.x, 400);
});

test('ChatGPTNervousSystemBridge: Granular low-level motor controls (click, move, scroll, type, key)', async () => {
  const controller = createMockController();
  const bridge = new ChatGPTNervousSystemBridge({ controller, port: 4040 });

  // 1. Granular Mouse Move
  const moveRes = await bridge.mouseMove({ x: 450, y: 320 });
  assert.equal(moveRes.ok, true);
  assert.equal(moveRes.action, 'mouse_move');
  assert.equal(moveRes.x, 450);
  assert.equal(moveRes.y, 320);
  assert.equal(moveRes.cursorPosition.x, 450);
  assert.equal(moveRes.cursorPosition.y, 320);

  // 2. Granular Mouse Click (single click with coords)
  const clickRes = await bridge.mouseClick({ x: 500, y: 600, button: 'left' });
  assert.equal(clickRes.ok, true);
  assert.equal(clickRes.action, 'mouse_click');
  assert.equal(clickRes.button, 'left');
  assert.ok(controller.actions.some(a => a.type === 'move' && a.x === 500 && a.y === 600));
  assert.ok(controller.actions.some(a => a.type === 'click' && a.button === 'left'));

  // 3. Granular Double Click
  await bridge.mouseClick({ x: 520, y: 610, clickCount: 2 });
  assert.ok(controller.actions.some(a => a.type === 'double_click'));

  // 4. Granular Drag-and-drop
  await bridge.mouseClick({ x: 200, y: 200, dragTo: { x: 700, y: 800 } });
  assert.ok(controller.actions.some(a => a.type === 'mouse_down'));
  assert.ok(controller.actions.some(a => a.type === 'move' && a.x === 700 && a.y === 800));
  assert.ok(controller.actions.some(a => a.type === 'mouse_up'));

  // 5. Granular Mouse Scroll
  const scrollRes = await bridge.mouseScroll({ direction: 'down', amount: 5, x: 300, y: 400 });
  assert.equal(scrollRes.ok, true);
  assert.equal(scrollRes.action, 'mouse_scroll');
  assert.equal(scrollRes.deltaY, -5);
  assert.ok(controller.actions.some(a => a.type === 'scroll' && a.dy === -5));

  // 6. Granular Keyboard Type (with pre-focus coords and pressEnterAfter)
  const typeRes = await bridge.keyboardType({ text: 'git status', pressEnterAfter: true, x: 350, y: 250 });
  assert.equal(typeRes.ok, true);
  assert.equal(typeRes.action, 'keyboard_type');
  assert.equal(typeRes.charactersTyped, 10);
  assert.equal(typeRes.pressedEnter, true);
  assert.ok(controller.actions.some(a => a.type === 'type' && a.text === 'git status'));
  assert.ok(controller.actions.some(a => a.type === 'key' && a.k === 'return'));

  // 7. Granular Keyboard Key / Hotkey
  const keyRes = await bridge.keyboardPressKey({ combo: 'ctrl+s' });
  assert.equal(keyRes.ok, true);
  assert.equal(keyRes.action, 'keyboard_press_key');
  assert.ok(controller.actions.some(a => a.type === 'keys' && a.combo === 'ctrl+s'));

  const hotkeyRes = await bridge.keyboardPressKey({ keys: ['Control', 'Shift', 'P'] });
  assert.equal(hotkeyRes.ok, true);
  assert.ok(controller.actions.some(a => a.type === 'hotkey'));
});

test('ChatGPTNervousSystemBridge: Low-level file system operations (read, write, list)', async () => {
  const bridge = new ChatGPTNervousSystemBridge();
  const tmpDir = path.join(os.tmpdir(), `mave-chatgpt-fs-test-${Date.now()}`);
  const testFile = path.join(tmpDir, 'sample_code.js');

  try {
    // 1. Write file
    const initialContent = 'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n';
    const writeRes = await bridge.writeFileContent({
      filePath: testFile,
      content: initialContent
    });
    assert.equal(writeRes.ok, true);
    assert.equal(writeRes.bytesWritten, Buffer.byteLength(initialContent, 'utf8'));
    assert.ok(fs.existsSync(testFile));

    // 2. Append to file
    const appendRes = await bridge.writeFileContent({
      filePath: testFile,
      content: '// Appended line\n',
      append: true
    });
    assert.equal(appendRes.ok, true);
    assert.equal(appendRes.append, true);

    // 3. Read file (all lines)
    const readAll = await bridge.readFileContent({ filePath: testFile });
    assert.equal(readAll.ok, true);
    assert.equal(readAll.totalLines, 5);
    assert.ok(readAll.content.includes('console.log(a + b);'));
    assert.ok(readAll.content.includes('Appended line'));

    // 4. Read file (sliced line range: lines 2 to 3)
    const readSlice = await bridge.readFileContent({ filePath: testFile, startLine: 2, endLine: 3 });
    assert.equal(readSlice.ok, true);
    assert.equal(readSlice.startLine, 2);
    assert.equal(readSlice.endLine, 3);
    assert.equal(readSlice.content, 'const b = 2;\nconsole.log(a + b);');

    // 5. List files in directory
    const listRes = await bridge.listFiles({ dirPath: tmpDir });
    assert.equal(listRes.ok, true);
    assert.equal(listRes.count, 1);
    assert.equal(listRes.items[0].name, 'sample_code.js');
    assert.equal(listRes.items[0].isFile, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
  assert.ok(setupRes.includes('mave_see_screen_detailed'));
  assert.ok(setupRes.includes('mave_mouse_click'));
  assert.ok(setupRes.includes('mave_keyboard_type'));

  // 2. Test chatgpt_brain_status
  const statusTool = chatgptPlugin.find(t => t.name === 'chatgpt_brain_status');
  const statusRes = await statusTool.run({}, mockCtx);

  assert.ok(statusRes.includes('MAVE NERVOUS SYSTEM BRIDGE STATUS'));
  assert.ok(statusRes.includes('Connected & Ready'));
});

test('MobileWebServer: Serves low-level motor, screen, and file endpoints over HTTP', async () => {
  const controller = createMockController();
  const testPort = 4921;
  const webServer = new MobileWebServer({ controller, port: testPort });

  await webServer.start();

  const tmpDir = path.join(os.tmpdir(), `mave-chatgpt-http-fs-${Date.now()}`);
  const httpTestFile = path.join(tmpDir, 'http_file.txt');

  try {
    // 1. POST /api/chatgpt/eyes/screen-detailed
    const detailedData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/eyes/screen-detailed`, 'POST', {});
    assert.equal(detailedData.statusCode, 200);
    const detailedRes = JSON.parse(detailedData.body);
    assert.equal(detailedRes.ok, true);
    assert.equal(detailedRes.activeWindow, 'Visual Studio Code - Mave Project');
    assert.equal(detailedRes.cursorPosition.x, 100);
    assert.equal(detailedRes.elementCount, 3);

    // 2. POST /api/chatgpt/eyes/elements
    const elementsData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/eyes/elements`, 'POST', { query: 'Save' });
    assert.equal(elementsData.statusCode, 200);
    const elementsRes = JSON.parse(elementsData.body);
    assert.equal(elementsRes.ok, true);
    assert.equal(elementsRes.count, 1);
    assert.equal(elementsRes.matches[0].name, 'Save File');

    // 3. POST /api/chatgpt/motor/mouse/click
    const clickData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/motor/mouse/click`, 'POST', {
      x: 160,
      y: 65,
      button: 'left'
    });
    assert.equal(clickData.statusCode, 200);
    const clickRes = JSON.parse(clickData.body);
    assert.equal(clickRes.ok, true);
    assert.equal(clickRes.action, 'mouse_click');

    // 4. POST /api/chatgpt/motor/mouse/move
    const moveData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/motor/mouse/move`, 'POST', {
      x: 800,
      y: 400
    });
    assert.equal(moveData.statusCode, 200);
    const moveRes = JSON.parse(moveData.body);
    assert.equal(moveRes.ok, true);
    assert.equal(moveRes.action, 'mouse_move');

    // 5. POST /api/chatgpt/motor/keyboard/type
    const typeData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/motor/keyboard/type`, 'POST', {
      text: 'hello from chatgpt',
      pressEnterAfter: true
    });
    assert.equal(typeData.statusCode, 200);
    const typeRes = JSON.parse(typeData.body);
    assert.equal(typeRes.ok, true);
    assert.equal(typeRes.pressedEnter, true);

    // 6. POST /api/chatgpt/motor/keyboard/key
    const keyData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/motor/keyboard/key`, 'POST', {
      combo: 'ctrl+c'
    });
    assert.equal(keyData.statusCode, 200);
    const keyRes = JSON.parse(keyData.body);
    assert.equal(keyRes.ok, true);

    // 7. POST /api/chatgpt/fs/write
    const writeData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/fs/write`, 'POST', {
      filePath: httpTestFile,
      content: 'Line 1: Hello\nLine 2: World\n'
    });
    assert.equal(writeData.statusCode, 200);
    const writeRes = JSON.parse(writeData.body);
    assert.equal(writeRes.ok, true);

    // 8. POST /api/chatgpt/fs/read
    const readData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/fs/read`, 'POST', {
      filePath: httpTestFile,
      startLine: 1,
      endLine: 2
    });
    assert.equal(readData.statusCode, 200);
    const readRes = JSON.parse(readData.body);
    assert.equal(readRes.ok, true);
    assert.equal(readRes.content, 'Line 1: Hello\nLine 2: World');

    // 9. POST /api/chatgpt/fs/list
    const listData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/fs/list`, 'POST', {
      dirPath: tmpDir
    });
    assert.equal(listData.statusCode, 200);
    const listRes = JSON.parse(listData.body);
    assert.equal(listRes.ok, true);
    assert.equal(listRes.count, 1);

    // 10. POST /api/chatgpt/hands/terminal
    const termData = await makeRequest(`http://127.0.0.1:${testPort}/api/chatgpt/hands/terminal`, 'POST', {
      command: 'Write-Output "HTTP_NERVOUS_OK"'
    });
    assert.equal(termData.statusCode, 200);
    const term = JSON.parse(termData.body);
    assert.equal(term.ok, true);
    assert.ok(term.stdout.includes('HTTP_NERVOUS_OK'));

  } finally {
    webServer.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
