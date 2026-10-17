'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { airllmService } = require('../src/main/local/airllm');
const catalog = require('../src/main/local/catalog');
const airllmPlugin = require('../src/main/plugins/builtin/airllm');
const { validate } = require('../src/main/plugins/registry');
const { PROVIDERS, ORDER } = require('../src/main/llm');

test('AirLLM service is configured and points to Python environment', () => {
  assert.ok(airllmService);
  assert.equal(typeof airllmService.getEndpoint(), 'string');
  assert.ok(airllmService.getEndpoint().includes('8001'));
  assert.ok(airllmService.isAvailable(), 'AirLLM script and python must exist');
});

test('Catalog scans and exposes AirLLM frontier models', () => {
  const models = catalog.scanAirLLMModels();
  assert.ok(Array.isArray(models));
  assert.ok(models.length >= 4);

  const ids = models.map((m) => m.id);
  assert.ok(ids.includes('airllm-Qwen-Qwen3-32B'));
  assert.ok(ids.includes('airllm-meta-llama-Meta-Llama-3-70B-Instruct'));
  assert.ok(ids.includes('airllm-Qwen-Qwen2.5-72B-Instruct'));
  assert.ok(ids.includes('airllm-deepseek-ai-DeepSeek-V3'));

  const rec = catalog.recommend({ ramGB: 16, vramGB: 8, dedicated: true });
  assert.ok(rec.airllmModels);
  assert.ok(rec.airllmModels.length >= 4);
});

test('AirLLM builtin plugin tools declare valid schemas', () => {
  assert.ok(Array.isArray(airllmPlugin));
  assert.equal(airllmPlugin.length, 2);

  for (const tool of airllmPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed schema validation: ${error}`);
  }

  const names = airllmPlugin.map((t) => t.name);
  assert.ok(names.includes('airllm_generate'));
  assert.ok(names.includes('airllm_status'));
});

test('AirLLM provider is registered in LLM providers and order', () => {
  assert.ok(PROVIDERS.airllm);
  assert.equal(PROVIDERS.airllm.label, 'AirLLM (70B)');
  assert.equal(PROVIDERS.airllm.modelSetting, 'airllmModel');
  assert.ok(ORDER.includes('airllm'));
});
