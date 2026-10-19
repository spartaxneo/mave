'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getCodeInterpreter } = require('../src/main/chatgpt/code_interpreter');
const { getPersonaStore } = require('../src/main/chatgpt/persona_store');
const { getChatGPTPersonalization } = require('../src/main/chatgpt/personalization');
const { getJarvisTelemetry } = require('../src/main/jarvis/telemetry');
const { getJarvisButler } = require('../src/main/jarvis/proactive_butler');

test('ChatGPT Code Interpreter executes Python script and captures stdout', async () => {
  const interp = getCodeInterpreter();
  const res = await interp.runPython('a = 15\nb = 27\nprint(f"SUM={a + b}")');

  assert.equal(res.ok, true, `Python execution failed: ${res.stderr}`);
  assert.equal(res.language, 'python');
  assert.equal(res.exitCode, 0);
  assert.ok(res.stdout.includes('SUM=42'), `Expected SUM=42, got: ${res.stdout}`);
  assert.ok(typeof res.durationMs === 'number');
});

test('ChatGPT Code Interpreter executes JavaScript script and captures stdout', async () => {
  const interp = getCodeInterpreter();
  const res = await interp.runJavaScript('const nums = [1, 2, 3, 4, 5]; console.log("TOTAL=" + nums.reduce((a, b) => a + b, 0));');

  assert.equal(res.ok, true, `JS execution failed: ${res.stderr}`);
  assert.equal(res.language, 'javascript');
  assert.equal(res.exitCode, 0);
  assert.ok(res.stdout.includes('TOTAL=15'));
});

test('ChatGPT Custom GPT Personas store manages personas and active persona selection', () => {
  const store = getPersonaStore();
  const list = store.listPersonas();

  assert.ok(list.length >= 5, 'Should have at least 5 default personas');
  assert.ok(list.some((p) => p.id === 'jarvis'));
  assert.ok(list.some((p) => p.id === 'code_interpreter'));
  assert.ok(list.some((p) => p.id === 'architect'));

  const active = store.getActivePersona();
  assert.ok(active);
  assert.equal(active.id, 'jarvis');

  // Test custom persona creation & deletion
  const created = store.createPersona({
    name: 'Test Analyst',
    tagline: 'Custom test persona',
    systemPrompt: 'Be a test assistant.',
  });
  assert.equal(created.name, 'Test Analyst');
  assert.equal(store.getPersona(created.id).name, 'Test Analyst');

  const deleted = store.deletePersona(created.id);
  assert.equal(deleted, true);
});

test('ChatGPT Personalization manages user instructions, discrete memories, and prompt injection', () => {
  const personalization = getChatGPTPersonalization();
  const initial = personalization.getInstructions();
  assert.ok(initial);

  personalization.updateInstructions({
    aboutUser: 'Lead Developer on Windows 11 with RTX 5060.',
    responseInstructions: 'Provide concise, production-ready code with no placeholders.',
  });

  const updated = personalization.getInstructions();
  assert.equal(updated.aboutUser, 'Lead Developer on Windows 11 with RTX 5060.');
  assert.equal(updated.responseInstructions, 'Provide concise, production-ready code with no placeholders.');

  // Test memory addition
  const mem = personalization.addMemory('Testing memory fact persistence', 'test');
  assert.ok(mem && mem.id);

  const context = personalization.formatPromptContext();
  assert.ok(context.includes('Lead Developer on Windows 11 with RTX 5060.'));
  assert.ok(context.includes('Provide concise, production-ready code with no placeholders.'));

  personalization.deleteMemory(mem.id);
});

test('J.A.R.V.I.S. Hardware Telemetry & Proactive Butler generate tactical status reports', async () => {
  const telemetry = getJarvisTelemetry();
  const snap = await telemetry.getSnapshot();

  assert.ok(snap.cpu);
  assert.ok(typeof snap.cpu.usagePct === 'number');
  assert.ok(snap.gpu);
  assert.ok(snap.gpu.name);
  assert.ok(snap.ram);
  assert.ok(snap.ram.totalGB > 0);
  assert.ok(snap.network);

  const butler = getJarvisButler();
  const briefing = await butler.generateStatusBriefing();
  assert.ok(briefing.greeting);
  assert.ok(briefing.text.includes('tactical systems'));
  assert.ok(briefing.telemetry);
});
