'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const exoPlugin = require('../src/main/plugins/builtin/exo_cluster');
const cuaPlugin = require('../src/main/plugins/builtin/cua_sandbox');
const tapkitPlugin = require('../src/main/plugins/builtin/tapkit_iphone');
const botDbPlugin = require('../src/main/plugins/builtin/bot_database');
const channelsPlugin = require('../src/main/plugins/builtin/group_channels');
const permPlugin = require('../src/main/plugins/builtin/permission_broker');
const { permissionBroker } = require('../src/main/permission_broker');

function makeCtx() {
  const logs = [];
  return {
    confirm: async () => true,
    log: (lvl, msg) => logs.push({ lvl, msg }),
    logs
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Exo Distributed AI Cluster Tests
// ─────────────────────────────────────────────────────────────────────────────
test('exo_cluster plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(exoPlugin));
  assert.equal(exoPlugin.length, 3);

  const toolNames = exoPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('exo_cluster_status'));
  assert.ok(toolNames.includes('exo_dispatch_task'));
  assert.ok(toolNames.includes('exo_list_models'));

  for (const tool of exoPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('exo_cluster_status checks cluster topology and sharded model support', async () => {
  const statusTool = exoPlugin.find((t) => t.name === 'exo_cluster_status');
  const ctx = makeCtx();

  const res = await statusTool.run({}, ctx);
  assert.ok(res.includes('EXO'));
  assert.ok(res.includes('llama-3.3-70b-instruct'));
  assert.ok(res.includes('qwen-2.5-72b-instruct'));
  assert.ok(res.includes('deepseek-v3-sharded'));
});

test('exo_dispatch_task coordinates multi-node layer sharding', async () => {
  const dispatchTool = exoPlugin.find((t) => t.name === 'exo_dispatch_task');
  const ctx = makeCtx();

  const res = await dispatchTool.run({
    prompt: 'Synthesize optimal microservice database partitioning strategy',
    model: 'llama-3.3-70b-instruct'
  }, ctx);

  assert.ok(res.includes('EXO DISTRIBUTED TASK DISPATCHED') || res.includes('EXO DISTRIBUTED INFERENCE RESULT'));
  assert.ok(res.includes('llama-3.3-70b-instruct'));
});

test('exo_list_models enumerates cluster supported models', async () => {
  const listTool = exoPlugin.find((t) => t.name === 'exo_list_models');
  const ctx = makeCtx();

  const res = await listTool.run({}, ctx);
  assert.ok(res.includes('EXO SHARDED MODEL REGISTRY'));
  assert.ok(res.includes('llama-3.3-70b-instruct'));
  assert.ok(res.includes('deepseek-v3-sharded'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cua Background Driver & Isolated Spaces Tests
// ─────────────────────────────────────────────────────────────────────────────
test('cua_sandbox plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(cuaPlugin));
  assert.equal(cuaPlugin.length, 3);

  const toolNames = cuaPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('cua_background_action'));
  assert.ok(toolNames.includes('cua_spaces_manage'));
  assert.ok(toolNames.includes('cua_driver_status'));

  for (const tool of cuaPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('cua_background_action performs clicks, keystrokes, and accessibility inspection', async () => {
  const bgTool = cuaPlugin.find((t) => t.name === 'cua_background_action');
  const ctx = makeCtx();

  // Background click
  const clickRes = await bgTool.run({
    window_title: 'Google Chrome',
    action: 'click',
    coordinates: { x: 250, y: 180 }
  }, ctx);
  assert.ok(clickRes.includes('CUA BACKGROUND CLICK DISPATCHED'));
  assert.ok(clickRes.includes('Google Chrome'));
  assert.ok(clickRes.includes('Zero mouse cursor displacement'));

  // Background type
  const typeRes = await bgTool.run({
    window_title: 'Visual Studio Code',
    action: 'type_text',
    text: 'const mave = new SovereignAI();'
  }, ctx);
  assert.ok(typeRes.includes('CUA BACKGROUND KEYBOARD INPUT DISPATCHED'));
  assert.ok(typeRes.includes('const mave'));

  // Background accessibility tree
  const treeRes = await bgTool.run({
    window_title: 'Settings',
    action: 'read_accessibility_tree'
  }, ctx);
  assert.ok(treeRes.includes('CUA ACCESSIBILITY TREE INSPECTED'));
  assert.ok(treeRes.includes('Submit'));
});

test('cua_spaces_manage provisions, executes in, and destroys isolated sandboxes', async () => {
  const spaceTool = cuaPlugin.find((t) => t.name === 'cua_spaces_manage');
  const ctx = makeCtx();

  // Create space
  const createRes = await spaceTool.run({
    action: 'create_space',
    space_name: 'test-sandbox-env',
    env_type: 'windows_sandbox'
  }, ctx);
  assert.ok(createRes.includes('CUA ISOLATED SPACE CREATED'));
  assert.ok(createRes.includes('test-sandbox-env'));

  // Execute isolated command
  const execRes = await spaceTool.run({
    action: 'execute_isolated',
    space_name: 'test-sandbox-env',
    command: 'npm run test-untrusted'
  }, ctx);
  assert.ok(execRes.includes('CUA ISOLATED EXECUTION REPORT'));
  assert.match(execRes, /zero modification to host PC/i);

  // List spaces
  const listRes = await spaceTool.run({ action: 'list_spaces' }, ctx);
  assert.ok(listRes.includes('ACTIVE CUA ISOLATED SPACES'));
  assert.ok(listRes.includes('test-sandbox-env'));

  // Destroy space
  const destroyRes = await spaceTool.run({
    action: 'destroy_space',
    space_name: 'test-sandbox-env'
  }, ctx);
  assert.ok(destroyRes.includes('CUA SPACE DESTROYED'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TapKit Physical iPhone Automation Tests
// ─────────────────────────────────────────────────────────────────────────────
test('tapkit_iphone plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(tapkitPlugin));
  assert.equal(tapkitPlugin.length, 3);

  const toolNames = tapkitPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('tapkit_list_phones'));
  assert.ok(toolNames.includes('tapkit_phone_screenshot'));
  assert.ok(toolNames.includes('tapkit_phone_action'));

  for (const tool of tapkitPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('tapkit_list_phones and tapkit_phone_screenshot inspect physical iPhone', async () => {
  const listTool = tapkitPlugin.find((t) => t.name === 'tapkit_list_phones');
  const shotTool = tapkitPlugin.find((t) => t.name === 'tapkit_phone_screenshot');
  const ctx = makeCtx();

  const listRes = await listTool.run({}, ctx);
  assert.ok(listRes.includes('TAPKIT'));
  assert.ok(listRes.includes('iPhone'));

  const shotRes = await shotTool.run({ phone_name: 'iPhone 16 Pro' }, ctx);
  assert.ok(shotRes.includes('TAPKIT iPHONE SCREENSHOT CAPTURED'));
  assert.ok(shotRes.includes('1320 x 2868'));
});

test('tapkit_phone_action dispatches vision taps, swipes, and app launches', async () => {
  const actTool = tapkitPlugin.find((t) => t.name === 'tapkit_phone_action');
  const ctx = makeCtx();

  // Vision Tap
  const visRes = await actTool.run({
    action: 'vision_tap',
    vision_target: 'the Settings icon'
  }, ctx);
  assert.ok(visRes.includes('TAPKIT VISION TAP DISPATCHED'));
  assert.ok(visRes.includes('the Settings icon'));

  // Swipe / Flick
  const flickRes = await actTool.run({
    action: 'flick',
    direction: 'up'
  }, ctx);
  assert.ok(flickRes.includes('TAPKIT iOS SWIPE DISPATCHED'));
  assert.ok(flickRes.includes('UP'));

  // Launch App
  const appRes = await actTool.run({
    action: 'launch_app',
    app_bundle_or_name: 'Instagram'
  }, ctx);
  assert.ok(appRes.includes('TAPKIT iOS APP LAUNCHED'));
  assert.ok(appRes.includes('Instagram'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. OpenMausBot Bot Dedicated Database & Tabular Data Tab Tests
// ─────────────────────────────────────────────────────────────────────────────
test('bot_database plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(botDbPlugin));
  assert.equal(botDbPlugin.length, 3);

  const toolNames = botDbPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('bot_import_dataset'));
  assert.ok(toolNames.includes('bot_sql_query'));
  assert.ok(toolNames.includes('bot_list_tables'));

  for (const tool of botDbPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('bot_database imports CSV and executes deterministic SQL queries with zero hallucination', async () => {
  const importTool = botDbPlugin.find((t) => t.name === 'bot_import_dataset');
  const queryTool = botDbPlugin.find((t) => t.name === 'bot_sql_query');
  const listTool = botDbPlugin.find((t) => t.name === 'bot_list_tables');
  const ctx = makeCtx();

  const csvContent = `department,employee,salary,bonus
Engineering,Alice,120000,15000
Engineering,Bob,130000,20000
Marketing,Carol,95000,10000
Marketing,Dave,85000,8000
Sales,Eve,110000,25000
`;

  // 1. Import dataset
  const importRes = await importTool.run({
    table_name: 'payroll_test',
    file_path_or_content: csvContent,
    description: 'Quarterly Departmental Payroll'
  }, ctx);

  assert.ok(importRes.includes('DATASET IMPORTED INTO BOT DATA TAB'));
  assert.ok(importRes.includes('payroll_test'));
  assert.ok(importRes.includes('5 rows'));

  // 2. List tables
  const listRes = await listTool.run({}, ctx);
  assert.ok(listRes.includes('payroll_test'));

  // 3. Run Aggregation Query: SUM(salary) GROUP BY department
  const sqlRes = await queryTool.run({
    query: 'SELECT department, SUM(salary) FROM payroll_test GROUP BY department'
  }, ctx);

  assert.ok(sqlRes.includes('BOT SQL QUERY RESULT'));
  assert.ok(sqlRes.includes('Engineering'));
  assert.ok(sqlRes.includes('250000')); // 120000 + 130000 = 250000
  assert.ok(sqlRes.includes('180000')); // 95000 + 85000 = 180000
  assert.ok(sqlRes.includes('110000')); // Sales Eve
  assert.ok(sqlRes.includes('0% arithmetic hallucination'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. OpenMausBot Multi-Agent Group Channels Tests
// ─────────────────────────────────────────────────────────────────────────────
test('group_channels plugin exports valid tools with correct schemas', () => {
  assert.ok(Array.isArray(channelsPlugin));
  assert.equal(channelsPlugin.length, 3);

  const toolNames = channelsPlugin.map((t) => t.name);
  assert.ok(toolNames.includes('create_agent_channel'));
  assert.ok(toolNames.includes('run_group_round_table'));
  assert.ok(toolNames.includes('list_agent_channels'));

  for (const tool of channelsPlugin) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{1,63}$/);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(typeof tool.run, 'function');
  }
});

test('create_agent_channel and run_group_round_table execute multi-bot debate', async () => {
  const createTool = channelsPlugin.find((t) => t.name === 'create_agent_channel');
  const debateTool = channelsPlugin.find((t) => t.name === 'run_group_round_table');
  const listTool = channelsPlugin.find((t) => t.name === 'list_agent_channels');
  const ctx = makeCtx();

  const createRes = await createTool.run({
    channel_name: 'alpha-squad-debate',
    purpose: 'Review high-concurrency payment gateway redesign',
    bot_personas: ['lead_architect', 'security_sentinel', 'performance_engineer']
  }, ctx);

  assert.ok(createRes.includes('MULTI-AGENT CHANNEL CREATED'));
  assert.ok(createRes.includes('alpha-squad-debate'));
  assert.ok(createRes.includes('Lead Architect'));
  assert.ok(createRes.includes('Security Sentinel'));

  const debateRes = await debateTool.run({
    channel_name: 'alpha-squad-debate',
    topic_or_task: 'Migrate monolithic SQL transactions to distributed event sourcing with idempotency keys'
  }, ctx);

  assert.ok(debateRes.includes('MULTI-AGENT ROUND-TABLE CONCLUDED'));
  assert.ok(debateRes.includes('Round 1: Initial Critiques'));
  assert.ok(debateRes.includes('Consensus Action Plan'));

  const listRes = await listTool.run({}, ctx);
  assert.ok(listRes.includes('alpha-squad-debate'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Interactive In-Chat Permission Broker Tests
// ─────────────────────────────────────────────────────────────────────────────
test('permissionBroker evaluates risk levels accurately and gates critical actions', () => {
  // CRITICAL risk detection
  const crit = permissionBroker.evaluate('run_command', { command: 'rm -rf / --no-preserve-root' });
  assert.equal(crit.riskLevel, 'CRITICAL');
  assert.ok(crit.dangerScore > 0.9);
  assert.equal(crit.allowed, false);

  const critWin = permissionBroker.evaluate('run_command', { command: 'del /s /q C:\\Windows\\System32' });
  assert.equal(critWin.riskLevel, 'CRITICAL');

  // HIGH risk detection
  const high = permissionBroker.evaluate('run_command', { command: 'npm install -g express' });
  assert.equal(high.riskLevel, 'HIGH');

  // MEDIUM risk detection
  const med = permissionBroker.evaluate('write_file', { path: 'src/main/server.js' });
  assert.equal(med.riskLevel, 'MEDIUM');

  // LOW risk detection
  const low = permissionBroker.evaluate('read_file', { path: 'package.json' });
  assert.equal(low.riskLevel, 'LOW');
  assert.equal(low.allowed, true);

  // Test card markdown rendering
  const cardMd = permissionBroker.renderCardMarkdown(crit);
  assert.ok(cardMd.includes('ACTION APPROVAL REQUEST'));
  assert.ok(cardMd.includes('CRITICAL RISK'));
  assert.ok(cardMd.includes('ALLOW ONCE'));
});

test('permission_broker plugin exports valid tools and manages session grants', async () => {
  assert.ok(Array.isArray(permPlugin));
  assert.equal(permPlugin.length, 2);

  const evalTool = permPlugin.find((t) => t.name === 'broker_evaluate_action');
  const sessionTool = permPlugin.find((t) => t.name === 'broker_session_permissions');
  const ctx = makeCtx();

  const evalRes = await evalTool.run({
    tool_name: 'run_command',
    command_or_input: 'DROP TABLE customers;'
  }, ctx);

  assert.ok(evalRes.includes('ACTION APPROVAL REQUEST'));
  assert.ok(evalRes.includes('CRITICAL RISK'));

  // Allow tool for session
  const allowRes = await sessionTool.run({
    action: 'allow_tool',
    tool_name: 'safe_custom_build'
  }, ctx);
  assert.ok(allowRes.includes('SESSION PERMISSION GRANTED'));
  assert.equal(permissionBroker.isAlwaysAllowed('safe_custom_build'), true);

  // List session tools
  const listRes = await sessionTool.run({ action: 'list' }, ctx);
  assert.ok(listRes.includes('safe_custom_build'));

  // Revoke tool
  const revokeRes = await sessionTool.run({
    action: 'revoke_tool',
    tool_name: 'safe_custom_build'
  }, ctx);
  assert.ok(revokeRes.includes('SESSION PERMISSION REVOKED'));
  assert.equal(permissionBroker.isAlwaysAllowed('safe_custom_build'), false);
});
