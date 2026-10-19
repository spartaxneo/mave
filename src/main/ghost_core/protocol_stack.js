'use strict';
// Ghost AI Core Protocol Stack: MCP (Client & Server), AG-UI, A2UI, A2A
// Implements the Complete 2026 Agent Protocol Stack for Mave Private Agent OS.

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MCP_PROTOCOL_VERSION = '2024-11-05';

// Curated MCP Server Catalog (App Store format)
const DEFAULT_MCP_CATALOG = [
  {
    id: 'filesystem',
    name: 'Filesystem MCP Server',
    description: 'Secure local file operations with strict directory sandboxing.',
    category: 'System & Storage',
    command: 'npx -y @modelcontextprotocol/server-filesystem',
    installed: true,
    author: 'Anthropic Official',
  },
  {
    id: 'sqlite',
    name: 'SQLite Database Explorer',
    description: 'Query, inspect schemas, and manage local SQLite databases with zero cloud leaks.',
    category: 'Data & Analytics',
    command: 'npx -y @modelcontextprotocol/server-sqlite',
    installed: true,
    author: 'Model Context Protocol',
  },
  {
    id: 'github',
    name: 'GitHub Agent Connector',
    description: 'Inspect repositories, create pull requests, manage issues and branches.',
    category: 'Developer Tools',
    command: 'npx -y @modelcontextprotocol/server-github',
    installed: true,
    author: 'GitHub Inc.',
  },
  {
    id: 'puppeteer',
    name: 'Headless Browser Automation',
    description: 'Scrape dynamic web pages, generate PDFs, and capture full-page web screenshots.',
    category: 'Web & Scraping',
    command: 'npx -y @modelcontextprotocol/server-puppeteer',
    installed: true,
    author: 'Browser Tools',
  },
  {
    id: 'brave-search',
    name: 'Brave Privacy Search',
    description: 'Perform web and news searches with privacy-preserving indexing.',
    category: 'Search & Research',
    command: 'npx -y @modelcontextprotocol/server-brave-search',
    installed: true,
    author: 'Brave Software',
  },
  {
    id: 'memory-graph',
    name: 'Knowledge Graph Memory',
    description: 'Persistent knowledge graph store for entity relationships and user memory.',
    category: 'Memory & RAG',
    command: 'npx -y @modelcontextprotocol/server-memory',
    installed: true,
    author: 'Model Context Protocol',
  },
  {
    id: 'terminal',
    name: 'Terminal & Command Runner',
    description: 'Safely execute host shell commands, monitor background processes, and stream output.',
    category: 'System & Execution',
    command: 'npx -y @modelcontextprotocol/server-terminal',
    installed: true,
    author: 'Mave Core',
  },
  {
    id: 'fetch',
    name: 'REST HTTP API Fetcher',
    description: 'Universal HTTP/HTTPS client for REST API endpoints with authentication and JSON formatting.',
    category: 'Networking & APIs',
    command: 'npx -y @modelcontextprotocol/server-fetch',
    installed: true,
    author: 'Model Context Protocol',
  },
  {
    id: 'docker',
    name: 'Docker Container Sentinel',
    description: 'Monitor container status, inspect container logs, and query local images.',
    category: 'DevOps & Containers',
    command: 'npx -y @modelcontextprotocol/server-docker',
    installed: true,
    author: 'Docker Inc.',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Enterprise Connector',
    description: 'Inspect schemas, read tables, and run read-only queries on PostgreSQL databases.',
    category: 'Data & Analytics',
    command: 'npx -y @modelcontextprotocol/server-postgres',
    installed: true,
    author: 'Model Context Protocol',
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace Bridge',
    description: 'Access Google Calendar events, search Gmail messages, and retrieve Google Docs.',
    category: 'Productivity & Office',
    command: 'npx -y @modelcontextprotocol/server-google-workspace',
    installed: true,
    author: 'Google Cloud Tools',
  },
  {
    id: 'slack',
    name: 'Slack Team Communications',
    description: 'Read channels, inspect thread discussions, and post formatted team updates.',
    category: 'Team Collaboration',
    command: 'npx -y @modelcontextprotocol/server-slack',
    installed: true,
    author: 'Slack Technologies',
  },
  {
    id: 'sentry',
    name: 'Sentry Crash Telemetry',
    description: 'Retrieve real-time application crash reports, error stack traces, and issue frequencies.',
    category: 'Observability & Logs',
    command: 'npx -y @modelcontextprotocol/server-sentry',
    installed: true,
    author: 'Sentry.io',
  },
  {
    id: 'obsidian',
    name: 'Obsidian Knowledge Vault',
    description: 'Full-text search, backlinks discovery, and note extraction across Obsidian vaults.',
    category: 'Personal Knowledge',
    command: 'npx -y @modelcontextprotocol/server-obsidian',
    installed: true,
    author: 'Obsidian Community',
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant Smart Home',
    description: 'Query smart home state, monitor temperature/motion sensors, and trigger home scenes.',
    category: 'IoT & Smart Home',
    command: 'npx -y @modelcontextprotocol/server-home-assistant',
    installed: true,
    author: 'Home Assistant Foundation',
  },
  {
    id: 'code-interpreter',
    name: 'ChatGPT Python 3.14 Sandbox',
    description: 'On-device execution of Python/JS scripts with automatic matplotlib plot extraction.',
    category: 'AI & Execution',
    command: 'mave/server-code-interpreter',
    installed: true,
    author: 'Mave Sovereign OS',
  },
  {
    id: 'jarvis-telemetry',
    name: 'J.A.R.V.I.S. Hardware Sentinel',
    description: 'Live hardware telemetry for AMD Ryzen CPU, NVIDIA RTX 5060 GPU, VRAM, and RAM.',
    category: 'Hardware & Diagnostics',
    command: 'mave/server-jarvis-telemetry',
    installed: true,
    author: 'Stark Industries Protocol',
  },
  {
    id: 'notion',
    name: 'Notion Workspace Connector',
    description: 'Search Notion databases, manage task items, and read structured workspace pages.',
    category: 'Productivity & Office',
    command: 'npx -y @modelcontextprotocol/server-notion',
    installed: true,
    author: 'Notion Labs',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Model Context Protocol (MCP) Server & Client
// ═══════════════════════════════════════════════════════════════════════════

class MCPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'Mave Ghost AI Core';
    this.version = options.version || '1.4.8';
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this._initBuiltinResources();
  }

  _initBuiltinResources() {
    this.registerResource({
      uri: 'mave://system/info',
      name: 'Mave System Information',
      description: 'Host device status, local inference state, and sentinel metrics.',
      mimeType: 'application/json',
      read: async () => JSON.stringify({
        os: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        node: process.version,
        engine: 'Ghost AI Core 1.4.8',
      }, null, 2),
    });
  }

  registerTool(tool) {
    if (!tool || !tool.name) return;
    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
      handler: tool.handler || tool.run,
    });
  }

  registerResource(resource) {
    if (!resource || !resource.uri) return;
    this.resources.set(resource.uri, resource);
  }

  registerPrompt(prompt) {
    if (!prompt || !prompt.name) return;
    this.prompts.set(prompt.name, prompt);
  }

  /**
   * Handles an incoming JSON-RPC 2.0 MCP Request.
   */
  async handleJsonRpc(payload) {
    if (!payload || payload.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: payload ? payload.id : null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be 2.0' } };
    }

    const { id, method, params } = payload;

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: true, listChanged: true },
                prompts: { listChanged: true },
                logging: {},
              },
              serverInfo: {
                name: this.name,
                version: this.version,
              },
            },
          };

        case 'notifications/initialized':
          this.emit('client_initialized', params);
          return null; // Notifications don't return response

        case 'tools/list': {
          const toolList = Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
          return { jsonrpc: '2.0', id, result: { tools: toolList } };
        }

        case 'tools/call': {
          if (!params || !params.name) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name parameter' } };
          }
          const tool = this.tools.get(params.name);
          if (!tool) {
            return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${params.name}` } };
          }
          const result = await tool.handler(params.arguments || {}, { server: this });
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        case 'resources/list': {
          const resList = Array.from(this.resources.values()).map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType || 'text/plain',
          }));
          return { jsonrpc: '2.0', id, result: { resources: resList } };
        }

        case 'resources/read': {
          if (!params || !params.uri) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing resource uri parameter' } };
          }
          const res = this.resources.get(params.uri);
          if (!res) {
            return { jsonrpc: '2.0', id, error: { code: -32601, message: `Resource not found: ${params.uri}` } };
          }
          const content = await res.read();
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri: res.uri,
                  mimeType: res.mimeType || 'text/plain',
                  text: typeof content === 'string' ? content : JSON.stringify(content),
                },
              ],
            },
          };
        }

        case 'prompts/list': {
          const promptList = Array.from(this.prompts.values()).map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments || [],
          }));
          return { jsonrpc: '2.0', id, result: { prompts: promptList } };
        }

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not implemented: ${method}` } };
      }
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32603, message: `Internal error: ${err.message}` } };
    }
  }
}

