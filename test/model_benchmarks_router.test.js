'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { execFile } = require('node:child_process');
const path = require('node:path');

const {
  classifyComplexity,
  getModelTiers,
  selectModelForTask,
  getUsableNativeMemory,
  getSystemMemoryTelemetry,
  checkModelHealth,
  routeWithFallback,
  selectModelWithFallback,
} = require('../src/main/local/router');

const benchmarkHarness = require('../scripts/benchmark_models');

/**
 * Helper to spin up a lightweight test HTTP server.
 */
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

// =========================================================================
// 1. MODEL HEALTH CHECKING (checkModelHealth)
// =========================================================================

test('checkModelHealth returns healthy when endpoint responds with 200 OK', async () => {
  let authHeader = null;
  const mock = await createMockServer((req, res) => {
    authHeader = req.headers.authorization;
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', model: 'qwen3-vl-8b' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  try {
    const result = await checkModelHealth({ baseUrl: mock.baseUrl, apiKey: 'test-token-123' }, 2000);
    assert.equal(result.healthy, true);
    assert.equal(result.status, 200);
    assert.equal(result.model, 'qwen3-vl-8b');
    assert.ok(result.latencyMs >= 0);
    assert.equal(authHeader, 'Bearer test-token-123');
  } finally {
    await mock.close();
  }
});

test('checkModelHealth handles endpoint returning 503 (loading) with healthy: false', async () => {
  const mock = await createMockServer((req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'loading model', progress: 0.45 }));
  });

  try {
    const result = await checkModelHealth(mock.baseUrl, 2000);
    assert.equal(result.healthy, false);
    assert.equal(result.status, 503);
    assert.ok(result.data);
    assert.equal(result.data.status, 'loading model');
  } finally {
    await mock.close();
  }
});

test('checkModelHealth handles timeout cleanly without throwing or hanging', async () => {
  const mock = await createMockServer((req, res) => {
    // Deliberately delay response past timeout
    setTimeout(() => {
      try { res.writeHead(200); res.end(); } catch {}
    }, 500);
  });

  try {
    const result = await checkModelHealth(mock.baseUrl, 80);
    assert.equal(result.healthy, false);
    assert.equal(result.status, 'timeout');
    assert.ok(result.error.includes('timed out'));
  } finally {
    await mock.close();
  }
});

test('checkModelHealth handles unreachable endpoint cleanly without throwing', async () => {
  // Port 59199 is unused on localhost
  const result = await checkModelHealth('http://127.0.0.1:59199', 500);
  assert.equal(result.healthy, false);
  assert.equal(result.status, 'unreachable');
  assert.ok(result.error);
});

test('checkModelHealth handles null, empty, or invalid endpoints safely', async () => {
  const r1 = await checkModelHealth(null);
  assert.equal(r1.healthy, false);
  assert.equal(r1.status, 'no_endpoint');

  const r2 = await checkModelHealth('');
  assert.equal(r2.healthy, false);
  assert.equal(r2.status, 'no_endpoint');

  const r3 = await checkModelHealth({});
  assert.equal(r3.healthy, false);
  assert.equal(r3.status, 'invalid_endpoint');
});

// =========================================================================
// 2. SYSTEM MEMORY TELEMETRY & HARDWARE INTEGRATION
// =========================================================================

test('getSystemMemoryTelemetry returns host memory metrics and pressure tier', () => {
  const telemetry = getSystemMemoryTelemetry();
  assert.ok(telemetry.totalRamGB > 0);
  assert.ok(telemetry.freeRamGB >= 0);
  assert.ok(['normal', 'moderate', 'high', 'critical'].includes(telemetry.memoryPressure));
  assert.ok(typeof telemetry.dedicatedGpu === 'boolean');
});

test('getSystemMemoryTelemetry accurately classifies memory pressure levels', () => {
  const crit = getSystemMemoryTelemetry({ ramGB: 16, freeRamGB: 1.2 });
  assert.equal(crit.memoryPressure, 'critical');

  const high = getSystemMemoryTelemetry({ ramGB: 16, freeRamGB: 2.5 });
  assert.equal(high.memoryPressure, 'high');

  const mod = getSystemMemoryTelemetry({ ramGB: 16, freeRamGB: 4.8 });
  assert.equal(mod.memoryPressure, 'moderate');

  const norm = getSystemMemoryTelemetry({ ramGB: 16, freeRamGB: 12.0 });
  assert.equal(norm.memoryPressure, 'normal');
});

test('getUsableNativeMemory respects dynamic free memory when requested', () => {
  const hw = { dedicated: false, vramGB: 0, ramGB: 32, freeRamGB: 4.0, useFreeMemory: true };
  const usable = getUsableNativeMemory(hw);
  // usableRam = Math.max(0, 4.0 - 3.5) * 0.85 = 0.5 * 0.85 = 0.425 -> 0.4
  assert.ok(usable < 2.0);
});

