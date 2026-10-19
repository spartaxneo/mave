'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { PromptCacheManager } = require('../src/main/local/prompt_cache');
const { BackburnerMeshEngine, PAGE_SIZE_TOKENS } = require('../src/main/local/backburner_mesh');
const { MeshDiscoveryManager } = require('../src/main/remote/mesh_discovery');
const { MobileWebServer } = require('../src/main/remote/web');

test('PromptCacheManager: SSD hashing, slot storage, hits, misses, and pruning', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-pcache-test-'));
  const cacheMgr = new PromptCacheManager({ storageDir: tempDir, maxGb: 0.001 });

  const preamble = 'You are Mave, sovereign AI assistant. Tools: [calc, screen, terminal, browser].';
  const hash = cacheMgr.computeHash(preamble);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 32);

  // 1. Initial miss
  assert.equal(cacheMgr.has(hash), false);
  assert.equal(cacheMgr.get(hash), null);
  assert.equal(cacheMgr.getStats().misses, 1);

  // 2. Put slot
  const putOk = cacheMgr.put(hash, {
    preamble,
    tokenCount: 450,
    modelId: 'qwen2.5-coder-7b',
  });
  assert.equal(putOk, true);
  assert.equal(cacheMgr.has(hash), true);

  // 3. Cache hit
  const entry = cacheMgr.get(hash);
  assert.ok(entry);
  assert.equal(entry.tokenCount, 450);
  assert.equal(entry.cached, true);
  assert.ok(entry.savedSeconds >= 1);

  const stats = cacheMgr.getStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.activeSlots, 1);

  // 4. Clear
  cacheMgr.clear();
  assert.equal(cacheMgr.has(hash), false);
  assert.equal(cacheMgr.getStats().activeSlots, 0);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('BackburnerMeshEngine: Co-processor registration, context expansion, and KV paging', () => {
  const mesh = new BackburnerMeshEngine({ baseHostContext: 32768 });

  // Initial context
  const initialCtx = mesh.getEffectiveContextWindow();
  assert.equal(initialCtx.hostTokens, 32768);
  assert.equal(initialCtx.offloadCapacityTokens, 0);
  assert.equal(initialCtx.totalTokens, 32768);

  // 1. Register iPhone 17 Pro co-processor (8GB RAM, 4GB allocatable)
  const phone = mesh.registerCoProcessor({
    deviceId: 'dev-iphone17',
    name: 'iPhone 17 Pro Max',
    os: 'ios',
    ramBytes: 8 * 1024 * 1024 * 1024,
    freeMemoryBytes: 4 * 1024 * 1024 * 1024,
    connectionType: 'wireless',
    computeTier: 'gpu_npu',
  });
  assert.equal(phone.deviceId, 'dev-iphone17');
  assert.ok(phone.maxKvTokens > 10000);

  // Context window expands dynamically
  const expandedCtx = mesh.getEffectiveContextWindow();
  assert.ok(expandedCtx.totalTokens > 32768);
  assert.equal(expandedCtx.activeCoProcessors, 1);

  // 2. Offload a KV cache page
  const pageRes = mesh.offloadKvPage({
    layerIndex: 4,
    startToken: 32768,
    endToken: 32768 + PAGE_SIZE_TOKENS,
    kData: Buffer.from('mock_k_data'),
    vData: Buffer.from('mock_v_data'),
  });
  assert.ok(pageRes.ok);
  assert.ok(pageRes.page.pageId.startsWith('pg-'));
  assert.equal(pageRes.device.id, 'dev-iphone17');

  // 3. Pairing tokens
  const tokenRecord = mesh.generatePairingToken('dev-iphone17');
  assert.ok(tokenRecord.token.startsWith('mv-psk-dev-iphone17-'));
  assert.equal(mesh.verifyPairingToken('dev-iphone17', tokenRecord.token), true);
  assert.equal(mesh.verifyPairingToken('dev-iphone17', 'invalid-token'), false);

  // 4. Split Prefill Planning
  const plan = mesh.planLayerSplit(64);
  assert.equal(plan.splitEnabled, true);
  assert.equal(plan.totalLayers, 64);
  assert.ok(plan.hostLayers >= 40);
  assert.ok(plan.tailLayers > 0);

  // 5. Disconnect co-processor
  const dcOk = mesh.disconnectCoProcessor('dev-iphone17');
  assert.equal(dcOk, true);
  assert.equal(mesh.getEffectiveContextWindow().activeCoProcessors, 0);
  assert.equal(mesh.pagedContext.size, 0);
});

