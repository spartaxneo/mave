'use strict';
// Ghost AI Core 3-Tier Runtime Security Guard & Human-in-the-Loop Confirmation Gate.
// Tiers: Safe (Auto-Approved) | Moderate (Logged & Audited) | Dangerous (Mandatory Human Approval)

const DANGEROUS_PATTERNS = [
  /rm\s+(-rf|-r|-f)\b/i,
  /\bdel\s+\/[fqs]\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bkill\s+-9\b/i,
  /\btaskkill\s+\/f\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\s+table\b/i,
  /\bchmod\s+777\b/i,
  /\bset-executionpolicy\s+unrestricted\b/i,
  /\bcurl\b.*\|\s*(bash|sh|powershell|cmd)\b/i,
];

const MODERATE_TOOL_NAMES = new Set([
  'edit_file', 'write_to_file', 'append_file', 'browser_navigate',
  'mavedrop_share_file', 'operate_home_appliance', 'artemis_control_android',
  'iphone_use_control',
]);

const DANGEROUS_TOOL_NAMES = new Set([
  'run_command', 'execute_shell', 'format_disk', 'predict_and_dispatch_emergency',
  'delete_file', 'wipe_database',
]);

class GhostSecurityGuard {
  constructor(options = {}) {
    this.posture = options.posture || 'balanced'; // strict | balanced | unfiltered
    this.auditLog = [];
  }

  setPosture(posture) {
    if (['strict', 'balanced', 'unfiltered'].includes(posture)) {
      this.posture = posture;
    }
  }

  /**
   * Evaluates the risk tier for an action or tool invocation.
   * Returns: 'safe' | 'moderate' | 'dangerous'
   */
  classifyAction(toolName, parameters = {}) {
    if (this.posture === 'unfiltered') return 'safe';

    // Check for dangerous shell execution
    if (toolName === 'run_command' || toolName === 'execute_shell') {
      const command = String(parameters.command || parameters.CommandLine || '');
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return 'dangerous';
        }
      }
      if (this.posture === 'strict') return 'dangerous';
      return 'moderate';
    }

    if (DANGEROUS_TOOL_NAMES.has(toolName)) {
      return this.posture === 'strict' ? 'dangerous' : 'moderate';
    }

    if (MODERATE_TOOL_NAMES.has(toolName)) {
      return 'moderate';
    }

    return 'safe';
  }

  /**
   * Asserts whether an action can proceed immediately or requires user confirmation.
   * Returns { allowed: boolean, requiresConfirmation: boolean, tier: string, reason: string }
   */
  async evaluate(toolName, parameters = {}, confirmationCallback = null) {
    const tier = this.classifyAction(toolName, parameters);
    const entry = {
      timestamp: Date.now(),
      toolName,
      tier,
      posture: this.posture,
      allowed: false,
    };

    if (tier === 'safe') {
      entry.allowed = true;
      this.auditLog.push(entry);
      return { allowed: true, requiresConfirmation: false, tier };
    }

    if (tier === 'moderate') {
      entry.allowed = true;
      this.auditLog.push(entry);
      return { allowed: true, requiresConfirmation: false, tier };
    }

    // Tier 3: Dangerous
    if (confirmationCallback) {
      const confirmed = await confirmationCallback({
        toolName,
        parameters,
        warning: '⚠️ High-risk action detected: May modify system files or execute destructive commands.',
      });
      entry.allowed = Boolean(confirmed);
      this.auditLog.push(entry);
      return { allowed: entry.allowed, requiresConfirmation: true, tier };
    }

    entry.allowed = false;
    this.auditLog.push(entry);
    return {
      allowed: false,
      requiresConfirmation: true,
      tier,
      reason: 'Action blocked by Ghost AI Core Security Guard (Requires Human Confirmation).',
    };
  }

  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }
}

module.exports = {
  GhostSecurityGuard,
  DANGEROUS_PATTERNS,
};
