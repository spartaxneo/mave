'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyComplexity,
  getModelTiers,
  selectModelForTask,
  shouldEscalate,
  estimateMemoryGB,
  getUsableNativeMemory,
  canRunNatively,
  shouldStreamWithAirLLM,
} = require('../src/main/local/router');


test('classifyComplexity identifies heavy coding, debugging, and math tasks', () => {
  const t1 = classifyComplexity('Write a PowerShell script to fetch JSON data, parse it, and save to a CSV file');
  assert.equal(t1.tier, 'heavy');
  assert.ok(t1.score >= 3);

  const t2 = classifyComplexity('Fix this Python TypeError exception: nullpointer stack trace in module');
  assert.equal(t2.tier, 'heavy');
  assert.ok(t2.score >= 3);

  const t3 = classifyComplexity('Explain step-by-step how to compute this calculus integral and solve differential equations');
  assert.equal(t3.tier, 'heavy');
  assert.ok(t3.score >= 3);
});

test('classifyComplexity identifies light UI, greeting, and simple click tasks', () => {
  const t1 = classifyComplexity('Click the Sign In button on the screen');
  assert.equal(t1.tier, 'light');
  assert.equal(t1.tier3, 'vision');
  assert.equal(t1.suggestedModel, 'qwen3-vl-8b');
  assert.ok(t1.score < 3);

  const t2 = classifyComplexity('Open Spotify and play music');
  assert.equal(t2.tier, 'light');
  assert.equal(t2.tier3, 'vision');
  assert.ok(t2.score < 3);

  const t3 = classifyComplexity('Hello, what time is it?');
  assert.equal(t3.tier, 'light');
  assert.equal(t3.tier3, 'vision');
  assert.ok(t3.score < 3);

  const t4 = classifyComplexity('Draw a circle on the screen and tidy it');
  assert.equal(t4.tier, 'light');
  assert.equal(t4.tier3, 'vision');
  assert.ok(t4.score < 3);
});

test('classifyComplexity accurately maps tasks across the 3 tiers (Vision, Mid-Workhorse, Sol-Brain)', () => {
  // Tier 1: Vision / Reflex
  const visionTask = classifyComplexity('Find the Submit button on the screen and click it');
  assert.equal(visionTask.tier3, 'vision');
  assert.equal(visionTask.suggestedModel, 'qwen3-vl-8b');

  // Tier 2: Mid-Tier Workhorse (Everyday code, scripts, functions)
  const midTask = classifyComplexity('Write a Python function to parse JSON logs and write to a CSV file');
  assert.equal(midTask.tier3, 'mid');
  assert.equal(midTask.suggestedModel, 'qwen36-35b');

  // Tier 3: Sol-Brain (Frontier architecture, formal theorem proof, sol-tier reasoning)
  const brainTask = classifyComplexity('Architect a distributed microservice system with database schema design and formal theorem proof for consensus');
  assert.equal(brainTask.tier3, 'brain');
  assert.equal(brainTask.suggestedModel, 'deepseek-v4-flash');

  const brainTask2 = classifyComplexity('Think deeply using frontier reasoning: analyze this complex refactor for deadlock detection and race conditions in concurrent queue');
  assert.equal(brainTask2.tier3, 'brain');
  assert.equal(brainTask2.suggestedModel, 'deepseek-v4-flash');
});

test('getModelTiers finds light and heavy models in catalog', () => {
  const { light, heavy, canRoute } = getModelTiers();
  assert.ok(canRoute);
  assert.ok(light);
  assert.ok(heavy);
  assert.notEqual(light.id, heavy.id);
  assert.ok(light.id.includes('4b'));
  assert.ok(heavy.id.includes('8b') || heavy.id.includes('30b'));
});

test('selectModelForTask routes light task to light model and heavy task to heavy model', () => {
  const lightChoice = selectModelForTask('Click the red button');
  assert.equal(lightChoice.tier, 'light');
  assert.ok(lightChoice.targetId.includes('4b'));

  const heavyChoice = selectModelForTask('Write a Python function to implement quicksort algorithm and unit test it');
  assert.equal(heavyChoice.tier, 'heavy');
  assert.ok(heavyChoice.targetId.includes('8b') || heavyChoice.targetId.includes('30b'));
});