class MCPClientManager extends EventEmitter {
  constructor() {
    super();
    this.catalog = [...DEFAULT_MCP_CATALOG];
    this.activeClients = new Map();
  }

  getCatalog() {
    return this.catalog;
  }

  installServer(id) {
    const item = this.catalog.find((c) => c.id === id);
    if (!item) return { ok: false, message: 'Server not found in catalog' };
    item.installed = true;
    return { ok: true, server: item };
  }

  uninstallServer(id) {
    const item = this.catalog.find((c) => c.id === id);
    if (!item) return { ok: false, message: 'Server not found in catalog' };
    item.installed = false;
    return { ok: true, server: item };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. AG-UI (Agent-User Interaction Protocol) Streaming Runtime
// ═══════════════════════════════════════════════════════════════════════════

class AGUIRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.windows = options.windows || null;
    this.subscribers = new Set();
  }

  setWindows(windows) {
    this.windows = windows;
  }

  addSubscriber(res) {
    this.subscribers.add(res);
    res.on('close', () => this.subscribers.delete(res));
  }

  /**
   * Emits a standard AG-UI protocol event to all connected UI clients.
   * Event types:
   * agent_start, thought_stream, tool_call_start, tool_call_args, tool_call_result,
   * ui_render, confirm_request, confirm_resolved, step_complete, agent_done, agent_error
   */
  broadcast(eventType, payload = {}) {
    const event = {
      protocol: 'ag-ui',
      version: '1.0',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: eventType,
      payload,
    };

    this.emit(eventType, event);

    if (this.windows && this.windows.broadcast) {
      try {
        if (eventType === 'ui_render') {
          this.windows.broadcast('ghost:a2ui', payload);
        } else if (eventType === 'thought_stream') {
          this.windows.broadcast('ghost:thought', payload);
        }
      } catch {}
    }

    const sseMessage = `event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.subscribers) {
      try {
        res.write(sseMessage);
      } catch {
        this.subscribers.delete(res);
      }
    }
    return event;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. A2UI (Agent-to-UI Generative Component Protocol)
// ═══════════════════════════════════════════════════════════════════════════

const A2UI = {
  card(title, subtitle, badgeText = '', badgeColor = '#10b981') {
    return {
      component: 'Card',
      title,
      subtitle,
      badge: badgeText ? { text: badgeText, color: badgeColor } : null,
    };
  },

  metricGrid(metrics = []) {
    return {
      component: 'MetricGrid',
      metrics: metrics.map((m) => ({
        label: m.label,
        value: m.value,
        trend: m.trend || null,
        color: m.color || '#60a5fa',
      })),
    };
  },

  interactiveTable(headers = [], rows = []) {
    return {
      component: 'Table',
      headers,
      rows,
    };
  },

  actionButtons(buttons = []) {
    return {
      component: 'ActionButtons',
      actions: buttons.map((b) => ({
        id: b.id || b.label.toLowerCase().replace(/\s+/g, '_'),
        label: b.label,
        action: b.action,
        variant: b.variant || 'secondary',
      })),
    };
  },

  /** Renders A2UI structured component tree into clean native HTML */
  toHtml(component) {
    if (!component) return '';
    switch (component.component) {
      case 'Card':
        return `
          <div class="a2ui-card" style="background:var(--surface-2); border:1px solid var(--hairline); border-radius:12px; padding:14px; margin:8px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0; font-size:14px; font-weight:700; color:var(--text-1);">${component.title}</h4>
              ${component.badge ? `<span class="badge" style="background:${component.badge.color}22; color:${component.badge.color}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${component.badge.text}</span>` : ''}
            </div>
            ${component.subtitle ? `<p style="margin:4px 0 0; font-size:12px; color:var(--text-2);">${component.subtitle}</p>` : ''}
          </div>
        `;

      case 'MetricGrid':
        return `
          <div class="a2ui-metrics" style="display:grid; grid-template-columns:repeat(${Math.min(component.metrics.length, 4)}, 1fr); gap:8px; margin:8px 0;">
            ${component.metrics.map((m) => `
              <div style="background:var(--surface-2); border:1px solid var(--hairline); border-radius:8px; padding:10px; text-align:center;">
                <div style="font-size:10px; font-weight:700; color:var(--text-3); text-transform:uppercase;">${m.label}</div>
                <div style="font-size:16px; font-weight:800; color:${m.color}; margin-top:2px;">${m.value}</div>
              </div>
            `).join('')}
          </div>
        `;

      case 'Table':
        return `
          <div style="overflow-x:auto; margin:8px 0;">
            <table class="a2ui-table" style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--hairline); color:var(--text-3);">
                  ${component.headers.map((h) => `<th style="padding:6px 10px;">${h}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${component.rows.map((r) => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                    ${r.map((cell) => `<td style="padding:6px 10px; color:var(--text-1);">${cell}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

      case 'ActionButtons':
        return `
          <div class="a2ui-actions" style="display:flex; flex-wrap:wrap; gap:8px; margin:8px 0;">
            ${component.actions.map((b) => `
              <button type="button" class="btn ${b.variant} small a2ui-btn a2ui-action-btn" data-action="${b.action}" data-action-id="${b.id}">${b.label}</button>
            `).join('')}
          </div>
        `;

      default:
        return '';
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. A2A (Agent-to-Agent Protocol & Discovery Card)
// ═══════════════════════════════════════════════════════════════════════════

class A2AEngine {
  constructor(options = {}) {
    this.name = options.name || 'Mave';
    this.version = options.version || '1.4.8';
    this.subagents = new Map();
    this._registerDefaultSubagents();
  }

  _registerDefaultSubagents() {
    this.subagents.set('researcher', {
      id: 'researcher',
      name: 'Web & Document Researcher',
      description: 'Gathers deep research across web, local documents, and knowledge vault.',
      skills: ['web_search', 'read_url', 'pdf_index', 'rag_query'],
    });

    this.subagents.set('coder', {
      id: 'coder',
      name: 'Full-Stack Software Engineer',
      description: 'Generates, edits, tests, and debugs code across frontend and backend systems.',
      skills: ['edit_file', 'run_command', 'git_commit', 'syntax_check'],
    });

    this.subagents.set('sentinel', {
      id: 'sentinel',
      name: 'Autonomous Sensory Sentinel',
      description: 'Monitors network connectivity, desktop activity, and incoming communications.',
      skills: ['network_probe', 'activity_tracking', 'message_listen'],
    });

    this.subagents.set('household', {
      id: 'household',
      name: 'Ghost AI Core Household Guardian',
      description: 'Controls smart appliances, room air quality, chores, and emergency safety dispatch.',
      skills: ['appliance_control', 'hazard_audit', 'emergency_dispatch'],
    });
  }

  /**
   * Generates standard /.well-known/agent.json Agent Card
   */
  getAgentCard() {
    return {
      name: this.name,
      identity: 'Ghost AI Core Sovereign Agent OS',
      version: this.version,
      description: 'Private, on-device AI Agent OS with complete 2026 agent protocol stack (MCP, AG-UI, A2UI, A2A).',
      protocols: {
        mcp: {
          version: MCP_PROTOCOL_VERSION,
          transport: 'http_sse_stdio',
          endpoint: '/mcp',
          sseEndpoint: '/mcp/sse',
        },
        ag_ui: {
          version: '1.0',
          endpoint: '/ag-ui/stream',
        },
        a2ui: {
          version: '1.0',
        },
        a2a: {
          version: '1.0',
          endpoint: '/a2a/delegate',
        },
      },
      capabilities: [
        'local_inference',
        'mcp_server',
        'mcp_client',
        'hybrid_search_rrf',
        'spatial_point_and_ask',
        'household_automation',
        'mesh_distributed_co_processor',
        'mavedrop_lan_sync',
      ],
      subagents: Array.from(this.subagents.values()),
      auth: {
        type: 'pin_or_bearer',
        admin_pin_required: true,
      },
    };
  }

  async delegateTask(subagentId, taskDescription, ctx = {}) {
    const sub = this.subagents.get(subagentId);
    if (!sub) throw new Error(`Subagent not found: ${subagentId}`);
    return {
      ok: true,
      subagent: sub.name,
      task: taskDescription,
      status: 'dispatched',
      timestamp: Date.now(),
    };
  }
}

module.exports = {
  MCPServer,
  MCPClientManager,
  AGUIRuntime,
  A2UI,
  A2AEngine,
  DEFAULT_MCP_CATALOG,
};
