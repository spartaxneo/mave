'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');

const n8nPlugin = require('../src/main/plugins/builtin/n8n');
const jarvisPlugin = require('../src/main/plugins/builtin/jarvis');
const creativePlugin = require('../src/main/plugins/builtin/creative_media');
const connectedServices = require('../src/main/plugins/builtin/connected_services');

// Mock context helper
function makeCtx() {
  const logs = [];
  return {
    confirm: async () => true,
    log: (lvl, msg) => logs.push({ lvl, msg }),
    settings: {
      secret: () => ''
    },
    logs
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. n8n Automation Engine Tests
// ─────────────────────────────────────────────────────────────────────────────
test('n8n plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(n8nPlugin));
  assert.equal(n8nPlugin.length, 3);

  const toolNames = n8nPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('n8n_list_templates'));
  assert.ok(toolNames.includes('n8n_execute_workflow'));
  assert.ok(toolNames.includes('n8n_connect_instance'));

  for (const tool of n8nPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('n8n_list_templates returns all built-in workflow blueprints', async () => {
  const listTool = n8nPlugin.find((t) => t.name === 'n8n_list_templates');
  const ctx = makeCtx();

  const res = await listTool.run({}, ctx);
  assert.ok(res.includes('n8n WORKFLOW ENGINE BLUEPRINTS'));
  assert.ok(res.includes('github_issue_to_slack_linear'));
  assert.ok(res.includes('webhook_ai_summarizer_email'));
  assert.ok(res.includes('scheduled_system_backup_sync'));
  assert.ok(res.includes('lead_capture_crm_pipeline'));
});

test('n8n_execute_workflow runs template workflow in-process with node chaining', async () => {
  const execTool = n8nPlugin.find((t) => t.name === 'n8n_execute_workflow');
  const ctx = makeCtx();

  const initialPayload = {
    issue: {
      title: 'Fix Memory Leak in Audio Cache',
      body: 'Detected 50MB uncollected buffer on hot reload',
      user: { login: 'developer-jane' }
    }
  };

  const res = await execTool.run({
    template_name: 'github_issue_to_slack_linear',
    payload: initialPayload
  }, ctx);

  assert.ok(res.includes('n8n AUTOMATION RUN COMPLETED'));
  assert.ok(res.includes('GitHub Issue -> Slack Alert -> Linear Ticket'));
  assert.ok(res.includes('SUCCESS (100% Passed)'));
  assert.ok(res.includes('developer-jane'));
});

test('n8n_execute_workflow executes custom ad-hoc node graph correctly', async () => {
  const execTool = n8nPlugin.find((t) => t.name === 'n8n_execute_workflow');
  const ctx = makeCtx();

  const customNodes = [
    { id: 'node_input', type: 'trigger' },
    {
      id: 'node_double',
      type: 'transform',
      script: 'return { doubledValue: data.payload.count * 2 };'
    },
    { id: 'node_notify', type: 'action', service: 'discord' }
  ];

  const res = await execTool.run({
    custom_nodes: customNodes,
    payload: { count: 21 }
  }, ctx);

  assert.ok(res.includes('n8n AUTOMATION RUN COMPLETED'));
  assert.ok(res.includes('Custom n8n Workflow'));
  assert.ok(res.includes('SUCCESS (100% Passed)'));
  assert.ok(res.includes('42'));
});

test('n8n_connect_instance tests connection to local n8n server', async () => {
  const connTool = n8nPlugin.find((t) => t.name === 'n8n_connect_instance');
  const ctx = makeCtx();

  const res = await connTool.run({ host: 'http://localhost:5678' }, ctx);
  assert.ok(res.includes('n8n'));
  assert.ok(res.includes('http://localhost:5678'));
  assert.ok(res.includes('internal execution engine') || res.includes('Connected'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Iron Man JARVIS Core & Stark Protocols Tests
// ─────────────────────────────────────────────────────────────────────────────
test('jarvis plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(jarvisPlugin));
  assert.equal(jarvisPlugin.length, 2);

  const toolNames = jarvisPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('jarvis_tactical_report'));
  assert.ok(toolNames.includes('jarvis_stark_protocol'));

  for (const tool of jarvisPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('jarvis_tactical_report generates Arc-Reactor core telemetry and butler report', async () => {
  const reportTool = jarvisPlugin.find((t) => t.name === 'jarvis_tactical_report');
  const ctx = makeCtx();

  const res = await reportTool.run({ focus_area: 'full_system' }, ctx);
  assert.ok(res.includes('JARVIS TACTICAL SITUATION REPORT'));
  assert.ok(res.includes('Good day, Sir'));
  assert.ok(res.includes('Arc-Reactor Core Telemetry'));
  assert.ok(res.includes('Processing Grid'));
  assert.ok(res.includes('Memory Matrix'));
  assert.ok(res.includes('Tactical Defense & Subsystem Status'));
  assert.ok(res.includes('Standing by for your command, Sir'));
});

test('jarvis_stark_protocol handles all 4 battle and utility modes', async () => {
  const protoTool = jarvisPlugin.find((t) => t.name === 'jarvis_stark_protocol');
  const ctx = makeCtx();

  // 1. Mark L Overdrive
  const markL = await protoTool.run({ protocol: 'mark_l_overdrive' }, ctx);
  assert.ok(markL.includes('PROTOCOL MARK L ACTIVATED'));
  assert.ok(markL.includes('compute overdrive'));

  // 2. Clean Slate Stealth
  const cleanSlate = await protoTool.run({ protocol: 'clean_slate_stealth' }, ctx);
  assert.ok(cleanSlate.includes('PROTOCOL CLEAN SLATE ENGAGED'));
  assert.ok(cleanSlate.includes('stealth blackout'));

  // 3. House Party Swarm
  const houseParty = await protoTool.run({ protocol: 'house_party_swarm' }, ctx);
  assert.ok(houseParty.includes('PROTOCOL HOUSE PARTY DEPLOYED'));
  assert.ok(houseParty.includes('Coordinating all available household units'));

  // 4. Veronica Containment
  const veronica = await protoTool.run({ protocol: 'veronica_containment' }, ctx);
  assert.ok(veronica.includes('PROTOCOL VERONICA INITIATED'));
  assert.ok(veronica.includes('containment parameters'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ElevenLabs & Higgsfield Engine Tests
// ─────────────────────────────────────────────────────────────────────────────
test('elevenlabs_voice_engine configures voice profiles and neural fallback', async () => {
  const elevenTool = connectedServices.find((t) => t.name === 'elevenlabs_voice_engine');
  assert.ok(elevenTool, 'elevenlabs_voice_engine tool must exist');

  const ctx = makeCtx();

  // Test default JARVIS Butler profile fallback to Kokoro local engine
  const resButler = await elevenTool.run({
    text: 'Good morning Sir, systems are fully operational.',
    voice_profile: 'jarvis_butler',
    stability: 0.65,
    similarity_boost: 0.85
  }, ctx);

  assert.ok(resButler.includes('ELEVENLABS VOICE SYNTHESIZER READY'));
  assert.ok(resButler.includes('Adam (British Butler / JARVIS Tone)'));
  assert.ok(resButler.includes('0.65'));
  assert.ok(resButler.includes('0.85'));
  assert.ok(resButler.includes('Kokoro neural engine'));

  // Test custom clone voice profile
  const resClone = await elevenTool.run({
    text: 'Executing custom cloned voice sample.',
    voice_profile: 'custom_clone',
    voice_id: 'cloned_custom_voice_99'
  }, ctx);

  assert.ok(resClone.includes('cloned_custom_voice_99'));
});

test('higgsfield_video_engine choreographs camera motion and creates motion vectors', async () => {
  const hfTool = creativePlugin.find((t) => t.name === 'higgsfield_video_engine');
  assert.ok(hfTool, 'higgsfield_video_engine tool must exist');

  const ctx = makeCtx();

  const res = await hfTool.run({
    prompt: 'Futuristic supercar accelerating through neon city streets in rain',
    camera_motion: 'dolly_zoom_vertigo',
    aspect_ratio: '2.39:1_anamorphic',
    fps: 60,
    duration_seconds: 8
  }, ctx);

  assert.ok(res.includes('HIGGSFIELD GENERATIVE VIDEO PIPELINE'));
  assert.ok(res.includes('DOLLY_ZOOM_VERTIGO'));
  assert.ok(res.includes('2.39:1_anamorphic'));
  assert.ok(res.includes('60 FPS'));
  assert.ok(res.includes('8s'));
  assert.ok(res.includes('higgsfield-motion-v2'));
});
