'use strict';
// Mave Autonomous Self-Healing Engine
// Detects execution faults, missing dependencies, screen inspection timeouts,
// model VRAM exhaustion, and variable reference anomalies; performs proactive,
// automated self-repair, state reconciliation, and task retry.

const os = require('os');
const { exec } = require('child_process');

class SelfHealer {
  constructor(deps = {}) {
    this.controller = deps.controller || null;
    this.logger = deps.logger || null;
    this.healingHistory = [];
    this.maxRetries = 2;
    this.activeHeals = new Set();
  }

  setController(controller) {
    this.controller = controller;
  }

  /**
   * Main entry point: attempt to self-heal a failed task execution and retry it.
   * @param {object} param0
   * @returns {Promise<{ healed: boolean, result?: any, explanation?: string }>}
   */
  async healAndRetry({ task, source = 'typed', options = {}, error, attempt = 1 }) {
    if (!error) return { healed: false };
    const errMsg = String(error.message || error);
    const healKey = `${task}:${errMsg}`;

    if (attempt > this.maxRetries || this.activeHeals.has(healKey)) {
      return { healed: false, explanation: 'Maximum self-healing attempts reached.' };
    }

    this.activeHeals.add(healKey);
    const diagnosis = this.classifyFault(errMsg, task);

    if (this.logger) {
      this.logger.info(`[SelfHealer] Detected fault [${diagnosis.type}]: ${errMsg}. Initiating self-healing protocol...`);
    }

    try {
      let repairSuccess = false;

      switch (diagnosis.type) {
        case 'VARIABLE_REFERENCE_FAULT':
          repairSuccess = await this.healVariableReferenceFault({ options, task, error });
          break;

        case 'SCREEN_INSPECTION_FAULT':
          repairSuccess = await this.healScreenInspectionFault();
          break;

        case 'LOCAL_MODEL_EXHAUSTION_FAULT':
          repairSuccess = await this.healModelExhaustionFault(diagnosis);
          break;

        case 'MISSING_TOOL_OR_COMMAND_FAULT':
          repairSuccess = await this.healMissingToolFault(diagnosis);
          break;

        case 'PRIVACY_SHIELD_ACTIVE':
          // Privacy shield is by design; cannot be auto-bypassed
          return {
            healed: false,
            explanation: 'Privacy Shield is currently active. Say "resume tracking" to re-enable screen vision.'
          };

        default:
          repairSuccess = await this.genericStateReconciliation();
          break;
      }

      if (repairSuccess && this.controller && typeof this.controller.runTaskDirect === 'function') {
        if (this.controller.recordThought) {
          this.controller.recordThought(`🔧 [Self-Healing Engine] Resolved ${diagnosis.type}. Re-executing task safely (attempt ${attempt + 1})...`);
        }

        // Retry the task with normalized options
        const sanitizedOptions = {
          ...options,
          selfHealed: true,
          healStrategy: diagnosis.type,
          history: Array.isArray(options.history) ? options.history : []
        };

        const retryResult = await this.controller.runTaskDirect(task, source, sanitizedOptions);
        if (retryResult && retryResult.ok) {
          this.recordHealingEvent({
            task,
            error: errMsg,
            type: diagnosis.type,
            healed: true,
            timestamp: new Date().toISOString()
          });

          return {
            healed: true,
            result: retryResult,
            explanation: `Automatically healed ${diagnosis.type} and completed task.`
          };
        }
      }
    } catch (healErr) {
      if (this.logger) {
        this.logger.error(`[SelfHealer] Healing attempt failed: ${healErr.message}`);
      }
    } finally {
      this.activeHeals.delete(healKey);
    }

    return { healed: false, explanation: errMsg };
  }

  /**
   * Classify error message into a repairable fault taxonomy.
   */
  classifyFault(errorMsg, task = '') {
    const msg = errorMsg.toLowerCase();
    const t = task.toLowerCase();

    if (msg.includes('is not defined') || msg.includes('cannot read properties of undefined') || msg.includes('referenceerror') || msg.includes('typeerror')) {
      return { type: 'VARIABLE_REFERENCE_FAULT', severity: 'medium' };
    }

    if (msg.includes('screen') || msg.includes('uitree') || msg.includes('input helper') || msg.includes('automation') || msg.includes('read screen') || msg.includes('timed out on command "uitree"')) {
      return { type: 'SCREEN_INSPECTION_FAULT', severity: 'high' };
    }

    if (msg.includes('vram') || msg.includes('cuda out of memory') || msg.includes('gpu memory') || msg.includes('model timed out') || msg.includes('context length') || msg.includes('connection refused') || msg.includes('11434')) {
      return { type: 'LOCAL_MODEL_EXHAUSTION_FAULT', severity: 'high' };
    }

    if (msg.includes('privacy shield is active')) {
      return { type: 'PRIVACY_SHIELD_ACTIVE', severity: 'low' };
    }

    if (msg.includes('not recognized as an internal or external command') || msg.includes('cannot find') || msg.includes('enoent') || msg.includes('not found')) {
      return { type: 'MISSING_TOOL_OR_COMMAND_FAULT', severity: 'medium' };
    }

    return { type: 'GENERIC_RUNTIME_FAULT', severity: 'low' };
  }