test('classifyComplexity ingests telemetry and adapts under critical memory pressure', () => {
  const lowMemHw = {
    dedicated: false,
    vramGB: 0,
    ramGB: 8,
    freeRamGB: 1.0,
    enforceMemoryConstraints: true,
  };

  const decision = classifyComplexity('Architect a distributed microservice system with database schema design', lowMemHw);
  assert.ok(decision.telemetry);
  assert.equal(decision.telemetry.memoryPressure, 'critical');
  // Downgraded to prevent swapping / OOM on host without dedicated GPU
  assert.equal(decision.tier3, 'vision');
  assert.equal(decision.suggestedModel, 'qwen3-vl-4b');
  assert.ok(decision.reasons.some((r) => r.includes('dynamic memory telemetry')));
});

test('selectModelForTask ingests dynamic telemetry and preserves routing on capable systems', () => {
  const highMemHw = { dedicated: true, vramGB: 16, ramGB: 64, freeRamGB: 32.0 };
  const decision = selectModelForTask('Architect a distributed microservice system', 'qwen3-vl-8b', null, highMemHw);
  assert.ok(decision.telemetry);
  assert.equal(decision.tier3, 'brain');
  assert.equal(decision.hardwareAdaptive, true);
  assert.equal(decision.nativeFit, true);
});

test('selectModelForTask downgrades target when dynamic memory constraints are exceeded', () => {
  const lowMemHw = { dedicated: false, vramGB: 0, ramGB: 16, freeRamGB: 2.2, enforceMemoryConstraints: true };
  const decision = selectModelForTask(
    'Write a Python quicksort algorithm and unit test it',
    'qwen3-vl-4b',
    null,
    lowMemHw,
    { dynamicMemory: true }
  );

  assert.equal(decision.dynamicDowngraded, true);
  assert.equal(decision.tier, 'light');
  assert.ok(decision.targetId.includes('4b'));
  assert.ok(decision.reasons.some((r) => r.includes('dynamic telemetry')));
});

// =========================================================================
// 3. RESILIENT FALLBACK ROUTING (routeWithFallback & selectModelWithFallback)
// =========================================================================

test('routeWithFallback selects primary endpoint when primary is healthy', async () => {
  const primaryMock = await createMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: 'primary-model' }));
  });

  try {
    const result = await routeWithFallback({
      primaryEndpoint: primaryMock.baseUrl,
      secondaryEndpoint: 'http://127.0.0.1:59998',
      timeoutMs: 1500,
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.isFallback, false);
    assert.equal(result.modelTier, 'primary');
    assert.equal(result.activeEndpoint, primaryMock.baseUrl);
    assert.equal(result.health.healthy, true);
  } finally {
    await primaryMock.close();
  }
});

test('routeWithFallback gracefully degrades to secondary endpoint when primary is offline', async () => {
  const secondaryMock = await createMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', model: 'secondary-model' }));
  });

  try {
    const result = await routeWithFallback({
      primaryEndpoint: 'http://127.0.0.1:59997', // Unreachable primary
      secondaryEndpoint: secondaryMock.baseUrl,   // Healthy secondary
      timeoutMs: 800,
    });

    assert.equal(result.status, 'degraded');
    assert.equal(result.isFallback, true);
    assert.equal(result.modelTier, 'secondary');
    assert.equal(result.activeEndpoint, secondaryMock.baseUrl);
    assert.ok(result.fallbackReason.includes('degraded gracefully to secondary'));
    assert.equal(result.healthChecks.length, 2);
    assert.equal(result.healthChecks[0].healthy, false);
    assert.equal(result.healthChecks[1].healthy, true);
  } finally {
    await secondaryMock.close();
  }
});

test('routeWithFallback cleanly reports offline fallback without crashing when all endpoints are down', async () => {
  const result = await routeWithFallback({
    primaryEndpoint: 'http://127.0.0.1:59995',
    secondaryEndpoint: 'http://127.0.0.1:59996',
    timeoutMs: 400,
  });

  assert.equal(result.status, 'offline');
  assert.equal(result.isFallback, true);
  assert.equal(result.offline, true);
  assert.equal(result.activeEndpoint, null);
  assert.equal(result.modelTier, 'offline_fallback');
  assert.ok(result.message.includes('Degraded cleanly to offline fallback'));
});

test('routeWithFallback cleanly handles empty endpoint configurations', async () => {
  const result = await routeWithFallback({});
  assert.equal(result.status, 'offline');
  assert.equal(result.offline, true);
  assert.equal(result.activeEndpoint, null);
  assert.ok(result.message.includes('No local model endpoints configured'));
});

