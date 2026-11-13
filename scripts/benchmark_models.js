'use strict';
/**
 * Automated Model Benchmark Harness for Local AI Models.
 * Measures:
 * 1. Time-to-First-Token (TTFT) latency
 * 2. Tokens per second (TPS) throughput
 * 3. Context scaling across variable prompt lengths
 * 4. Host RAM and GPU VRAM memory footprint
 *
 * Supports live endpoints and offline mock mode (--mock) for CI/reproducibility.
 */

const os = require('os');
const { performance } = require('perf_hooks');
const router = require('../src/main/local/router');
const hardware = require('../src/main/local/hardware');

const DEFAULT_CONTEXT_SIZES = [128, 512, 1024, 2048];
const DEFAULT_MODEL = 'qwen3-vl-8b';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8080';
const DEFAULT_ITERATIONS = 3;
const DEFAULT_MAX_TOKENS = 64;

/**
 * Parse command-line arguments into configuration object.
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    model: DEFAULT_MODEL,
    endpoint: DEFAULT_ENDPOINT,
    iterations: DEFAULT_ITERATIONS,
    contextSizes: DEFAULT_CONTEXT_SIZES,
    maxTokens: DEFAULT_MAX_TOKENS,
    mock: false,
    json: false,
    timeoutMs: 30000,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--mock') {
      args.mock = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--model' && argv[i + 1]) {
      args.model = argv[++i];
    } else if (arg.startsWith('--model=')) {
      args.model = arg.slice(8);
    } else if (arg === '--endpoint' && argv[i + 1]) {
      args.endpoint = argv[++i];
    } else if (arg.startsWith('--endpoint=')) {
      args.endpoint = arg.slice(11);
    } else if (arg === '--iterations' && argv[i + 1]) {
      args.iterations = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_ITERATIONS);
    } else if (arg.startsWith('--iterations=')) {
      args.iterations = Math.max(1, parseInt(arg.slice(13), 10) || DEFAULT_ITERATIONS);
    } else if (arg === '--context-sizes' && argv[i + 1]) {
      args.contextSizes = argv[++i].split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean);
    } else if (arg.startsWith('--context-sizes=')) {
      args.contextSizes = arg.slice(16).split(',').map((n) => parseInt(n.trim(), 10)).filter(Boolean);
    } else if (arg === '--max-tokens' && argv[i + 1]) {
      args.maxTokens = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_MAX_TOKENS);
    } else if (arg.startsWith('--max-tokens=')) {
      args.maxTokens = Math.max(1, parseInt(arg.slice(13), 10) || DEFAULT_MAX_TOKENS);
    } else if (arg === '--timeout' && argv[i + 1]) {
      args.timeoutMs = Math.max(1000, parseInt(argv[++i], 10) || 30000);
    }
  }

  return args;
}

/**
 * Generate synthetic context-calibrated prompt text of approx target tokens (~4 chars/token).
 */
function generatePromptForContext(targetTokens) {
  const seedWords = [
    'system', 'architecture', 'distributed', 'service', 'consensus',
    'throughput', 'latency', 'pipeline', 'optimization', 'invariant',
    'memory', 'allocation', 'buffer', 'network', 'stream',
    'execution', 'compiler', 'telemetry', 'vector', 'matrix'
  ];
  const charCount = Math.max(32, targetTokens * 4);
  let prompt = 'Benchmark synthetic context: ';
  let wordIdx = 0;
  while (prompt.length < charCount) {
    prompt += seedWords[wordIdx % seedWords.length] + ' ';
    wordIdx++;
  }
  return prompt.trim();
}

/**
 * Measure memory footprint of the host system and the model.
 */
