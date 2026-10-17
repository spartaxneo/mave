'use strict';
// In-Chat Interactive Permission Broker & Safety Gate (OpenMausBot parity).
// Analyzes proposed tool invocations and commands for risk severity:
// - LOW: Read-only operations, searches, file reads, UI inspections.
// - MEDIUM: Workspace file edits, benign terminal builds, URL openings.
// - HIGH: Unconstrained script execution, system directory writes, credential vault access.
// - CRITICAL: Destructive commands (rm -rf, del /s, format, drop table, registry changes).
// Renders structured action approval cards with danger badges and decision triggers.

class PermissionBroker {
  constructor() {
    this.sessionAllows = new Set();
    this.history = [];
  }

  /**
   * Evaluate risk level and generate an interactive approval card.
   */
  evaluate(toolName, input = {}, task = '') {
    const rawInput = JSON.stringify(input);
    const cmdStr = (input.command || input.CommandLine || input.script || input.query || rawInput).toLowerCase();

    let riskLevel = 'LOW';
    let dangerScore = 0.1;
    let impact = 'Safe read-only or perception action with zero filesystem changes.';

    // Check CRITICAL patterns
    if (
      cmdStr.includes('rm -rf') ||
      cmdStr.includes('del /s') ||
      cmdStr.includes('format ') ||
      cmdStr.includes('diskpart') ||
      cmdStr.includes('reg delete') ||
      cmdStr.includes('drop database') ||
      cmdStr.includes('drop table') ||
      cmdStr.includes(':(){ :|:& };:')
    ) {
      riskLevel = 'CRITICAL';
      dangerScore = 0.98;
      impact = 'Potentially destructive or irreversible operation detected. Could permanently delete files, drop data, or destabilize the system.';
    } else if (
      toolName === 'run_command' ||
      toolName === 'shell_execute' ||
      toolName === 'terminal' ||
      cmdStr.includes('chmod 777') ||
      cmdStr.includes('icacls') ||
      cmdStr.includes('curl ') && cmdStr.includes('| bash')
    ) {
      riskLevel = 'HIGH';
      dangerScore = 0.75;
      impact = 'Executes system shell command with host privileges. Modifies files or spawns external processes.';
    } else if (
      toolName.includes('write_file') ||
      toolName.includes('edit_') ||
      toolName.includes('replace_file') ||
      toolName.includes('delete_') ||
      toolName.includes('bot_sql_query')
    ) {
      riskLevel = 'MEDIUM';
      dangerScore = 0.45;
      impact = 'Modifies files or analytical database records within the designated workspace.';
    }

    const card = {
      id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      toolName,
      riskLevel,
      dangerScore,
      preview: cmdStr.slice(0, 150),
      impact,
      allowed: this.sessionAllows.has(toolName) || riskLevel === 'LOW',
      actions: ['Allow Once', 'Always Allow for Session', 'Deny']
    };

    this.history.push(card);
    return card;
  }

  /**
   * Check if a tool has session-wide approval.
   */
  isAlwaysAllowed(toolName) {
    return this.sessionAllows.has(toolName);
  }

  /**
   * Grant session-wide permission.
   */
  allowSession(toolName) {
    this.sessionAllows.add(toolName);
  }

  /**
   * Revoke session permission.
   */
  revokeSession(toolName) {
    this.sessionAllows.delete(toolName);
  }

  /**
   * Format approval card for chat stream rendering.
   */
  renderCardMarkdown(card) {
    const icon = {
      'LOW': '🟢',
      'MEDIUM': '🟡',
      'HIGH': '🟠',
      'CRITICAL': '🔴'
    }[card.riskLevel] || '⚪';

    return `🛡️ **ACTION APPROVAL REQUEST** [${icon} **${card.riskLevel} RISK**]:
• **Tool**: \`${card.toolName}\`
• **Action Preview**: \`${card.preview}\`
• **Impact Analysis**: ${card.impact}

\`\`\`approval-broker
[ALLOW ONCE]  |  [ALWAYS ALLOW FOR SESSION]  |  [DENY]
\`\`\``;
  }
}

const brokerInstance = new PermissionBroker();

module.exports = {
  PermissionBroker,
  permissionBroker: brokerInstance
};
