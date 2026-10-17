'use strict';
// "Watch & Learn" Demonstration Mode Plugin for Bigfoot.
// Allows users to teach Bigfoot complex or unfamiliar app workflows by demonstrating
// actions step-by-step. Bigfoot compiles the demonstration into an executable action recipe
// and permanently commits it to memory.

const { getMemoryStore } = require('../../memory');

let activeDemonstration = null;

module.exports = [
  {
    name: 'start_demonstration',
    description: 'Start a "Watch & Learn" demonstration session where the user or assistant records UI steps for any desktop or web application.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_name: { type: 'string', description: 'Name of the workflow (e.g. "Photoshop Web Export", "Discord Welcome").' },
        app_name: { type: 'string', description: 'Target desktop app or website (e.g. "Photoshop", "Discord", "Notion").' },
        goal: { type: 'string', description: 'What this workflow accomplishes.' },
      },
      required: ['workflow_name', 'app_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const name = String(input.workflow_name).trim();
      const app = String(input.app_name).trim();
      const goal = String(input.goal || '').trim();

      activeDemonstration = {
        name,
        app,
        goal,
        startedAt: Date.now(),
        steps: [],
      };

      ctx.log('info', `Started demonstration recording: "${name}" for ${app}`);
      return `# 🎬 "Watch & Learn" Recording Started: ${name}\n`
        + `> App: **${app}** ${goal ? `| Goal: *${goal}*` : ''}\n\n`
        + `Recording active. Demonstrate steps using \`record_demonstration_step\`, then call \`finish_demonstration\` when complete.`;
    },
  },
  {
    name: 'record_demonstration_step',
    description: 'Record a single demonstrated UI action (click, typing, keyboard shortcut, wait, scroll) in the active demonstration session.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'type', 'shortcut', 'scroll', 'wait'],
          description: 'Type of UI action demonstrated.',
        },
        target: { type: 'string', description: 'Visual element description or button label (e.g. "File menu", "Export button", "search box").' },
        value: { type: 'string', description: 'Text to type, key combination (e.g. "Ctrl+E", "Enter"), or scroll amount.' },
        notes: { type: 'string', description: 'Optional explanation of why this step was taken.' },
      },
      required: ['action', 'target'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!activeDemonstration) {
        throw new Error('No active demonstration recording session. Call start_demonstration first.');
      }

      const step = {
        index: activeDemonstration.steps.length + 1,
        action: input.action,
        target: input.target,
        value: input.value || '',
        notes: input.notes || '',
        timestamp: Date.now(),
      };

      activeDemonstration.steps.push(step);
      ctx.log('info', `Recorded step ${step.index}: [${step.action}] on "${step.target}"`);

      return `Recorded step ${step.index}: [${step.action.toUpperCase()}] on "${step.target}"${step.value ? ` (Value: "${step.value}")` : ''}. Total steps: ${activeDemonstration.steps.length}.`;
    },
  },
  {
    name: 'finish_demonstration',
    description: 'Finalize the active "Watch & Learn" demonstration, compile it into an executable action recipe, and commit it to permanent memory.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Optional detailed description or usage instructions for this workflow.' },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!activeDemonstration) {
        throw new Error('No active demonstration recording session to finish.');
      }

      const demo = activeDemonstration;
      activeDemonstration = null;

      const store = getMemoryStore();
      const desc = input.description || demo.goal || `${demo.steps.length} steps`;
      const item = store.saveWorkflowRecipe({
        name: demo.name,
        app: demo.app,
        steps: demo.steps,
        description: desc,
      });

      ctx.log('info', `Saved workflow recipe "${demo.name}" with ${demo.steps.length} steps.`);

      const stepSummary = demo.steps.map((s) => `${s.index}. **${s.action.toUpperCase()}** on \`${s.target}\`${s.value ? ` -> "${s.value}"` : ''}${s.notes ? ` (${s.notes})` : ''}`).join('\n');

      return `# ✅ Workflow Recipe Learned: ${demo.name}\n`
        + `> App: **${demo.app}** | Total Steps: **${demo.steps.length}**\n\n`
        + `### 📋 Recipe Steps:\n${stepSummary}\n\n`
        + `🧠 **Committed to Memory**: Stored recipe under \`rule\` (ID: ${item.id}). Bigfoot can now execute or recall this workflow anytime using \`replay_demonstration\`.`;
    },
  },
  {
    name: 'list_demonstrations',
    description: 'List all demonstrated workflow recipes and macros learned by Bigfoot and stored in memory.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Optional app filter (e.g. "Photoshop", "Spotify").' },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      const store = getMemoryStore();
      let recipes = store.listWorkflowRecipes();
      if (input.app) {
        const appLower = input.app.toLowerCase();
        recipes = recipes.filter((r) => r.fact.toLowerCase().includes(appLower));
      }

      if (!recipes.length) {
        return 'No workflow recipes found. You can teach Bigfoot any app workflow using start_demonstration!';
      }

      const list = recipes.map((r, i) => `${i + 1}. ${r.fact.slice(0, 150)}... (ID: ${r.id})`).join('\n\n');
      return `# 📚 Learned Workflow Recipes (${recipes.length})\n\n${list}`;
    },
  },
];