function measureMemoryFootprint(modelId, hw = null) {
  const targetHw = hw || (typeof hardware.getCachedHardware === 'function' ? hardware.getCachedHardware() : null) || {};
  const totalRamBytes = os.totalmem ? os.totalmem() : 16 * (1024 ** 3);
  const freeRamBytes = os.freemem ? os.freemem() : 8 * (1024 ** 3);

  const hostTotalRamGB = Math.round((totalRamBytes / (1024 ** 3)) * 10) / 10;
  const hostFreeRamGB = Math.round((freeRamBytes / (1024 ** 3)) * 10) / 10;
  const hostUsedRamGB = Math.round((hostTotalRamGB - hostFreeRamGB) * 10) / 10;

  const memUsage = process.memoryUsage ? process.memoryUsage() : { rss: 0, heapUsed: 0 };
  const processRssMB = Math.round((memUsage.rss / (1024 ** 2)) * 10) / 10;
  const processHeapUsedMB = Math.round((memUsage.heapUsed / (1024 ** 2)) * 10) / 10;

  const estimatedModelRamGB = router.estimateMemoryGB(modelId);
  const vramTotalGB = targetHw.dedicated ? Number(targetHw.vramGB) || 0 : (Number(targetHw.vramGB) || 0);
  const dedicatedGpu = Boolean(targetHw.dedicated || vramTotalGB >= 2);

  // If dedicated GPU is present and model fits natively, VRAM is primary footprint
  const estimatedModelVramGB = dedicatedGpu ? Math.min(vramTotalGB, estimatedModelRamGB) : 0;

  return {
    hostTotalRamGB,
    hostFreeRamGB,
    hostUsedRamGB,
    processRssMB,
    processHeapUsedMB,
    vramTotalGB,
    dedicatedGpu,
    estimatedModelRamGB,
    estimatedModelVramGB,
  };
}

/**
 * Mock generator for offline/reproducible test benchmarking.
 */
async function mockMeasureGeneration({ model, contextTokens, maxTokens }) {
  const modelMem = router.estimateMemoryGB(model);
  // Realistic TTFT calculation: scales with model parameter size and context length
  const baseTtft = Math.max(20, modelMem * 5 + contextTokens * 0.035);
  // Add deterministic slight variation
  const ttftMs = Math.round((baseTtft + ((contextTokens % 7) * 1.5)) * 10) / 10;

  // Realistic TPS calculation: smaller models generate faster; TPS gently degrades with context
  const baseTps = Math.max(12, 48 - (modelMem * 0.9) - (contextTokens * 0.004));
  const tps = Math.round((baseTps + ((contextTokens % 5) * 0.4)) * 10) / 10;

  const generatedTokens = Math.min(maxTokens, 48);
  const totalGenDurationMs = Math.round(((generatedTokens / tps) * 1000 + ttftMs) * 10) / 10;

  // Small asynchronous pause to simulate event loop tick
  await new Promise((resolve) => setTimeout(resolve, 5));

  return {
    ttftMs,
    tps,
    generatedTokens,
    totalGenDurationMs,
    contextTokens,
  };
}

/**
 * Live streaming measurement against real llama-server endpoint.
 */
async function liveMeasureGeneration({ endpoint, model, contextTokens, maxTokens, timeoutMs }) {
  const prompt = generatePromptForContext(contextTokens);
  const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;

  const body = JSON.stringify({
    model: model || 'default',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    stream: true,
  });

  const t0 = performance.now();
  let tFirst = null;
  let tokenCount = 0;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Endpoint returned HTTP ${res.status}: ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;

  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      const text = decoder.decode(chunk.value, { stream: !done });
      if (!tFirst && text.includes('"content":')) {
        tFirst = performance.now();
      }
      // Count SSE data events containing tokens
      const matches = text.match(/"content":"(.*?)"/g);
      if (matches) {
        tokenCount += matches.length;
      }
    }
  }

  const tEnd = performance.now();
  const ttftMs = tFirst ? Math.round((tFirst - t0) * 10) / 10 : Math.round((tEnd - t0) * 10) / 10;
  const genDurationSec = tFirst ? (tEnd - tFirst) / 1000 : (tEnd - t0) / 1000;
  const tps = genDurationSec > 0 ? Math.round((tokenCount / genDurationSec) * 10) / 10 : 0;
  const totalGenDurationMs = Math.round((tEnd - t0) * 10) / 10;

  return {
    ttftMs,
    tps,
    generatedTokens: tokenCount,
    totalGenDurationMs,
    contextTokens,
  };
}

