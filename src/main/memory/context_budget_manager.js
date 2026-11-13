'use strict';

/**
 * ContextBudgetManager strictly enforces token caps across prompt components.
 * Prevents prompt bloat and guarantees that simple tasks use minimal tokens.
 */
class ContextBudgetManager {
  constructor(options = {}) {
    this.totalBudget = Number(options.totalBudget) || 4096;
    this.allocations = {
      systemPrompt: options.systemPrompt || 800,
      userRequest: options.userRequest || 500,
      taskState: options.taskState || 1000,
      scopedMemory: options.scopedMemory || 800,
      toolEvidence: options.toolEvidence || 1200,
      conversationHistory: options.conversationHistory || 500,
    };
  }

  /**
   * Approximate token count for text (rule of thumb: ~4 characters per token).
   */
  estimateTokens(text) {
    if (!text) return 0;
    if (typeof text !== 'string') text = JSON.stringify(text);
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to stay within a maximum token allowance.
   */
  fitToBudget(text, maxTokens, suffix = '\n[...truncated to fit context budget...]') {
    if (!text) return '';
    const currentTokens = this.estimateTokens(text);
    if (currentTokens <= maxTokens) return text;

    const maxChars = Math.max(10, maxTokens * 4 - suffix.length);
    return text.slice(0, maxChars) + suffix;
  }

  /**
   * Assemble a packed prompt within the configured token budget.
   */
  packPrompt(components = {}) {
    const {
      systemPrompt = '',
      userRequest = '',
      taskState = '',
      scopedMemory = '',
      toolEvidence = '',
      conversationTurns = [],
    } = components;

    const fittedSystem = this.fitToBudget(systemPrompt, this.allocations.systemPrompt);
    const fittedUser = this.fitToBudget(userRequest, this.allocations.userRequest);
    const fittedTask = this.fitToBudget(taskState, this.allocations.taskState);
    const fittedMemory = this.fitToBudget(scopedMemory, this.allocations.scopedMemory);
    const fittedEvidence = this.fitToBudget(toolEvidence, this.allocations.toolEvidence);

    // Pack conversation turns in reverse (most recent turns take priority)
    const packedTurns = [];
    let historyTokensUsed = 0;
    const maxHistoryTokens = this.allocations.conversationHistory;

    for (let i = conversationTurns.length - 1; i >= 0; i--) {
      const turn = conversationTurns[i];
      const turnText = `${turn.role}: ${turn.content}\n`;
      const turnTokens = this.estimateTokens(turnText);

      if (historyTokensUsed + turnTokens <= maxHistoryTokens) {
        packedTurns.unshift(turn);
        historyTokensUsed += turnTokens;
      } else {
        break;
      }
    }

    const totalUsedTokens =
      this.estimateTokens(fittedSystem) +
      this.estimateTokens(fittedUser) +
      this.estimateTokens(fittedTask) +
      this.estimateTokens(fittedMemory) +
      this.estimateTokens(fittedEvidence) +
      historyTokensUsed;

    return {
      fittedSystem,
      fittedUser,
      fittedTask,
      fittedMemory,
      fittedEvidence,
      packedTurns,
      tokenUsage: {
        totalBudget: this.totalBudget,
        totalUsedTokens,
        memoryTokens: this.estimateTokens(fittedMemory),
        evidenceTokens: this.estimateTokens(fittedEvidence),
        taskTokens: this.estimateTokens(fittedTask),
        isWithinBudget: totalUsedTokens <= this.totalBudget,
      },
    };
  }
}

let defaultBudgetManager = null;

function getContextBudgetManager(options = {}) {
  if (!defaultBudgetManager) {
    defaultBudgetManager = new ContextBudgetManager(options);
  }
  return defaultBudgetManager;
}

module.exports = {
  ContextBudgetManager,
  getContextBudgetManager,
};