test('BackburnerMeshEngine: Exact Log-Sum-Exp FlashAttention Merger', () => {
  const mesh = new BackburnerMeshEngine();

  // Test 1: Scalar attention outputs
  // Host has scores m=2.0, l=1.0, O=10.0
  // Satellite has scores m=3.0, l=1.0, O=20.0
  const hostScalar = { O: 10.0, m: 2.0, l: 1.0 };
  const satScalar = { O: 20.0, m: 3.0, l: 1.0 };

  const mergedScalar = mesh.mergeAttention(hostScalar, satScalar);
  assert.equal(mergedScalar.m, 3.0);
  assert.ok(mergedScalar.l > 1.0);
  // Satellite had higher max score (m=3 vs m=2), so merged output should be closer to satellite's O=20
  assert.ok(mergedScalar.O > 15.0 && mergedScalar.O < 20.0);

  // Test 2: Vector attention outputs across heads
  const hostVec = { O: [1.0, 2.0, 3.0], m: 1.5, l: 2.0 };
  const satVec = { O: [4.0, 5.0, 6.0], m: 1.5, l: 2.0 };

  // With identical m and l, merger should be the exact arithmetic mean
  const mergedVec = mesh.mergeAttention(hostVec, satVec);
  assert.equal(mergedVec.m, 1.5);
  assert.equal(mergedVec.l, 4.0);
  assert.deepEqual(mergedVec.O, [2.5, 3.5, 4.5]);
});

test('MeshDiscoveryManager: starts, broadcasts, and handles auto-join', async () => {
  const discovery = new MeshDiscoveryManager({ port: 4499 });

  const started = await discovery.start({
    hostId: 'test-host-pc',
    hostname: 'Studio-Rig',
    port: 4040,
  });
  assert.equal(started, true);
  assert.equal(discovery.getStatus().running, true);

  // HTTP Auto-join fallback
  const autoJoinRes = discovery.handleHttpAutoJoin(
    {
      deviceId: 'dev-pixel-9',
      name: 'Google Pixel 9 Pro',
      os: 'android',
      ramBytes: 12 * 1024 * 1024 * 1024,
      freeMemoryBytes: 6 * 1024 * 1024 * 1024,
    },
    '192.168.1.120'
  );
  assert.equal(autoJoinRes.ok, true);
  assert.equal(autoJoinRes.device.name, 'Google Pixel 9 Pro');
  assert.ok(autoJoinRes.meshStatus.context.totalTokens > 32768);

  await discovery.stop();
  assert.equal(discovery.getStatus().running, false);
});

test('MobileWebServer: handles wireless mesh endpoints and SSD prompt cache APIs', async () => {
  const testPort = 4477;
  const web = new MobileWebServer({ port: testPort });

  await web.start();

  function makeReq(options, postData = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text: data, json });
        });
      });
      req.on('error', reject);
      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    });
  }

  try {
    // 1. GET /api/mesh/status
    const stRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/mesh/status',
      method: 'GET',
    });
    assert.equal(stRes.status, 200);
    assert.equal(stRes.json.ok, true);
    assert.ok(stRes.json.mesh.context);

    // 2. POST /api/mesh/auto-join
    const joinRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/mesh/auto-join',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        deviceId: 'dev-wifi-laptop',
        name: 'ThinkPad Satellite Worker',
        os: 'windows',
        ramBytes: 16 * 1024 * 1024 * 1024,
        freeMemoryBytes: 8 * 1024 * 1024 * 1024,
      }
    );
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.json.ok, true);
    assert.equal(joinRes.json.device.name, 'ThinkPad Satellite Worker');

    // 3. POST /api/mesh/offload/page
    const pageRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/mesh/offload/page',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        layerIndex: 8,
        startToken: 0,
        endToken: 4096,
      }
    );
    assert.equal(pageRes.status, 200);
    assert.equal(pageRes.json.ok, true);

    // 4. POST /api/mesh/attn/merge
    const mergeRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/mesh/attn/merge',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        hostAttn: { O: [1, 2], m: 1, l: 1 },
        satAttn: { O: [3, 4], m: 1, l: 1 },
      }
    );
    assert.equal(mergeRes.status, 200);
    assert.deepEqual(mergeRes.json.merged.O, [2, 3]);

    // 5. GET /api/prompt-cache/stats
    const pcStatsRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/prompt-cache/stats',
      method: 'GET',
    });
    assert.equal(pcStatsRes.status, 200);
    assert.equal(pcStatsRes.json.ok, true);
    assert.ok(pcStatsRes.json.stats.storageDir);

    // 6. POST /v1/chat/completions (with prompt caching verification)
    const chatRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        model: 'mave-core',
        messages: [
          { role: 'system', content: 'You are Mave AI Host.' },
          { role: 'user', content: 'Hello Mave!' },
        ],
      }
    );
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.json.object, 'chat.completion');

    // 7. POST /api/mesh/disconnect
    const dcRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/mesh/disconnect',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { deviceId: 'dev-wifi-laptop' }
    );
    assert.equal(dcRes.status, 200);
    assert.equal(dcRes.json.ok, true);
  } finally {
    await web.stop();
  }
});
