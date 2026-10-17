'use strict';
// Sovereign Screen Memory ("Total Recall") Plugin for Bigfoot.
// Allows Bigfoot to recall any document, article, code snippet, or conversation
// that has previously appeared on your monitors, 100% locally with zero cloud telemetry.

const { getScreenMemoryStore } = require('../../memory/screen_memory');

module.exports = [
  {
    name: 'search_screen_memory',
    description: 'Search historical screen snapshots and on-screen text memory (Total Recall) to find past articles, code snippets, price tables, or conversations seen on your display.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword, topic, or phrase to find in screen history (e.g. "pricing", "docker run", "invoice").',
        },
        app_filter: {
          type: 'string',
          description: 'Optional application name to narrow search (e.g. "chrome", "code", "spotify").',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of historical moments to return (default: 5).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `Searching local screen memory for "${input.query}"...`);
      const store = getScreenMemoryStore();
      const results = store.search(input.query, input.app_filter, input.limit || 5);

      if (results.length === 0) {
        return `🔍 **No Screen Memory Matches Found**: No recorded moments matching "${input.query}"${input.app_filter ? ` in ${input.app_filter}` : ''}.`;
      }

      const rows = results.map((r, idx) => {
        const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(r.timestamp).toLocaleDateString();
        return `**${idx + 1}. [${r.appName}]** (${date} at ${time})\n  • Window: *${r.windowTitle}*\n  • Content Snippet: \`${r.extractedText.slice(0, 150)}\``;
      }).join('\n\n');

      return `🧠 **TOTAL RECALL: FOUND ${results.length} MATCHING SCREEN MOMENTS**:\n\n${rows}`;
    },
  },
  {
    name: 'capture_screen_memory_snapshot',
    description: 'Take an immediate perceptual snapshot of the active application window and index its content into local screen memory for future recall.',
    input_schema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: 'Optional manual annotation or tag to associate with this snapshot.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'Indexing active screen window into sovereign memory...');
      const store = getScreenMemoryStore();
      const record = await store.captureSnapshot();

      return `📸 **Indexed Active Window into Memory**:
• App: **${record.appName}**
• Title: *${record.windowTitle}*
• Timestamp: ${new Date(record.timestamp).toLocaleTimeString()}
${input.note ? `• Tag: ${input.note}` : ''}`;
    },
  },
  {
    name: 'get_screen_memory_timeline',
    description: 'Get an aggregated summary timeline of desktop activity, applications used, and tasks worked on for a specific day.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Target date in YYYY-MM-DD format (defaults to today).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const store = getScreenMemoryStore();
      const { date, timeline } = store.getTimeline(input.date);

      if (!timeline.length) {
        return `📅 **No Activity Timeline for ${date}**: No active window snapshots recorded for this date.`;
      }

      const rows = timeline.map((b) =>
        `• **${b.startTime} - ${b.endTime}**: **${b.appName}** (*${b.title.slice(0, 60)}*)`
      ).join('\n');

      return `📅 **DESKTOP ACTIVITY TIMELINE (${date})**:\n\n${rows}`;
    },
  },
];
