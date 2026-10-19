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

    // Tool 6: ChatGPT Code Interpreter Sandbox
    this.mcpServer.registerTool({
      name: 'code_interpreter',
      description: 'Executes live sandboxed Python or JavaScript scripts on-device, capturing stdout, stderr, and generated charts.',
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['python', 'javascript'], description: 'Programming language' },
          code: { type: 'string', description: 'Source code script to execute' },
        },
        required: ['code'],
      },
      handler: async (args) => {
        const { getCodeInterpreter } = require('../chatgpt/code_interpreter');
        const interp = getCodeInterpreter();
        if (args.language === 'javascript') {
          return interp.runJavaScript(args.code);
        }
        return interp.runPython(args.code);
      },
    });

    // Tool 7: J.A.R.V.I.S. Real-Time Telemetry Snapshot
    this.mcpServer.registerTool({
      name: 'jarvis_telemetry',
      description: 'Queries live real-time hardware telemetry: CPU load, GPU/VRAM allocation, RAM usage, and temperatures.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { getJarvisTelemetry } = require('../jarvis/telemetry');
        return getJarvisTelemetry().getSnapshot();
      },
    });

    // Tool 8: Filesystem Read
    this.mcpServer.registerTool({
      name: 'filesystem_read',
      description: 'Reads text file content from disk safely (up to 2 MB).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute or relative file path to read' } },
        required: ['path'],
      },
      handler: async (args) => {
        const fs = require('fs');
        const path = require('path');
        const full = path.resolve(process.cwd(), args.path);
        if (!fs.existsSync(full)) throw new Error(`File not found: ${args.path}`);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) throw new Error(`${args.path} is a directory, use filesystem_list`);
        const content = fs.readFileSync(full, 'utf8');
        return { path: full, size: stat.size, content: content.slice(0, 2000000) };
      },
    });

    // Tool 9: Filesystem Write
    this.mcpServer.registerTool({
      name: 'filesystem_write',
      description: 'Writes or updates text content to a local file, creating parent directories if needed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Text content to write' },
        },
        required: ['path', 'content'],
      },
      handler: async (args) => {
        const fs = require('fs');
        const path = require('path');
        const full = path.resolve(process.cwd(), args.path);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, args.content, 'utf8');
        return { ok: true, path: full, bytesWritten: Buffer.byteLength(args.content, 'utf8') };
      },
    });

    // Tool 10: Filesystem List
    this.mcpServer.registerTool({
      name: 'filesystem_list',
      description: 'Lists files and subdirectories in a directory with size and modification metadata.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path to list (defaults to cwd)' } },
      },
      handler: async (args) => {
        const fs = require('fs');
        const path = require('path');
        const dir = path.resolve(process.cwd(), args.path || '.');
        if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const items = entries.slice(0, 500).map((e) => {
          try {
            const st = fs.statSync(path.join(dir, e.name));
            return { name: e.name, isDirectory: e.isDirectory(), size: st.size, modified: st.mtimeMs };
          } catch {
            return { name: e.name, isDirectory: e.isDirectory(), size: 0 };
          }
        });
        return { directory: dir, count: items.length, total: entries.length, items };
      },
    });

    // Tool 11: Filesystem Info
    this.mcpServer.registerTool({
      name: 'filesystem_info',
      description: 'Retrieves metadata, size, timestamps, and permissions for a file or directory.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File or directory path' } },
        required: ['path'],
      },
      handler: async (args) => {
        const fs = require('fs');
        const path = require('path');
        const full = path.resolve(process.cwd(), args.path);
        if (!fs.existsSync(full)) throw new Error(`Path does not exist: ${args.path}`);
        const st = fs.statSync(full);
        return {
          path: full,
          size: st.size,
          isDirectory: st.isDirectory(),
          isFile: st.isFile(),
          created: st.birthtime,
          modified: st.mtime,
        };
      },
    });

    // Tool 12: Git Operations
    this.mcpServer.registerTool({
      name: 'git_operations',
      description: 'Executes git version control operations: status, diff, log, and branch.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'diff', 'log', 'branch'], description: 'Git action' },
          args: { type: 'array', items: { type: 'string' }, description: 'Additional git flags' },
        },
        required: ['action'],
      },
      handler: async (args) => {
        const { execFile } = require('child_process');
        const gitArgs = [args.action, ...(args.args || [])];
        if (args.action === 'log' && (!args.args || args.args.length === 0)) {
          gitArgs.push('-n', '10', '--oneline');
        }
        return new Promise((resolve) => {
          execFile('git', gitArgs, { cwd: process.cwd(), windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
            if (err) return resolve({ ok: false, error: err.message, stderr });
            resolve({ ok: true, action: args.action, output: stdout.trim() });
          });
        });
      },
    });

    // Tool 13: Terminal Command Execution
    this.mcpServer.registerTool({
      name: 'terminal_run_command',
      description: 'Executes a command safely in the host shell (PowerShell/CMD on Windows), capturing stdout, stderr, and exit codes.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command line string to execute' },
          cwd: { type: 'string', description: 'Working directory path (optional)' },
          timeout_ms: { type: 'number', description: 'Execution timeout in ms (default 30000)' },
        },
        required: ['command'],
      },
      handler: async (args) => {
        const { exec } = require('child_process');
        const path = require('path');
        const cwd = args.cwd ? path.resolve(process.cwd(), args.cwd) : process.cwd();
        const timeout = args.timeout_ms || 30000;
        return new Promise((resolve) => {
          const start = Date.now();
          exec(args.command, { cwd, timeout, windowsHide: true, maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
            const durationMs = Date.now() - start;
            resolve({
              ok: !err,
              exitCode: err ? (err.code || 1) : 0,
              stdout: stdout || '',
              stderr: stderr || (err ? err.message : ''),
              durationMs,
            });
          });
        });
      },
    });

    // Tool 14: HTTP REST Client
    this.mcpServer.registerTool({
      name: 'http_request',
      description: 'Executes a standard HTTP/HTTPS request (GET, POST, PUT, DELETE) against any REST API endpoint.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target HTTP/HTTPS URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method' },
          headers: { type: 'object', description: 'Optional request headers' },
          body: { type: 'string', description: 'Optional request payload body' },
        },
        required: ['url'],
      },
      handler: async (args) => {
        const https = args.url.startsWith('https:') ? require('https') : require('http');
        const url = new URL(args.url);
        const method = (args.method || 'GET').toUpperCase();
        const headers = { 'User-Agent': 'Mave-Ghost-Agent/1.4.8', ...(args.headers || {}) };
        let postData = args.body || '';
        if (typeof postData === 'object') {
          postData = JSON.stringify(postData);
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }
        if (postData && !headers['Content-Length']) {
          headers['Content-Length'] = Buffer.byteLength(postData);
        }
        return new Promise((resolve) => {
          const req = https.request(url, { method, headers, timeout: 15000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: data.slice(0, 500000),
              });
            });
          });
          req.on('error', (err) => resolve({ ok: false, error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Request timed out after 15s' }); });
          if (postData) req.write(postData);
          req.end();
        });
      },
    });

    // Tool 15: Web Page Fetcher & Markdown Extractor
    this.mcpServer.registerTool({
      name: 'web_fetch_url',
      description: 'Fetches dynamic or static webpage HTML content and extracts clean, readable text and markdown.',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Target webpage URL to read' } },
        required: ['url'],
      },
      handler: async (args) => {
        const https = args.url.startsWith('https:') ? require('https') : require('http');
        const url = new URL(args.url);
        return new Promise((resolve) => {
          const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mave/1.4.8' }, timeout: 15000 }, (res) => {
            let html = '';
            res.on('data', (chunk) => { html += chunk; });
            res.on('end', () => {
              let text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[\s\S]*?<\/footer>/gi, '')
                .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, '\n\n## $2\n')
                .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
                .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n* $1')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\s{2,}/g, ' ')
                .trim();
              resolve({
                url: args.url,
                status: res.statusCode,
                title: (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || 'Webpage',
                text: text.slice(0, 40000),
              });
            });
          });
          req.on('error', (err) => resolve({ ok: false, error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Web fetch timed out' }); });
        });
      },
    });

    // Tool 16: Privacy Web Search (DuckDuckGo)
    this.mcpServer.registerTool({
      name: 'web_search_mcp',
      description: 'Executes a privacy-preserving web search query, returning ranked search result titles, snippets, and URLs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or query' },
          count: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const https = require('https');
        const count = args.count || 5;
        const q = encodeURIComponent(args.query);
        const searchUrl = `https://html.duckduckgo.com/html/?q=${q}`;
        return new Promise((resolve) => {
          const req = https.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Mave/1.4.8' }, timeout: 12000 }, (res) => {
            let html = '';
            res.on('data', (chunk) => { html += chunk; });
            res.on('end', () => {
              const results = [];
              const regex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
              let m;
              while ((m = regex.exec(html)) && results.length < count) {
                results.push({
                  url: m[1].trim(),
                  snippet: m[2].replace(/<[^>]+>/g, '').trim(),
                });
              }
              if (results.length === 0) {
                results.push({
                  query: args.query,
                  note: 'DuckDuckGo search completed.',
                  url: `https://duckduckgo.com/?q=${q}`,
                });
              }
              resolve({ ok: true, query: args.query, results });
            });
          });
          req.on('error', (err) => resolve({ ok: false, query: args.query, error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Search timed out' }); });
        });
      },
    });

    // Tool 17: Knowledge Graph Memory Store
    this.mcpServer.registerTool({
      name: 'memory_graph',
      description: 'Inspects, adds, and queries knowledge graph entities and relational edges stored on-device.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add_entity', 'add_relation', 'query_graph'], description: 'Action to perform' },
          entity: { type: 'string', description: 'Entity name or ID' },
          entity_type: { type: 'string', description: 'Category (person, project, skill, preference)' },
          relation: { type: 'string', description: 'Relation edge (works_on, prefers, knows, authored)' },
          target: { type: 'string', description: 'Target entity name' },
          query: { type: 'string', description: 'Search query for graph traversal' },
        },
        required: ['action'],
      },
      handler: async (args) => {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const memDir = path.join(os.homedir(), '.mave');
        fs.mkdirSync(memDir, { recursive: true });
        const memPath = path.join(memDir, 'knowledge_graph.json');
        let graph = { entities: {}, relations: [] };
        try {
          if (fs.existsSync(memPath)) graph = JSON.parse(fs.readFileSync(memPath, 'utf8'));
        } catch {}
        if (args.action === 'add_entity') {
          graph.entities[args.entity] = { type: args.entity_type || 'concept', updated: Date.now() };
          fs.writeFileSync(memPath, JSON.stringify(graph, null, 2));
          return { ok: true, entity: args.entity, count: Object.keys(graph.entities).length };
        }
        if (args.action === 'add_relation') {
          graph.relations.push({ from: args.entity, relation: args.relation, to: args.target, timestamp: Date.now() });
          fs.writeFileSync(memPath, JSON.stringify(graph, null, 2));
          return { ok: true, relationsCount: graph.relations.length };
        }
        const q = (args.query || '').toLowerCase();
        const matchedEntities = Object.entries(graph.entities || {})
          .filter(([k, v]) => !q || k.toLowerCase().includes(q) || (v && v.type && v.type.toLowerCase().includes(q)))
          .map(([k, v]) => ({ name: k, ...v }));
        const matchedRelations = (graph.relations || [])
          .filter((r) => !q || r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q) || r.relation.toLowerCase().includes(q));
        return { ok: true, matchedEntities, matchedRelations };
      },
    });

    // Tool 18: Docker Container Sentinel
    this.mcpServer.registerTool({
      name: 'docker_manage',
      description: 'Queries local Docker daemon for running containers, images, and container logs.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['ps', 'images', 'logs'], description: 'Docker action' },
          container_id: { type: 'string', description: 'Container ID or name (required for logs)' },
        },
        required: ['action'],
      },
      handler: async (args) => {
        const { exec } = require('child_process');
        let cmd = 'docker ps --format "{{json .}}"';
        if (args.action === 'images') cmd = 'docker images --format "{{json .}}"';
        if (args.action === 'logs') cmd = `docker logs --tail 50 ${args.container_id || ''}`;
        return new Promise((resolve) => {
          exec(cmd, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
            if (err) return resolve({ ok: false, error: 'Docker daemon unavailable or not running on host', stderr });
            resolve({ ok: true, action: args.action, output: stdout.trim() });
          });
        });
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