test('shouldEscalate detects when to escalate from light to heavy tier', () => {
  const { light, heavy } = getModelTiers();

  // On light model with repeats or nudges: escalate
  assert.equal(shouldEscalate({ currentModelId: light.id, repeats: 2 }), true);
  assert.equal(shouldEscalate({ currentModelId: light.id, nudges: 2 }), true);
  assert.equal(shouldEscalate({ currentModelId: light.id, consecutiveErrors: 2 }), true);

  // Normal run without errors: do not escalate
  assert.equal(shouldEscalate({ currentModelId: light.id, repeats: 0, nudges: 0, consecutiveErrors: 0 }), false);

  // Already on heavy model: do not escalate further
  assert.equal(shouldEscalate({ currentModelId: heavy.id, repeats: 2, nudges: 2 }), false);
});

test('classifyComplexity and selectModelForTask route to AirLLM when explicit layer-streaming is requested', () => {
  const t = classifyComplexity('Use airllm to run llama-3-70b and analyze this repository');
  assert.equal(t.tier3, 'airllm');
  assert.equal(t.suggestedModel, 'airllm-meta-llama-Meta-Llama-3-70B-Instruct');

  const choice = selectModelForTask('Run this with AirLLM 70B model');
  assert.equal(choice.tier3, 'airllm');
  assert.ok(choice.targetId.includes('airllm'));
});

test('estimateMemoryGB calculates accurate memory footprint across model parameter sizes', () => {
  assert.equal(estimateMemoryGB('4b'), 4.2);
  assert.equal(estimateMemoryGB('8b'), 7.2);
  assert.equal(estimateMemoryGB('14b'), 11.0);
  assert.equal(estimateMemoryGB('32b'), 22.0);
  assert.equal(estimateMemoryGB('70b'), 42.0);
  assert.equal(estimateMemoryGB('671b'), 80.0);
});

test('canRunNatively accurately distinguishes native GPU/RAM capability from overflow', () => {
  const standardGpuHw = { dedicated: true, vramGB: 8, ramGB: 16 };
  // 8B fits natively in 8GB VRAM
  assert.equal(canRunNatively('8b', standardGpuHw), true);
  // 4B fits natively
  assert.equal(canRunNatively('4b', standardGpuHw), true);
  // 70B requires 42GB which exceeds 18.6GB usable memory on standard 16GB RAM PC
  assert.equal(canRunNatively('70b', standardGpuHw), false);
  // Should stream with AirLLM when native capacity is exceeded
  assert.equal(shouldStreamWithAirLLM('70b', standardGpuHw), true);
  // Should NOT stream with AirLLM when model fits natively
  assert.equal(shouldStreamWithAirLLM('8b', standardGpuHw), false);

  // High-memory workstation (e.g. 64GB RAM + 24GB VRAM)
  const workstationHw = { dedicated: true, vramGB: 24, ramGB: 64 };
  // 70B fits natively on 64GB RAM workstation
  assert.equal(canRunNatively('70b', workstationHw), true);
  // AirLLM is NOT needed for 70B on high-memory workstation
  assert.equal(shouldStreamWithAirLLM('70b', workstationHw), false);
});

test('hardware-adaptive routing: 8B models NEVER use AirLLM when hardware can handle natively', () => {
  const hw = { dedicated: true, vramGB: 8, ramGB: 16 };
  const classification = classifyComplexity('Run 8B model to inspect the window and buttons', hw);
  assert.equal(classification.tier3, 'vision');
  assert.equal(classification.suggestedModel, 'qwen3-vl-8b');
  assert.notEqual(classification.tier3, 'airllm');

  const decision = selectModelForTask('Run 8B model to inspect the window', 'qwen3-vl-4b', null, hw);
  assert.notEqual(decision.tier3, 'airllm');
  assert.equal(decision.hardwareAdaptive, true);
  assert.equal(decision.nativeFit, true);
});

test('hardware-adaptive routing: 70B model uses native execution on high-memory hardware and AirLLM on low-memory hardware', () => {
  const lowMemHw = { dedicated: true, vramGB: 4, ramGB: 8 };
  const highMemHw = { dedicated: true, vramGB: 24, ramGB: 64 };

  // On low-memory PC: 70B triggers AirLLM layer-streaming to prevent OOM
  const lowDecision = classifyComplexity('Run 70B model for deep architectural design', lowMemHw);
  assert.equal(lowDecision.tier3, 'airllm');
  assert.equal(lowDecision.suggestedModel, 'airllm-meta-llama-Meta-Llama-3-70B-Instruct');

  // On high-memory workstation: 70B runs natively without AirLLM
  const highDecision = classifyComplexity('Run 70B model for deep architectural design', highMemHw);
  assert.equal(highDecision.tier3, 'brain');
  assert.equal(highDecision.suggestedModel, 'deepseek-v4-flash');
  assert.notEqual(highDecision.tier3, 'airllm');
});