/**
 * Execute comprehensive benchmark suite across context sizes and iterations.
 */
async function runBenchmark(options = {}) {
  const config = { ...parseArgs([]), ...options };
  const { model, endpoint, iterations, contextSizes, maxTokens, mock, timeoutMs } = config;

  // Initial health check if not explicitly in mock mode
  let isOfflineMode = mock;
  let endpointHealth = null;

  if (!mock) {
    endpointHealth = await router.checkModelHealth(endpoint, 3000);
    if (!endpointHealth.healthy) {
      if (options.autoMockFallback) {
        isOfflineMode = true;
      } else {
        return {
          success: false,
          error: `Endpoint unreachable or unhealthy: ${endpointHealth.error || endpointHealth.status}`,
          endpoint,
          endpointHealth,
        };
      }
    }
  }

  const memoryBefore = measureMemoryFootprint(model);
  const contextScaling = [];
  const allTtftSamples = [];
  const allTpsSamples = [];

  for (const ctx of contextSizes) {
    const iterationResults = [];
    for (let i = 0; i < iterations; i++) {
      let runResult;
      if (isOfflineMode) {
        runResult = await mockMeasureGeneration({ model, contextTokens: ctx, maxTokens });
      } else {
        runResult = await liveMeasureGeneration({ endpoint, model, contextTokens: ctx, maxTokens, timeoutMs });
      }
      iterationResults.push(runResult);
      allTtftSamples.push(runResult.ttftMs);
      allTpsSamples.push(runResult.tps);
    }

    const avgTtftMs = Math.round((iterationResults.reduce((sum, r) => sum + r.ttftMs, 0) / iterationResults.length) * 10) / 10;
    const minTtftMs = Math.round(Math.min(...iterationResults.map((r) => r.ttftMs)) * 10) / 10;
    const maxTtftMs = Math.round(Math.max(...iterationResults.map((r) => r.ttftMs)) * 10) / 10;
    const avgTps = Math.round((iterationResults.reduce((sum, r) => sum + r.tps, 0) / iterationResults.length) * 10) / 10;

    contextScaling.push({
      contextTokens: ctx,
      avgTtftMs,
      minTtftMs,
      maxTtftMs,
      avgTps,
      samples: iterationResults.length,
    });
  }

  const memoryAfter = measureMemoryFootprint(model);

  // Compute summary and scaling metrics
  const minContext = contextScaling[0] || { avgTtftMs: 1, avgTps: 1 };
  const maxContext = contextScaling[contextScaling.length - 1] || { avgTtftMs: 1, avgTps: 1 };
  const contextScalingFactor = Math.round((maxContext.avgTtftMs / Math.max(1, minContext.avgTtftMs)) * 100) / 100;
  const tpsRetentionPct = Math.round((maxContext.avgTps / Math.max(0.1, minContext.avgTps)) * 100);

  const avgTtftMs = Math.round((allTtftSamples.reduce((s, v) => s + v, 0) / Math.max(1, allTtftSamples.length)) * 10) / 10;
  const avgTps = Math.round((allTpsSamples.reduce((s, v) => s + v, 0) / Math.max(1, allTpsSamples.length)) * 10) / 10;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    model,
    endpoint,
    mode: isOfflineMode ? 'mock' : 'live',
    iterations,
    summary: {
      avgTtftMs,
      minTtftMs: Math.min(...allTtftSamples),
      maxTtftMs: Math.max(...allTtftSamples),
      avgTps,
      contextScalingFactor,
      tpsRetentionPct,
      ramFootprintGB: memoryAfter.estimatedModelRamGB,
      vramFootprintGB: memoryAfter.estimatedModelVramGB,
    },
    contextScaling,
    memoryFootprint: {
      hostTotalRamGB: memoryAfter.hostTotalRamGB,
      hostFreeRamGB: memoryAfter.hostFreeRamGB,
      hostUsedRamGB: memoryAfter.hostUsedRamGB,
      processRssMB: memoryAfter.processRssMB,
      vramTotalGB: memoryAfter.vramTotalGB,
      dedicatedGpu: memoryAfter.dedicatedGpu,
      estimatedModelRamGB: memoryAfter.estimatedModelRamGB,
      estimatedModelVramGB: memoryAfter.estimatedModelVramGB,
    },
    endpointHealth,
  };
}

