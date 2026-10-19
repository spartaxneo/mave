'use strict';
// Ghost AI Core Master Module for Mave Sovereign Private Agent OS.
// Unifies:
// 1. Complete 2026 Agent Protocol Stack (MCP Server/Client, AG-UI, A2UI, A2A)
// 2. Hybrid Search Engine with Reciprocal Rank Fusion (RRF)
// 3. 3-Tier Security Guard & Human Confirmation Gate
// 4. ReAct Autonomous Execution Loop

const { MCPServer, MCPClientManager, AGUIRuntime, A2UI, A2AEngine } = require('./protocol_stack');
const { HybridSearchEngine } = require('./hybrid_search');
const { GhostSecurityGuard } = require('./security_guard');
const { GhostReActEngine } = require('./react_engine');
const { GhostFileWatcher } = require('./file_watcher');
const { getGhostHardwareProfiler } = require('./hardware_profiler');

class GhostAICore {
  constructor(options = {}) {
    this.name = 'Mave';
    this.version = '1.4.8';

    // 1. Initialize Protocol Stack
    this.mcpServer = new MCPServer({ name: 'Mave Ghost AI Core', version: this.version });
    this.mcpClientManager = new MCPClientManager();
    this.agui = new AGUIRuntime({ windows: options.windows });
    this.a2a = new A2AEngine({ name: this.name, version: this.version });
    this.a2ui = A2UI;

    // 2. Initialize Search & Security
    this.search = new HybridSearchEngine();
    this.security = new GhostSecurityGuard({ posture: options.securityPosture || 'balanced' });
    this.react = new GhostReActEngine({ agui: this.agui, security: this.security });

    // 3. Initialize Real-Time File Watcher & Adaptive Hardware Profiler
    this.fileWatcher = new GhostFileWatcher({ searchEngine: this.search });
    this.hardwareProfiler = getGhostHardwareProfiler();

    // Start background file watcher (non-blocking)
    Promise.resolve().then(() => this.fileWatcher.start()).catch(() => {});
    Promise.resolve().then(() => this.hardwareProfiler.profile()).catch(() => {});

    this._registerCoreTools();
  }

  _registerCoreTools() {
    // Tool 1: Hybrid Search (RRF)
    this.mcpServer.registerTool({
      name: 'hybrid_search',
      description: 'Executes sub-50ms Reciprocal Rank Fusion (RRF) hybrid search combining lexical and dense semantic embeddings.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or question' },
          top_k: { type: 'number', description: 'Number of results to return' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        return this.search.search(args.query, args.top_k || 10);
      },
    });

