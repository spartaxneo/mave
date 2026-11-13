'use strict';

const { TaskStatus } = require('./goal_contract');

const UNREQUESTED_DIVERT_DOMAINS = [
  { name: 'Instagram', regex: /\b(?:instagram\.com|instagram|insta)\b/i },
  { name: 'TikTok', regex: /\b(?:tiktok\.com|tiktok)\b/i },
  { name: 'YouTube', regex: /\b(?:youtube\.com|youtu\.be)\b/i },
  { name: 'Netflix', regex: /\b(?:netflix\.com|netflix)\b/i },
  { name: 'Twitter/X', regex: /\b(?:twitter\.com|x\.com)\b/i },
  { name: 'Reddit', regex: /\b(?:reddit\.com|reddit)\b/i },
  { name: 'Twitch', regex: /\b(?:twitch\.tv|twitch)\b/i },
  { name: 'Facebook', regex: /\b(?:facebook\.com|fb\.com)\b/i },
];

const STATUS_PATTERNS = /\b(?:how(?:'s| is) it going|what are you doing|current status|what(?:'s| is) the progress|status update|where are you at|are you done yet|show progress)\b/i;
const CORRECTION_PATTERNS = /\b(?:actually|instead|rather|correction|change (?:the|that|it)|make it|switch to|use \w+ instead|don't use|fix (?:the|that))\b/i;
const PAUSE_PATTERNS = /\b(?:pause(?: for now)?|hold on|wait(?: a sec(?:ond)?)?|freeze|take a break|stop for a second)\b/i;
const RESUME_PATTERNS = /\b(?:continue|resume|keep going|proceed|go ahead|carry on)\b/i;
const STOP_PATTERNS = /\b(?:stop|cancel(?: the task)?|abort|terminate|halt|kill (?:the )?task)\b/i;

class GoalDriftDetector {
  constructor(options = {}) {
    this.maxActionRepeats = options.maxActionRepeats || 2;
    this.actionHistory = []; // [ { key, timestamp, result } ]
  }

  /**
   * Evaluate whether a candidate action belongs to the active goal or represents drift.
   * @param {import('./goal_contract').GoalContract} goalContract
   * @param {object} action - { tool, args, targetUrl, targetApp }
   */
  evaluateCandidateAction(goalContract, action = {}) {
    if (!goalContract) return { allowed: true };

    const originalReq = String(goalContract.originalRequest || '').toLowerCase();
    const confirmedObj = String(goalContract.confirmedObjective || '').toLowerCase();
    const combinedContext = `${originalReq} ${confirmedObj}`;

    const tool = String(action.tool || action.name || '').toLowerCase();
    const args = action.args || action.input || {};
    const targetUrl = String(args.url || action.targetUrl || '').toLowerCase();
    const targetApp = String(args.name || action.targetApp || '').toLowerCase();

    // 1. Check for unprompted entertainment/social divert
    if (tool === 'open_url' || tool === 'open_app' || tool.startsWith('use_')) {
      for (const divert of UNREQUESTED_DIVERT_DOMAINS) {
        const matchesTarget = (targetUrl && divert.regex.test(targetUrl)) || (targetApp && divert.regex.test(targetApp));
        if (matchesTarget) {
          const requestedInGoal = divert.regex.test(combinedContext);
          if (!requestedInGoal) {
            return {
              allowed: false,
              reason: `Unrequested diversion to ${divert.name}. The user's active task is "${goalContract.originalRequest}".`,
              divertType: 'ENTERTAINMENT_DISTRACTION',
            };
          }
        }
      }
    }

    // 2. Check for tool repetition loop
    const actionKey = `${tool}:${JSON.stringify(args)}`;
    const recentIdentical = this.actionHistory.slice(-4).filter((h) => h.key === actionKey);
    if (recentIdentical.length >= this.maxActionRepeats) {
      return {
        allowed: false,
        reason: `Repetition loop detected: Action "${tool}" with identical arguments was attempted ${recentIdentical.length} times without progress.`,
        divertType: 'REPETITION_LOOP',
      };
    }

    // 3. Record action in history
    this.actionHistory.push({
      key: actionKey,
      timestamp: Date.now(),
      tool,
    });
    if (this.actionHistory.length > 50) this.actionHistory.shift();

    return { allowed: true };
  }

  /**
   * Classify an incoming user message against the currently active goal.
   * Distinguishes status queries, corrections, pauses, stops, and new unrelated goals.
   */
  classifyUserMessage(goalContract, userMessage = '') {
    const text = String(userMessage || '').trim();
    if (!text) return { type: 'EMPTY' };

    // If there is no active task, every message is a fresh request
    if (!goalContract || goalContract.status !== TaskStatus.ACTIVE) {
      return { type: 'NEW_TASK', text };
    }

    if (STOP_PATTERNS.test(text)) {
      return { type: 'EMERGENCY_STOP', text };
    }

    if (PAUSE_PATTERNS.test(text)) {
      return { type: 'TASK_PAUSE', text };
    }

    if (RESUME_PATTERNS.test(text)) {
      return { type: 'TASK_RESUME', text };
    }

    if (STATUS_PATTERNS.test(text)) {
      return { type: 'STATUS_REQUEST', text };
    }

    if (CORRECTION_PATTERNS.test(text)) {
      return { type: 'CORRECTION', text };
    }

    // Check semantic overlap with the active goal
    const goalTokens = new Set(
      `${goalContract.originalRequest} ${goalContract.confirmedObjective}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const msgTokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let overlapCount = 0;
    for (const t of msgTokens) {
      if (goalTokens.has(t)) overlapCount++;
    }

    // If user provides a totally new directive without reference to current goal
    if (msgTokens.length >= 4 && overlapCount === 0) {
      return {
        type: 'NEW_TASK',
        text,
        requiresConfirmation: true,
        reason: 'New directive does not share context with active task.',
      };
    }

    // Default to a task-related clarification or continuation
    return { type: 'TASK_CONTINUATION', text };
  }

  resetHistory() {
    this.actionHistory = [];
  }
}

let defaultGoalDriftDetector = null;

function getGoalDriftDetector() {
  if (!defaultGoalDriftDetector) {
    defaultGoalDriftDetector = new GoalDriftDetector();
  }
  return defaultGoalDriftDetector;
}

module.exports = {
  GoalDriftDetector,
  getGoalDriftDetector,
};
