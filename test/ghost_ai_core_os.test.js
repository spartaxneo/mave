'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getGhostAICore } = require('../src/main/ghost_core');
const { HybridSearchEngine, computeDenseEmbedding, cosineSimilarity } = require('../src/main/ghost_core/hybrid_search');

test('Ghost AI Core initializes complete 2026 agent stack', () => {
  const core = getGhostAICore();
  const status = core.getStatus();

  assert.equal(status.name, 'Mave');
  assert.equal(status.version, '1.4.8');
  assert.equal(status.identity, 'Ghost AI Core Sovereign Agent OS');
  assert.equal(status.protocols.mcp.active, true);
  assert.equal(status.protocols.ag_ui.active, true);
  assert.equal(status.protocols.a2ui.active, true);
  assert.equal(status.protocols.a2a.active, true);
});

// 1. MCP Server JSON-RPC 2.0 Tests
test('MCPServer handles initialize, tools/list, and tools/call JSON-RPC methods', async () => {
  const core = getGhostAICore();

  // initialize
  const initRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { clientInfo: { name: 'Claude Desktop', version: '1.0' } },
  });
  assert.equal(initRes.jsonrpc, '2.0');
  assert.equal(initRes.id, 1);
  assert.equal(initRes.result.serverInfo.name, 'Mave Ghost AI Core');
  assert.equal(initRes.result.protocolVersion, '2024-11-05');

  // tools/list
  const toolsRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  assert.ok(Array.isArray(toolsRes.result.tools));
  assert.ok(toolsRes.result.tools.some((t) => t.name === 'hybrid_search'));

  // tools/call (hybrid_search)
  const callRes = await core.mcpServer.handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'hybrid_search',
      arguments: { query: 'test query', top_k: 5 },
    },
  });
  assert.equal(callRes.id, 3);
  assert.equal(callRes.result.isError, false);
  assert.ok(Array.isArray(callRes.result.content));
});

// 2. A2A Agent Card Specification Tests
test('A2AEngine generates compliant /.well-known/agent.json specification', () => {
  const core = getGhostAICore();
  const card = core.a2a.getAgentCard();

  assert.equal(card.name, 'Mave');
  assert.equal(card.protocols.mcp.endpoint, '/mcp');
  assert.equal(card.protocols.ag_ui.endpoint, '/ag-ui/stream');
  assert.equal(card.protocols.a2a.endpoint, '/a2a/delegate');
  assert.ok(card.capabilities.includes('hybrid_search_rrf'));
  assert.ok(card.subagents.length >= 4);
});

// 3. A2UI Generative Components Tests
test('A2UI formats structured component trees and renders native HTML', () => {
  const core = getGhostAICore();

  const cardComp = core.a2ui.card('System Health', 'All subagents operational', 'Online', '#10b981');
  assert.equal(cardComp.component, 'Card');
  assert.equal(cardComp.title, 'System Health');

  const html = core.a2ui.toHtml(cardComp);
  assert.ok(html.includes('a2ui-card'));
  assert.ok(html.includes('System Health'));
  assert.ok(html.includes('Online'));
});

// 4. Hybrid Search Engine with Reciprocal Rank Fusion (RRF) Tests
test('HybridSearchEngine indexes documents and ranks via RRF', () => {
  const tmpIndexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-rrf-test-'));
  const search = new HybridSearchEngine({ indexDir: tmpIndexDir });

  search.indexDocument({
    id: 'doc_ghost_arch',
    title: 'Ghost AI Core Architecture',
    content: 'Ghost AI Core implements MCP, AG-UI, A2UI, and A2A protocols with on-device local search and zero cloud telemetry.',
  }, false);

  search.indexDocument({
    id: 'doc_sentinel',
    title: 'Autonomous Sentinel Awareness',
    content: 'The sensory sentinel monitors foreground desktop apps, internet connectivity changes, and daily work activity.',
  }, false);

  const results = search.search('Ghost AI architecture protocols');
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'doc_ghost_arch');
  assert.ok(Number(results[0].rrfScore) > 0);

  fs.rmSync(tmpIndexDir, { recursive: true, force: true });
});

// 5. Ghost 3-Tier Security Guard Tests
test('GhostSecurityGuard classifies actions into Safe, Moderate, and Dangerous tiers', async () => {
  const core = getGhostAICore();

  // Tier 1: Safe
  const safeEval = await core.security.evaluate('read_memory', {});
  assert.equal(safeEval.allowed, true);
  assert.equal(safeEval.tier, 'safe');

  // Tier 2: Moderate
  const modEval = await core.security.evaluate('edit_file', { path: 'test.txt' });
  assert.equal(modEval.allowed, true);
  assert.equal(modEval.tier, 'moderate');

  // Tier 3: Dangerous
  const dangEval = await core.security.evaluate('run_command', { command: 'rm -rf /' });
  assert.equal(dangEval.tier, 'dangerous');
  assert.equal(dangEval.requiresConfirmation, true);
  assert.equal(dangEval.allowed, false);

  // Human Confirmation Gate
  const confirmedEval = await core.security.evaluate('run_command', { command: 'rm -rf /tmp/cache' }, async () => true);
  assert.equal(confirmedEval.allowed, true);
});
