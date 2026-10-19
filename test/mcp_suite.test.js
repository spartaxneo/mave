'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { getGhostAICore } = require('../src/main/ghost_core');
const mcpHubTools = require('../src/main/plugins/builtin/mcp_hub');

test('MCP Server lists complete tool suite including filesystem, terminal, and git', async () => {
  const core = getGhostAICore();
  const res = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 1);
  assert.ok(Array.isArray(res.result.tools));

  const names = res.result.tools.map((t) => t.name);
  assert.ok(names.includes('filesystem_read'), 'Should have filesystem_read');
  assert.ok(names.includes('filesystem_write'), 'Should have filesystem_write');
  assert.ok(names.includes('filesystem_list'), 'Should have filesystem_list');
  assert.ok(names.includes('filesystem_info'), 'Should have filesystem_info');
  assert.ok(names.includes('git_operations'), 'Should have git_operations');
  assert.ok(names.includes('terminal_run_command'), 'Should have terminal_run_command');
  assert.ok(names.includes('http_request'), 'Should have http_request');
  assert.ok(names.includes('web_fetch_url'), 'Should have web_fetch_url');
  assert.ok(names.includes('web_search_mcp'), 'Should have web_search_mcp');
  assert.ok(names.includes('memory_graph'), 'Should have memory_graph');
  assert.ok(names.includes('docker_manage'), 'Should have docker_manage');
  assert.ok(names.includes('code_interpreter'), 'Should have code_interpreter');
  assert.ok(names.includes('jarvis_telemetry'), 'Should have jarvis_telemetry');
});

test('MCP Filesystem Tools write, read, inspect, and list files safely', async () => {
  const core = getGhostAICore();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-mcp-fs-test-'));
  const testFile = path.join(tmpDir, 'test.txt');

  // 1. filesystem_write
  const writeRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'filesystem_write',
      arguments: { path: testFile, content: 'Sovereign MCP Filesystem verified.' },
    },
  });
  assert.equal(writeRes.result.isError, false);
  const writeData = JSON.parse(writeRes.result.content[0].text);
  assert.equal(writeData.ok, true);

  // 2. filesystem_read
  const readRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'filesystem_read',
      arguments: { path: testFile },
    },
  });
  assert.equal(readRes.result.isError, false);
  const readData = JSON.parse(readRes.result.content[0].text);
  assert.ok(readData.content.includes('Sovereign MCP Filesystem verified.'));

  // 3. filesystem_info
  const infoRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'filesystem_info',
      arguments: { path: testFile },
    },
  });
  assert.equal(infoRes.result.isError, false);
  const infoData = JSON.parse(infoRes.result.content[0].text);
  assert.equal(infoData.isFile, true);
  assert.ok(infoData.size > 0);

  // 4. filesystem_list
  const listRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'filesystem_list',
      arguments: { path: tmpDir },
    },
  });
  assert.equal(listRes.result.isError, false);
  const listData = JSON.parse(listRes.result.content[0].text);
  assert.ok(listData.count >= 1);
  assert.ok(listData.items.some((i) => i.name === 'test.txt'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MCP Terminal Run Command executes shell commands and captures exit code & stdout', async () => {
  const core = getGhostAICore();
  const res = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'terminal_run_command',
      arguments: { command: 'node -e "console.log(123 + 456)"' },
    },
  });

  assert.equal(res.result.isError, false);
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.ok, true);
  assert.equal(data.exitCode, 0);
  assert.ok(data.stdout.includes('579'));
});

test('MCP Memory Graph manages entities and relations persistently', async () => {
  const core = getGhostAICore();

  // Add entity
  const entityRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'memory_graph',
      arguments: { action: 'add_entity', entity: 'Mave', entity_type: 'agent_os' },
    },
  });
  assert.equal(entityRes.result.isError, false);

  // Add relation
  const relRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'memory_graph',
      arguments: { action: 'add_relation', entity: 'Mave', relation: 'implements', target: 'MCP Protocol' },
    },
  });
  assert.equal(relRes.result.isError, false);

  // Query graph
  const queryRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'memory_graph',
      arguments: { action: 'query_graph', query: 'Mave' },
    },
  });
  assert.equal(queryRes.result.isError, false);
  const qData = JSON.parse(queryRes.result.content[0].text);
  assert.ok(qData.matchedEntities.length > 0);
});

test('MCP Hub Plugin allows agent to list catalog, call MCP tools, and connect servers', async () => {
  const [callTool, listTools, catalogTool, connectTool] = mcpHubTools;
  const mockCtx = { log: () => {} };

  // 1. List catalog
  const catalogOutput = await catalogTool.run({}, mockCtx);
  assert.ok(catalogOutput.includes('MAVE MCP SERVER APP STORE'));
  assert.ok(catalogOutput.includes('Filesystem'));
  assert.ok(catalogOutput.includes('Docker'));

  // 2. Connect server
  const connectOutput = await connectTool.run({ server_id: 'docker' }, mockCtx);
  assert.ok(connectOutput.includes('MCP Server Connected'));

  // 3. List tools
  const toolsOutput = await listTools.run({ filter_category: 'filesystem' }, mockCtx);
  assert.ok(toolsOutput.includes('filesystem_read'));

  // 4. Call tool through mcp_hub
  const callOutput = await callTool.run({
    tool_name: 'terminal_run_command',
    arguments: { command: 'node -e "console.log(\'MCP Hub verified\')"' },
  }, mockCtx);
  assert.ok(callOutput.includes('MCP Hub verified'));
});
