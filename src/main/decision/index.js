'use strict';
// Unified Decision & Context Processing Layer for Mave.
// Combines:
// - Jev: TypeSafe "System 1" Reflex Decision Engine (Sub-50ms Routing & Guardrails)
// - CDM: Constrained Decoding Model (High-Speed Context Compression & Extraction)

const { JevEngine, getJevEngine, JevChoice, JevNoul, JevScore } = require('./jev_engine');
const { CDMEngine, getCDMEngine } = require('./cdm_engine');

const jev = getJevEngine();
const cdm = getCDMEngine();

/**
 * Tripartite Orchestration Pipeline:
 * Processes user input through Jev (System 1 reflex) and CDM (Context compression).
 *
 * @param {string} task - User query or instruction
 * @param {object} context - Associated state { history, activeWindow, memory }
 * @returns {object} { handled, result, routing, compressedContext }
 */
async function processWithJevAndCDM(task, context = {}) {
  const start = Date.now();

  // Phase 1: Jev "System 1" Reflex Evaluation
  const intent = jev.evaluateIntent(task);

  if (intent.type === 'guardrail_block') {
    return {
      handled: true,
      actionType: 'guardrail',
      reply: `Action Blocked by Safety Guardrail: ${intent.reason}`,
      confidence: intent.confidence,
      latencyMs: Date.now() - start,
    };
  }

  if (intent.type === 'immediate_action' && intent.confidence >= 0.85) {
    return {
      handled: true,
      actionType: intent.action,
      category: intent.category,
      params: intent.params,
      reply: intent.reply,
      confidence: intent.confidence,
      latencyMs: Date.now() - start,
    };
  }

  if (intent.type === 'conversational_quick' && intent.confidence >= 0.90) {
    return {
      handled: true,
      actionType: 'conversational',
      reply: intent.reply,
      confidence: intent.confidence,
      latencyMs: Date.now() - start,
    };
  }

  // Phase 2: CDM Context Compression
  // If task proceeds to heavy LLM, compress older history or bulky context
  let compressedHistory = context.history || [];
  if (compressedHistory.length > 4) {
    compressedHistory = cdm.compressConversation(compressedHistory, { preserveRecent: 4 });
  }

  return {
    handled: false,
    actionType: 'deep_reasoning',
    routing: intent,
    compressedHistory,
    latencyMs: Date.now() - start,
  };
}

module.exports = {
  JevEngine,
  getJevEngine,
  JevChoice,
  JevNoul,
  JevScore,
  CDMEngine,
  getCDMEngine,
  processWithJevAndCDM,
};
