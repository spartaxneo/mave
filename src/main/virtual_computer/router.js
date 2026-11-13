'use strict';

const ENVIRONMENTS = {
  VIRTUAL_BROWSER: 'virtual_browser',
  VIRTUAL_COMPUTER: 'virtual_computer',
  ISOLATED_CONTAINER: 'isolated_container',
  HOST_COMPUTER: 'host_computer',
};

const BROWSER_TASK_PATTERNS = [
  /\b(?:browse|website|web page|search the web|google|scrape|fill (?:out |the )?form|navigate to|open https?:\/\/|read (?:the )?page)\b/i,
  /\b(?:research online|look up on|check amazon|find prices|compare products|booking|flight|hotel)\b/i,
];

const COMPUTER_TASK_PATTERNS = [
  /\b(?:code|script|build a website|python|javascript|terminal|compile|run test|analyze data|parse csv)\b/i,
  /\b(?:create document|generate report|write a program|git clone|npm install|debug code)\b/i,
];

const EXPLICIT_HOST_PATTERNS = [
  /\b(?:control|use|move|take over)\s+(?:my\s+)?(?:actual\s+|physical\s+)?(?:mouse|cursor|desktop|screen|pc|computer)\b/i,
  /\b(?:on|in)\s+(?:my\s+)?(?:actual\s+|physical\s+)(?:display|pc|computer|desktop|screen)\b/i,
  /\b(?:real cursor|actual mouse|physical computer|take over my screen|click my screen)\b/i,
];

class ExecutionTargetRouter {
  constructor(options = {}) {
    this.defaultEnvironment = ENVIRONMENTS.VIRTUAL_BROWSER;
    this.hostApprovalRequired = options.hostApprovalRequired !== false;
    this.approvedHostSessions = new Set();
  }

  /**
   * Determine the appropriate execution environment for a task prompt or instruction.
   * Enforces the MAVE invariant: Guest Virtual Computer by default, NEVER host desktop without permission.
   */
  resolveTarget(taskText, options = {}) {
    const text = String(taskText || '').trim();

    // 1. Check for explicit request to operate on physical host
    const isExplicitHost = EXPLICIT_HOST_PATTERNS.some((p) => p.test(text));
    if (isExplicitHost || options.preferHost) {
      return {
        environment: ENVIRONMENTS.HOST_COMPUTER,
        isGuest: false,
        requiresConfirmation: true,
        reason: 'User explicitly requested physical host desktop interaction',
      };
    }

    // 2. Check for coding, terminal, scripts, or local document tasks -> Virtual Computer
    const isComputer = COMPUTER_TASK_PATTERNS.some((p) => p.test(text));
    if (isComputer || options.preferComputer) {
      return {
        environment: ENVIRONMENTS.VIRTUAL_COMPUTER,
        isGuest: true,
        requiresConfirmation: false,
        reason: 'Task requires coding, terminal execution, or file compilation inside isolated guest computer',
      };
    }

    // 3. Default for web, research, navigation, and general tasks -> Virtual Browser
    return {
      environment: ENVIRONMENTS.VIRTUAL_BROWSER,
      isGuest: true,
      requiresConfirmation: false,
      reason: 'Standard web research and application navigation inside isolated virtual browser',
    };
  }

  /**
   * Authorize a session for physical host control after explicit user consent.
   */
  authorizeHostSession(sessionId) {
    if (!sessionId) return false;
    this.approvedHostSessions.add(String(sessionId));
    return true;
  }

  revokeHostSession(sessionId) {
    return this.approvedHostSessions.delete(String(sessionId));
  }

  isHostAuthorized(sessionId) {
    return this.approvedHostSessions.has(String(sessionId));
  }

  /**
   * Disallow silent fallback: Throws error if an unverified guest failure tries to route to host.
   */
  assertNoSilentHostFallback(requestedEnv, error) {
    if (requestedEnv === ENVIRONMENTS.HOST_COMPUTER) return;
    throw new Error(
      `MAVE Execution Invariant Protected: Guest task in ${requestedEnv} failed (${error ? error.message : 'Unknown'}). Silent fallback to host computer is strictly prohibited.`
    );
  }
}

module.exports = {
  ExecutionTargetRouter,
  ENVIRONMENTS,
};