/**
 * Format benchmark results into human-readable ASCII output.
 */
function formatAsciiReport(results) {
  if (!results.success) {
    return `\n[ERROR] Benchmark Failed: ${results.error}\n`;
  }

  const s = results.summary;
  const m = results.memoryFootprint;

  let out = '\n' + '='.repeat(64) + '\n';
  out += `  LOCAL AI MODEL BENCHMARK REPORT: ${results.model.toUpperCase()}\n`;
  out += `  Mode: ${results.mode.toUpperCase()} | Endpoint: ${results.endpoint}\n`;
  out += '='.repeat(64) + '\n\n';

  out += '1. CORE PERFORMANCE SUMMARY:\n';
  out += `   - Average TTFT (Time-to-First-Token) : ${s.avgTtftMs} ms\n`;
  out += `   - TTFT Range (Min / Max)              : ${s.minTtftMs} ms / ${s.maxTtftMs} ms\n`;
  out += `   - Average Generation Throughput (TPS) : ${s.avgTps} tok/s\n`;
  out += `   - Context Scaling Factor (Max/Min)    : ${s.contextScalingFactor}x\n`;
  out += `   - Throughput Retention across Context : ${s.tpsRetentionPct}%\n\n`;

  out += '2. CONTEXT SCALING PROGRESSION:\n';
  out += '   Context Tokens | Avg TTFT (ms) | Min/Max TTFT | Throughput (TPS)\n';
  out += '   ' + '-'.repeat(58) + '\n';
  for (const row of results.contextScaling) {
    const ctx = String(row.contextTokens).padEnd(14);
    const ttft = `${row.avgTtftMs} ms`.padEnd(15);
    const minMax = `${row.minTtftMs}/${row.maxTtftMs} ms`.padEnd(14);
    const tps = `${row.avgTps} tok/s`;
    out += `   ${ctx} | ${ttft} | ${minMax} | ${tps}\n`;
  }
  out += '\n';

  out += '3. HOST AND GPU MEMORY FOOTPRINT:\n';
  out += `   - Host Total RAM       : ${m.hostTotalRamGB} GB\n`;
  out += `   - Host Free RAM        : ${m.hostFreeRamGB} GB (Used: ${m.hostUsedRamGB} GB)\n`;
  out += `   - Process RSS Overhead : ${m.processRssMB} MB\n`;
  out += `   - GPU Dedicated VRAM   : ${m.dedicatedGpu ? `${m.vramTotalGB} GB` : 'None / Integrated'}\n`;
  out += `   - Model Estimated RAM  : ${m.estimatedModelRamGB} GB\n`;
  out += `   - Model Estimated VRAM : ${m.estimatedModelVramGB} GB\n`;
  out += '='.repeat(64) + '\n';

  return out;
}

// CLI entrypoint execution
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
Usage: node scripts/benchmark_models.js [options]

Options:
  --model <id>            Model identifier (default: qwen3-vl-8b)
  --endpoint <url>        Local llama-server URL (default: http://127.0.0.1:8080)
  --iterations <n>        Iterations per context tier (default: 3)
  --context-sizes <csv>   Comma-separated context lengths (default: 128,512,1024,2048)
  --max-tokens <n>        Max generated tokens per iteration (default: 64)
  --mock                  Mock test mode for offline / CI validation
  --json                  Output raw JSON to stdout
  --help, -h              Display this help message
`);
    process.exit(0);
  }

  runBenchmark(args)
    .then((result) => {
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatAsciiReport(result));
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Benchmark execution failed:', err);
      process.exit(1);
    });
}

module.exports = {
  parseArgs,
  generatePromptForContext,
  measureMemoryFootprint,
  mockMeasureGeneration,
  liveMeasureGeneration,
  runBenchmark,
  formatAsciiReport,
  DEFAULT_CONTEXT_SIZES,
  DEFAULT_MODEL,
  DEFAULT_ENDPOINT,
};