  /**
   * Auto-heal 1: Repair undefined variable or corrupt options references.
   */
  async healVariableReferenceFault({ options, task, error }) {
    if (this.logger) this.logger.info('[SelfHealer] Normalizing options context and purging undefined references.');
    if (!options || typeof options !== 'object') {
      options = {};
    }
    options.think = Boolean(options.think);
    options.history = Array.isArray(options.history) ? options.history : [];
    options.region = options.region || null;
    options.drawing = Boolean(options.drawing);
    options.image = options.image || null;
    options.speaker = options.speaker || null;
    options.userId = options.userId || 'admin';
    options.deviceId = options.deviceId || 'host_pc';
    return true;
  }

  /**
   * Auto-heal 2: Repair ScreenReader & InputHelper native process.
   */
  async healScreenInspectionFault() {
    if (this.logger) this.logger.info('[SelfHealer] Re-initializing ScreenReader and InputHelper native bridge.');
    if (this.controller) {
      // 1. Restart InputHelper
      if (this.controller.input && typeof this.controller.input.start === 'function') {
        try {
          if (this.controller.input.proc) {
            this.controller.input.proc.kill();
            this.controller.input.proc = null;
          }
          this.controller.input.ready = null;
          await this.controller.input.start();
        } catch {}
      }

      // 2. Reset ScreenReader cached items
      if (this.controller.agent && this.controller.agent.ui) {
        this.controller.agent.ui.shown = new Map();
        this.controller.agent.ui.latest = null;
      }
    }
    return true;
  }

  /**
   * Auto-heal 3: Model VRAM exhaustion or local inference engine failure.
   */
  async healModelExhaustionFault(diagnosis) {
    if (this.logger) this.logger.info('[SelfHealer] Performing VRAM purge and auto-routing tier adjustment.');
    if (this.controller && this.controller.settings) {
      // Switch to lighter tier or fallback model
      const currentProvider = this.controller.settings.get('provider');
      if (currentProvider === 'local') {
        // Fallback to fast 4B or Claude/OpenAI if available
        const currentModel = this.controller.settings.get('localModel');
        if (currentModel && !currentModel.includes('4b')) {
          this.controller.settings.update({ localModel: 'qwen3-vl-4b' });
        } else if (this.controller.settings.get('anthropicKey')) {
          this.controller.settings.update({ provider: 'anthropic' });
        } else if (this.controller.settings.get('openaiKey')) {
          this.controller.settings.update({ provider: 'openai' });
        }
      }

      // Force V8 GC if available
      if (global.gc) {
        try { global.gc(); } catch {}
      }
    }
    return true;
  }

  /**
   * Auto-heal 4: Command not found or tool path resolution failure.
   */
  async healMissingToolFault(diagnosis) {
    if (this.logger) this.logger.info('[SelfHealer] Inspecting system environment paths and reloading tool registry.');
    if (this.controller && this.controller.agent && this.controller.agent.plugins) {
      try {
        await this.controller.agent.plugins.load();
        return true;
      } catch {}
    }
    return false;
  }

  /**
   * Generic state reconciliation.
   */
  async genericStateReconciliation() {
    if (this.controller) {
      this.controller.setState('idle');
      if (this.controller.agent) {
        this.controller.agent.running = false;
        if (this.controller.agent.abort) {
          this.controller.agent.abort.abort();
        }
      }
    }
    return true;
  }

  recordHealingEvent(event) {
    this.healingHistory.push(event);
    if (this.healingHistory.length > 50) this.healingHistory.shift();
  }

  getHistory() {
    return this.healingHistory;
  }
}

let _selfHealerInstance = null;
function getSelfHealer(deps = {}) {
  if (!_selfHealerInstance) {
    _selfHealerInstance = new SelfHealer(deps);
  } else if (deps.controller) {
    _selfHealerInstance.setController(deps.controller);
  }
  return _selfHealerInstance;
}

module.exports = {
  SelfHealer,
  getSelfHealer,
};
