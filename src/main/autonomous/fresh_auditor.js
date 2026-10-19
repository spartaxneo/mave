'use strict';
// Fresh-Context Action Auditor (AutoGPT's "Zero-Theatre Audit").
// Implements the critical discovery from AutoGPT's multi-expert architecture:
// A second reader in a fresh context checking the drafter's work against
// explicitly declared commitments and safety bounds BEFORE execution.

class FreshContextAuditor {
  constructor(options = {}) {
    this.name = options.name || 'Zero-Theatre Safety Sentinel [Fresh Context]';
    this.strictMode = options.strictMode !== false;
    this.prohibitedPatterns = [
      /\b(?:format\s+[a-z]:|rm\s+-rf\s+[\/~]|rmdir\s+\/s\s+\/q\s+[c-z]:|drop\s+database\b|del\s+\/[fqs]\s+[c-z]:\\windows)/i,
      /\b(?:remove-item\s+-[a-z]*recurse\s+-[a-z]*force\s+c:\\windows|remove-item\s+-[a-z]*recurse\s+-[a-z]*force\s+c:\\\$)/i,
      /\b(?:git\s+clean\s+-fdx\s+\.git|rm\s+-rf\s+\.git)/i,
    ];
    this.sensitiveFiles = [
      /\.env\b/i,
      /id_rsa/i,
      /id_ed25519/i,
      /\bcredentials\.json\b/i,
      /\btoken\.secret\b/i,
    ];
    this.divertKeywords = [
      /\b(?:instagram|tiktok|netflix|twitch|youtube\.com\/watch\?v=|reddit\.com\/r\/memes)\b/i,
    ];
  }

  /**
   * Audits a proposed action in a clean, isolated context.
   *
   * @param {object} opts
   * @param {string} opts.goal - The high-level user goal
   * @param {object} opts.node - The active DAG GoalNode
   * @param {object} opts.proposal - Proposed action from the drafter
   * @param {string} opts.proposal.tool - Tool name (e.g. 'run_command', 'write_file')
   * @param {object} opts.proposal.params - Tool parameters
   * @param {string} [opts.proposal.commitment] - What the drafter promises this action does/doesn't do
   * @param {string} [opts.proposal.intent] - Why this action achieves the node objective
   * @param {string} [opts.proposal.assumptions] - Stated boundary assumptions
   * @param {Array} [opts.history] - Execution history for repetition detection
   * @returns {object} Audit ruling
   */
  auditAction({ goal = '', node = null, proposal = {}, history = [] }) {
    const tool = String(proposal.tool || '');
    const params = proposal.params || {};
    const commitment = String(proposal.commitment || node?.commitment || '').trim();
    const intent = String(proposal.intent || node?.description || '').trim();
    const targetGoal = String(goal || '').trim();

    const directives = [];
    let score = 100;
    let verdict = 'APPROVED';
    let reason = 'Action satisfies declared commitments and passes fresh-context security gates.';

    // 1. Requirement of Stated Commitment (AutoGPT Load-Bearing Mechanism)
    if (!commitment && this.strictMode) {
      score -= 25;
      directives.push('Drafter did not declare explicit action commitments.');
    }

    // 2. Destructive System Command Check
    const cmdString = String(params.command || params.cmd || params.script || '');
    const pathString = String(params.path || params.file || params.targetFile || '');
    const fullPayload = `${tool} ${cmdString} ${pathString} ${JSON.stringify(params)}`.toLowerCase();

    for (const pat of this.prohibitedPatterns) {
      if (pat.test(fullPayload)) {
        return {
          approved: false,
          verdict: 'BLOCKED',
          score: 0,
          reason: `Blocked catastrophic system command matching restricted pattern: ${pat}`,
          safetyDirectives: ['Execute within project boundary only', 'Do not alter OS system files or format storage'],
          auditor: this.name,
        };
      }
    }

    // 3. Credential & Secret Protection Check
    const isExfiltrationAttempt = /\b(?:curl|wget|invoke-webrequest|http\.post|fetch)\b/i.test(cmdString);
    if (isExfiltrationAttempt) {
      for (const secretPat of this.sensitiveFiles) {
        if (secretPat.test(cmdString)) {
          return {
            approved: false,
            verdict: 'BLOCKED',
            score: 0,
            reason: `Action attempted to exfiltrate sensitive credential/key file: ${secretPat}`,
            safetyDirectives: ['Never upload or stream private credentials outside local perimeter'],
            auditor: this.name,
          };
        }
      }
    }

    // 4. Commitment vs Payload Consistency Check
    // If drafter committed to "read-only", but attempts destructive write/delete
    const isReadOnlyCommitment = /\b(?:read-only|inspection|view|check|survey|list)\b/i.test(commitment);
    const isDestructiveAction = /\b(?:delete|remove|rmdir|rm|del|unlink|drop|truncate|overwrite)\b/i.test(fullPayload);
    if (isReadOnlyCommitment && isDestructiveAction) {
      return {
        approved: false,
        verdict: 'BLOCKED',
        score: 10,
        reason: `Commitment violation: drafter declared "${commitment}" (read-only), but proposed destructive command.`,
        safetyDirectives: ['Action must strictly match declared commitment boundaries'],
        auditor: this.name,
      };
    }

    // 5. Goal Divergence Check (Social Media / Entertainment)
    const goalMentionsEntertainment = this.divertKeywords.some((pat) => pat.test(targetGoal));
    if (!goalMentionsEntertainment) {
      for (const divertPat of this.divertKeywords) {
        if (divertPat.test(fullPayload)) {
          return {
            approved: false,
            verdict: 'BLOCKED',
            score: 5,
            reason: `Divergence detected: proposed action targets entertainment/social media (${divertPat}) unprompted by goal.`,
            safetyDirectives: ['Stay strictly aligned with primary user goal'],
            auditor: this.name,
          };
        }
      }
    }

    // 6. Repetition / Stalling Loop Detection (AutoGPT Watchdog)
    if (Array.isArray(history) && history.length >= 2) {
      const lastTwo = history.slice(-2);
      const isRepeated = lastTwo.every((h) => h.tool === tool && JSON.stringify(h.params) === JSON.stringify(params));
      if (isRepeated) {
        return {
          approved: false,
          verdict: 'BLOCKED',
          score: 15,
          reason: 'Stalling loop detected: identical action executed twice consecutively with no progressive outcome.',
          safetyDirectives: ['Reflect on prior failure, alter approach or inspect error output before repeating'],
          auditor: this.name,
        };
      }
    }

    // 7. Minor Advisory Flagging
    if (score < 80) {
      verdict = 'FLAGGED';
      reason = `Action approved with warnings: ${directives.join('; ')}`;
    }

    return {
      approved: true,
      verdict,
      score,
      reason,
      safetyDirectives: directives,
      auditor: this.name,
    };
  }
}

// Singleton auditor instance
const defaultAuditor = new FreshContextAuditor();

module.exports = {
  FreshContextAuditor,
  defaultAuditor,
};
