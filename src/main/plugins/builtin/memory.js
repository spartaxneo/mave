'use strict';
// Long-term memory plugin for Bigfoot.
// Gives Bigfoot continuous persistent memory of facts, preferences, habits,
// and instructions that survive across reboots and conversations.

const { getMemoryStore } = require('../../memory');

module.exports = [
  {
    name: 'remember_fact',
    description: 'Store a permanent fact, user preference, workflow rule, or note into your long-term memory so you remember it across sessions and restarts.',
    input_schema: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'The fact or user preference to remember (e.g. "User prefers dark mode", "Work project repository is at C:\\dev\\myapp").',
        },
        topic: {
          type: 'string',
          enum: ['preference', 'project', 'habit', 'rule', 'contact', 'research', 'knowledge', 'general'],
          description: 'Category for the memory (default "general").',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional keywords or tags to make searching faster.',
        },
      },
      required: ['fact'],
    },
    async run(input, ctx) {
      const store = getMemoryStore();
      const item = store.remember(input.fact, { topic: input.topic || 'general', keywords: input.keywords });
      ctx.log('info', `Remembered: "${item.fact}" [${item.topic}]`);
      return `Stored in long-term memory (${item.topic}): "${item.fact}". I will remember this in future conversations.`;
    },
  },
  {
    name: 'recall_memory',
    description: 'Search long-term memory for previously learned facts, user preferences, past instructions, or project notes.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for in your memory.',
        },
        topic: {
          type: 'string',
          description: 'Optional topic to restrict the search to.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return (default 5).',
        },
      },
      required: ['query'],
    },
    async run(input, ctx) {
      const store = getMemoryStore();
      const results = store.recall(input.query, { topic: input.topic, limit: Number(input.limit) || 5 });
      if (!results.length) {
        return `Searched long-term memory for "${input.query}": no matching memories found.`;
      }
      ctx.log('info', `Recalled ${results.length} memories for "${input.query}"`);
      const formatted = results.map((m) => `• [${m.topic}] ${m.fact} (ID: ${m.id})`).join('\n');
      return `Found ${results.length} relevant memories in long-term memory:\n${formatted}`;
    },
  },
  {
    name: 'list_memories',
    description: 'List all facts, user preferences, and notes currently stored in your long-term memory.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Optional topic filter (e.g. "preference", "project", "habit").',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const store = getMemoryStore();
      const list = store.list({ topic: input.topic, limit: 50 });
      if (!list.length) {
        return 'Long-term memory is currently empty. You can ask me to remember things anytime!';
      }
      ctx.log('info', `Listed ${list.length} stored memories`);
      const formatted = list.map((m) => `• [${m.topic}] ${m.fact} (ID: ${m.id})`).join('\n');
      return `Stored memories (${list.length}):\n${formatted}`;
    },
  },
  {
    name: 'forget_memory',
    description: 'Remove a specific fact or preference from long-term memory using its memory ID or exact text.',
    input_schema: {
      type: 'object',
      properties: {
        id_or_text: {
          type: 'string',
          description: 'The memory ID or the text of the memory to forget.',
        },
      },
      required: ['id_or_text'],
    },
    async run(input, ctx) {
      const store = getMemoryStore();
      const ok = store.forget(input.id_or_text);
      if (!ok) {
        return `Could not find a memory matching "${input.id_or_text}". Use list_memories to inspect stored memories.`;
      }
      ctx.log('info', `Removed memory: ${input.id_or_text}`);
      return `Successfully removed from long-term memory.`;
    },
  },
];