test('selectModelWithFallback coordinates task routing with endpoint health', async () => {
  const mock = await createMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  try {
    const result = await selectModelWithFallback({
      task: 'Click the submit button',
      primaryEndpoint: mock.baseUrl,
      timeoutMs: 1000,
    });

    assert.equal(result.tier, 'light');
    assert.equal(result.endpointStatus, 'ok');
    assert.equal(result.isFallback, false);
    assert.equal(result.activeEndpoint, mock.baseUrl);
  } finally {
    await mock.close();
  }
});

// =========================================================================
// 4. BENCHMARK HARNESS (scripts/benchmark_models.js)
// =========================================================================

test('benchmark harness parseArgs correctly extracts CLI flags and defaults', () => {
  const defaults = benchmarkHarness.parseArgs([]);
  assert.equal(defaults.model, benchmarkHarness.DEFAULT_MODEL);
  assert.equal(defaults.endpoint, benchmarkHarness.DEFAULT_ENDPOINT);
  assert.equal(defaults.mock, false);
  assert.equal(defaults.json, false);

  const custom = benchmarkHarness.parseArgs([
    '--model', 'qwen3-vl-4b',
    '--endpoint', 'http://localhost:9000',
    '--iterations', '5',
    '--context-sizes', '256,1024',
    '--mock',
    '--json',
  ]);

  assert.equal(custom.model, 'qwen3-vl-4b');
  assert.equal(custom.endpoint, 'http://localhost:9000');
  assert.equal(custom.iterations, 5);
  assert.deepEqual(custom.contextSizes, [256, 1024]);
  assert.equal(custom.mock, true);
  assert.equal(custom.json, true);
});

test('benchmark harness generatePromptForContext scales text length to context target', () => {
  const shortPrompt = benchmarkHarness.generatePromptForContext(128);
  const longPrompt = benchmarkHarness.generatePromptForContext(1024);

  assert.ok(shortPrompt.length >= 128 * 2);
  assert.ok(longPrompt.length > shortPrompt.length);
});

test('benchmark harness measureMemoryFootprint reports host and GPU memory', () => {
  const mem = benchmarkHarness.measureMemoryFootprint('qwen3-vl-8b');
  assert.ok(mem.hostTotalRamGB > 0);
  assert.ok(mem.hostFreeRamGB >= 0);
  assert.ok(mem.estimatedModelRamGB >= 7.0);
  assert.ok(typeof mem.processRssMB === 'number');
});

test('benchmark harness runBenchmark in mock mode computes TTFT, TPS, and scaling metrics', async () => {
  const result = await benchmarkHarness.runBenchmark({
    model: 'qwen3-vl-8b',
    iterations: 2,
    contextSizes: [128, 512, 1024],
    mock: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.mode, 'mock');
  assert.equal(result.model, 'qwen3-vl-8b');

  // TTFT verification
  assert.ok(result.summary.avgTtftMs > 0);
  assert.ok(result.summary.minTtftMs <= result.summary.maxTtftMs);

  // TPS verification
  assert.ok(result.summary.avgTps > 0);

  // Context scaling verification
  assert.equal(result.contextScaling.length, 3);
  assert.equal(result.contextScaling[0].contextTokens, 128);
  assert.equal(result.contextScaling[2].contextTokens, 1024);
  assert.ok(result.summary.contextScalingFactor >= 1.0);

  // Memory footprint verification
  assert.ok(result.memoryFootprint.hostTotalRamGB > 0);
  assert.ok(result.memoryFootprint.estimatedModelRamGB > 0);
});

test('benchmark harness formatAsciiReport generates complete formatted output', async () => {
  const result = await benchmarkHarness.runBenchmark({
    model: 'qwen3-vl-4b',
    iterations: 1,
    contextSizes: [128, 512],
    mock: true,
  });

  const report = benchmarkHarness.formatAsciiReport(result);
  assert.ok(report.includes('BENCHMARK REPORT: QWEN3-VL-4B'));
  assert.ok(report.includes('CORE PERFORMANCE SUMMARY'));
  assert.ok(report.includes('Average TTFT'));
  assert.ok(report.includes('Throughput (TPS)'));
  assert.ok(report.includes('CONTEXT SCALING PROGRESSION'));
  assert.ok(report.includes('HOST AND GPU MEMORY FOOTPRINT'));
});

test('benchmark harness executes successfully via CLI with --mock and --json', async () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'benchmark_models.js');

  await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath, '--mock', '--json', '--iterations', '1', '--context-sizes', '128,256'],
      { timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`CLI error: ${err.message}\nStderr: ${stderr}`));
        try {
          const parsed = JSON.parse(stdout);
          assert.equal(parsed.success, true);
          assert.equal(parsed.mode, 'mock');
          assert.ok(parsed.summary.avgTtftMs > 0);
          assert.ok(parsed.summary.avgTps > 0);
          assert.equal(parsed.contextScaling.length, 2);
          resolve();
        } catch (parseErr) {
          reject(new Error(`JSON parse error: ${parseErr.message}\nStdout was: ${stdout}`));
        }
      }
    );
  });
});