    // Tool 2: Index Document
    this.mcpServer.registerTool({
      name: 'index_document',
      description: 'Indexes a document or note into the local hybrid search engine.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique document ID' },
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Full text content' },
        },
        required: ['id', 'content'],
      },
      handler: async (args) => {
        this.search.indexDocument(args, true);
        return { ok: true, indexedId: args.id };
      },
    });

    // Tool 3: Render A2UI Component
    this.mcpServer.registerTool({
      name: 'render_a2ui_widget',
      description: 'Generates a rich, interactive native UI widget (Cards, Metrics, Table, Action Buttons).',
      inputSchema: {
        type: 'object',
        properties: {
          component_type: { type: 'string', enum: ['card', 'metric_grid', 'table', 'actions'] },
          payload: { type: 'object' },
        },
        required: ['component_type'],
      },
      handler: async (args) => {
        let comp;
        if (args.component_type === 'card') {
          comp = this.a2ui.card(args.payload.title, args.payload.subtitle, args.payload.badgeText, args.payload.badgeColor);
        } else if (args.component_type === 'metric_grid') {
          comp = this.a2ui.metricGrid(args.payload.metrics || []);
        } else if (args.component_type === 'table') {
          comp = this.a2ui.interactiveTable(args.payload.headers || [], args.payload.rows || []);
        } else {
          comp = this.a2ui.actionButtons(args.payload.actions || []);
        }
        const html = this.a2ui.toHtml(comp);
        this.agui.broadcast('ui_render', { component: comp, html });
        return { ok: true, component: comp, html };
      },
    });

    // Tool 4: File Indexer Stats
    this.mcpServer.registerTool({
      name: 'file_indexer_stats',
      description: 'Returns real-time background file indexing metrics and watched folders.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return this.fileWatcher.getStats();
      },
    });

    // Tool 5: Adaptive Hardware AI Profiler
    this.mcpServer.registerTool({
      name: 'hardware_ai_profile',
      description: 'Inspects host GPU, VRAM, and RAM to determine optimal model tiers (Ultra, High, Balanced, Featherlight).',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        return this.hardwareProfiler.getProfile();
      },
    });
  }

  /**
   * HTTP Dispatcher for Ghost AI Core Endpoints (MCP, AG-UI, A2A Agent Card)
   */
  async handleHttpRequest(req, res, pathname) {
    // 1. A2A Agent Card: GET /.well-known/agent.json
    if (pathname === '/.well-known/agent.json' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(JSON.stringify(this.a2a.getAgentCard(), null, 2));
    }

    // 2. MCP JSON-RPC 2.0 Endpoint: POST /mcp
    if (pathname === '/mcp' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const response = await this.mcpServer.handleJsonRpc(payload);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(response ? JSON.stringify(response) : '');
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        }
      });
      return true;
    }

    // 3. MCP SSE Stream: GET /mcp/sse
    if (pathname === '/mcp/sse' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: endpoint\ndata: /mcp\n\n`);
      return true;
    }

    // 4. AG-UI Bidirectional Streaming: GET /ag-ui/stream
    if (pathname === '/ag-ui/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, version: '1.0' })}\n\n`);
      this.agui.addSubscriber(res);
      return true;
    }

    // 5. MCP App Store Catalog API: GET /api/ghost/mcp/catalog
    if (pathname === '/api/ghost/mcp/catalog' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true, catalog: this.mcpClientManager.getCatalog() }));
    }

    // 6. Hybrid Search API: POST /api/ghost/search
    if (pathname === '/api/ghost/search' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { query, topK } = JSON.parse(body || '{}');
          const results = this.search.search(query, topK || 10);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true, query, results }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: err.message }));
        }
      });
      return true;
    }

    // 7. File Watcher Stats API: GET /api/ghost/file-watcher/stats
    if (pathname === '/api/ghost/file-watcher/stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true, stats: this.fileWatcher.getStats() }));
    }

    // 8. File Watcher Trigger Crawl: POST /api/ghost/file-watcher/crawl
    if (pathname === '/api/ghost/file-watcher/crawl' && req.method === 'POST') {
      this.fileWatcher.crawlAll().then((stats) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, stats }));
      }).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
      return true;
    }

    // 9. Hardware Profile API: GET /api/ghost/hardware-profile
    if (pathname === '/api/ghost/hardware-profile' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true, profile: this.hardwareProfiler.getProfile() }));
    }

    return false; // Handled by standard web routes
  }

  getStatus() {
    return {
      name: this.name,
      version: this.version,
      identity: 'Ghost AI Core Sovereign Agent OS',
      protocols: {
        mcp: { active: true, toolsCount: this.mcpServer.tools.size, resourcesCount: this.mcpServer.resources.size },
        ag_ui: { active: true, subscriberCount: this.agui.subscribers.size },
        a2ui: { active: true },
        a2a: { active: true, subagentsCount: this.a2a.subagents.size },
      },
      search: {
        documentsIndexed: this.search.documents.size,
        invertedTermsCount: this.search.invertedIndex.size,
      },
      fileWatcher: this.fileWatcher.getStats(),
      hardwareProfile: this.hardwareProfiler.getProfile(),
      security: {
        posture: this.security.posture,
        auditCount: this.security.auditLog.length,
      },
    };
  }
}

let instance = null;

function getGhostAICore(options) {
  if (!instance) {
    instance = new GhostAICore(options);
  }
  return instance;
}

module.exports = {
  GhostAICore,
  getGhostAICore,
};
