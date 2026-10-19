'use strict';
// Model Context Protocol (MCP) Hub & Ecosystem Plugin for Mave.
// Bridges the agent to the entire universe of MCP servers and tools:
// Filesystem, Git/GitHub, SQLite, Terminal, REST Fetch, Memory Graph, Docker, Brave Search, etc.

const { getGhostAICore } = require('../../ghost_core');

module.exports = [
  {
    name: 'mcp_call_tool',
    description: 'Execute any Model Context Protocol (MCP) tool registered in the sovereign agent runtime by tool name and arguments.',
    input_schema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'The exact name of the MCP tool to invoke (e.g. "filesystem_read", "filesystem_write", "filesystem_list", "git_operations", "terminal_run_command", "http_request", "web_fetch_url", "web_search_mcp", "memory_graph", "docker_manage", "code_interpreter", "jarvis_telemetry").',
        },
        arguments: {
          type: 'object',
          description: 'Key-value dictionary of arguments required by the target MCP tool.',
        },
      },
      required: ['tool_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Invoking MCP tool "${input.tool_name}"...`);
      const core = getGhostAICore();
      const tool = core.mcpServer.tools.get(input.tool_name);
      if (!tool) {
        const available = Array.from(core.mcpServer.tools.keys()).join(', ');
        return `❌ MCP tool "${input.tool_name}" not found. Available MCP tools in Mave: ${available}`;
      }

      try {
        const res = await tool.handler(input.arguments || {}, { server: core.mcpServer });
        return typeof res === 'string' ? res : JSON.stringify(res, null, 2);
      } catch (err) {
        return `❌ MCP tool execution error: ${err.message}`;
      }
    },
  },

  {
    name: 'mcp_list_tools',
    description: 'Lists all available Model Context Protocol (MCP) tools, their schemas, and descriptions.',
    input_schema: {
      type: 'object',
      properties: {
        filter_category: {
          type: 'string',
          description: 'Optional category or keyword to filter tools (e.g. "file", "git", "web", "telemetry").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const core = getGhostAICore();
      const filter = (input.filter_category || '').toLowerCase();
      const tools = Array.from(core.mcpServer.tools.values())
        .filter((t) => !filter || t.name.toLowerCase().includes(filter) || t.description.toLowerCase().includes(filter))
        .map((t) => `• **${t.name}**: ${t.description}`);

      return `🔌 **MAVE SOVEREIGN MCP TOOLS (${tools.length} active)**:\n${tools.join('\n')}`;
    },
  },

  {
    name: 'mcp_server_catalog',
    description: 'Browse the curated Model Context Protocol (MCP) Server App Store / Catalog with ready-to-run packages.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const core = getGhostAICore();
      const catalog = core.mcpClientManager.getCatalog();
      const summary = catalog.map((c) => `• **${c.name}** [${c.category}] - ${c.description}\n  ID: \`${c.id}\` | Status: ${c.installed ? '✅ Connected' : '⚪ Available'} | Command: \`${c.command}\``).join('\n\n');

      return `📦 **MAVE MCP SERVER APP STORE (${catalog.length} servers)**:\n\n${summary}`;
    },
  },

  {
    name: 'mcp_connect_server',
    description: 'Connect or install a Model Context Protocol (MCP) server from the catalog by ID.',
    input_schema: {
      type: 'object',
      properties: {
        server_id: {
          type: 'string',
          description: 'The MCP server catalog identifier (e.g. "filesystem", "github", "sqlite", "docker", "brave-search", "puppeteer", "postgres").',
        },
      },
      required: ['server_id'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const core = getGhostAICore();
      const res = core.mcpClientManager.installServer(input.server_id);
      if (!res.ok) {
        return `❌ Could not connect MCP server "${input.server_id}": ${res.message}`;
      }
      ctx.log('info', `MCP Server "${res.server.name}" connected successfully.`);
      return `✅ **MCP Server Connected**:
• Name: **${res.server.name}**
• Category: ${res.server.category}
• Protocol: Model Context Protocol 2024-11-05
• Command: \`${res.server.command}\``;
    },
  },
];
