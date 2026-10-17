'use strict';
// Self-Evolution & Recursive Improvement Plugin for Bigfoot.
// Allows Bigfoot to audit his own runtime friction, formulate evolution proposals,
// consult the Architect AI (Antigravity / Local Sol-Brain), and safely hot-reload new capabilities.

const { getIntrospectionEngine } = require('../../evolution/introspect');
const { getArchitectBridge } = require('../../evolution/architect_bridge');
const { getSelfBuilder } = require('../../evolution/self_builder');

module.exports = [
  {
    name: 'trigger_self_reflection',
    description: 'Trigger Mave metacognitive introspection to audit recent task errors, user skip feedback, and capability gaps, generating structured evolution improvement tickets.',
    input_schema: {
      type: 'object',
      properties: {
        recent_log_snippets: {
          type: 'array',
          description: 'Optional recent error or execution log strings to include in the audit.',
          items: {
            type: 'string',
            description: 'Log snippet.',
          },
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'Mave is introspecting on recent actions and capability gaps...');
      const engine = getIntrospectionEngine();
      const proposals = await engine.introspect(input.recent_log_snippets || []);

      if (proposals.length === 0) {
        return '🌱 **Introspection Complete**: No runtime errors or negative feedback recorded. Mave is operating with 100% stability.';
      }

      const rows = proposals.slice(0, 10).map((p, idx) =>
        `**${idx + 1}. [${p.category.toUpperCase()}]** \`${p.id}\`\n  • Context: ${p.context}\n  • Goal: ${p.goal}\n  • Status: *${p.status}*`
      ).join('\n\n');

      return `🧠 **METACOGNITIVE AUDIT REPORT** (${proposals.length} active evolution ticket(s)):\n\n${rows}\n\n*Tip: Use \`consult_architect_ai\` with any Ticket ID to formulate and build code improvements.*`;
    },
  },
  {
    name: 'consult_architect_ai',
    description: 'Open a consultation session with the Senior Architect AI (Antigravity) to design a modular code patch or new plugin to resolve an evolution ticket.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'The ID of the evolution ticket to resolve (e.g. from trigger_self_reflection).',
        },
      },
      required: ['ticket_id'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getIntrospectionEngine();
      const proposals = engine.loadProposals();
      const ticket = proposals.find((p) => p.id === input.ticket_id) || {
        id: input.ticket_id,
        category: 'general_enhancement',
        context: 'Direct user-requested capability upgrade.',
        goal: 'Implement requested functionality adhering to plugin contracts.',
      };

      ctx.log('info', `Consulting Architect AI for ticket: ${ticket.id}...`);
      const bridge = getArchitectBridge();
      const plan = await bridge.consultArchitect(ticket);

      return `🏛️ **ARCHITECT CONSULTATION RESULT** (Ticket \`${ticket.id}\`):
• **Proposed Target File**: \`${plan.proposedFile}\`
• **Design Rationale**: ${plan.rationale}
• **Validation Spec**: ${plan.testSpec}

\`\`\`javascript
${plan.proposedCode}
\`\`\`

*To apply and hot-reload this upgrade into Mave, use \`apply_evolution_patch\`.*`;
    },
  },
  {
    name: 'apply_evolution_patch',
    description: 'Safely validate, deploy, and hot-reload an approved evolution patch or new plugin directly into Mave without restarting the app.',
    input_schema: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'Relative path for the new or updated plugin (e.g. "src/main/plugins/builtin/my_tool.js").',
        },
        code: {
          type: 'string',
          description: 'The JavaScript code content for the plugin.',
        },
        ticket_id: {
          type: 'string',
          description: 'Optional ticket ID being resolved.',
        },
      },
      required: ['target_file', 'code'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      await ctx.confirm('change', {
        title: 'Apply Self-Evolution Upgrade?',
        message: `Deploy and hot-reload ${input.target_file} into active Mave runtime`,
        confirm: 'Install Upgrade',
      });

      ctx.log('info', `Deploying evolutionary patch to ${input.target_file}...`);
      const builder = getSelfBuilder();
      const result = await builder.deployPatch(input.target_file, input.code);

      if (!result.success) {
        return `⚠️ **Evolution Deployment Aborted**: Failed during ${result.phase} phase:\n${result.error}`;
      }

      // Mark ticket as resolved if provided
      if (input.ticket_id) {
        const engine = getIntrospectionEngine();
        const proposals = engine.loadProposals();
        const ticket = proposals.find((p) => p.id === input.ticket_id);
        if (ticket) {
          ticket.status = 'resolved';
          ticket.resolvedAt = new Date().toISOString();
          engine.saveProposals(proposals);
          engine.recordHistory({ ticketId: input.ticket_id, file: input.target_file, tools: result.tools });
        }
      }

      return `🚀 **SELF-EVOLUTION UPGRADE DEPLOYED & HOT-RELOADED**:
• **Target File**: \`${result.deployedFile}\`
• **Active Tools Verified**: ${result.tools.map((t) => `\`${t}\``).join(', ')}
• **Status**: Active in current runtime memory! Zero app restart required.`;
    },
  },
];
