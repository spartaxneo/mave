'use strict';
// Interactive In-Chat Permission Broker & Action Approval Gate for Mave (OpenMausBot parity).
// Evaluates tool actions for risk severity (LOW, MEDIUM, HIGH, CRITICAL),
// provides impact analysis, and gates destructive operations with human-in-the-loop approvals.

const { permissionBroker } = require('../../permission_broker');

module.exports = [
  {
    name: 'broker_evaluate_action',
    description: 'Evaluate an action or shell command for security risk (LOW, MEDIUM, HIGH, CRITICAL) and generate an interactive OpenMausBot action approval card before execution.',
    input_schema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'Name of the tool to be executed (e.g. "run_command", "write_file", "delete_file").'
        },
        command_or_input: {
          type: 'string',
          description: 'The exact command, script, path, or query to be evaluated.'
        },
        task_context: {
          type: 'string',
          description: 'The user goal or task driving this operation.'
        }
      },
      required: ['tool_name', 'command_or_input'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const card = permissionBroker.evaluate(input.tool_name, { command: input.command_or_input }, input.task_context || '');
      ctx.log('info', `Permission Broker: Evaluated ${input.tool_name} -> Risk ${card.riskLevel}`);
      return permissionBroker.renderCardMarkdown(card);
    }
  },
  {
    name: 'broker_session_permissions',
    description: 'Inspect or manage session-wide tool approvals granted by the human user.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'allow_tool', 'revoke_tool'],
          description: 'Management action.'
        },
        tool_name: {
          type: 'string',
          description: 'Tool name to allow or revoke for the current session.'
        }
      },
      required: ['action'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const action = input.action;

      if (action === 'allow_tool' && input.tool_name) {
        permissionBroker.allowSession(input.tool_name);
        return `✅ **SESSION PERMISSION GRANTED**: Tool \`${input.tool_name}\` is now authorized for the remainder of this session without repeat prompts.`;
      }

      if (action === 'revoke_tool' && input.tool_name) {
        permissionBroker.revokeSession(input.tool_name);
        return `🚫 **SESSION PERMISSION REVOKED**: Tool \`${input.tool_name}\` will prompt for approval on next invocation.`;
      }

      const list = [...permissionBroker.sessionAllows];
      if (list.length === 0) {
        return `🛡️ **SESSION PERMISSIONS**: No persistent tool overrides granted. All high-risk actions will prompt for confirmation.`;
      }

      return `🛡️ **ACTIVE SESSION PERMISSIONS** (${list.length}):\n${list.map((t) => `• \`${t}\` - Session Auto-Approved`).join('\n')}`;
    }
  }
];
