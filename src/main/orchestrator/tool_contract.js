'use strict';

const fs = require('fs');
const path = require('path');

const EvidenceClassification = {
  DIRECTLY_OBSERVED: 'DIRECTLY_OBSERVED',
  RETRIEVED_FROM_SOURCE: 'RETRIEVED_FROM_SOURCE',
  RETURNED_BY_TOOL: 'RETURNED_BY_TOOL',
  STORED_IN_VERIFIED_MEMORY: 'STORED_IN_VERIFIED_MEMORY',
  MODEL_INFERENCE: 'MODEL_INFERENCE',
  UNCERTAIN: 'UNCERTAIN',
  UNSUPPORTED: 'UNSUPPORTED',
};

class ToolContractValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ToolContractValidationError';
    this.details = details;
  }
}

/**
 * Standard typed schema for registered MAVE tools.
 */
class ToolContract {
  /**
   * @param {object} spec
   * @param {string} spec.name - Tool identifier
   * @param {string} spec.description - Purpose of the tool
   * @param {string} [spec.category='general'] - Subsystem category
   * @param {object} [spec.parameters={}] - Schema of parameters { [key]: { type, required, description, enum } }
   * @param {string} [spec.executionEnvironment='guest_vm'] - 'guest_vm' | 'sandbox' | 'host'
   * @param {number} [spec.timeoutMs=30000] - Execution timeout
   * @param {number} [spec.maxRetries=1] - Retry count on transient error
   * @param {boolean} [spec.requiresApproval=false] - Whether explicit human approval is mandatory
   * @param {Function} [spec.outputValidator=null] - Optional function(output) => boolean
   */
  constructor(spec = {}) {
    if (!spec.name) throw new Error('ToolContract requires a tool name.');
    this.name = String(spec.name).trim();
    this.description = String(spec.description || '');
    this.category = spec.category || 'general';
    this.parameters = spec.parameters || {};
    this.executionEnvironment = spec.executionEnvironment || 'guest_vm';
    this.timeoutMs = Number(spec.timeoutMs) || 30000;
    this.maxRetries = Number(spec.maxRetries) || 1;
    this.requiresApproval = Boolean(spec.requiresApproval);
    this.outputValidator = typeof spec.outputValidator === 'function' ? spec.outputValidator : null;
  }

  /**
   * Validate incoming tool invocation arguments against the schema.
   */
  validateArgs(args = {}) {
    const safeArgs = args && typeof args === 'object' ? { ...args } : {};

    for (const [paramName, paramDef] of Object.entries(this.parameters)) {
      const val = safeArgs[paramName];

      if (paramDef.required && (val === undefined || val === null || val === '')) {
        throw new ToolContractValidationError(`Missing required parameter "${paramName}" for tool "${this.name}".`, {
          tool: this.name,
          paramName,
          expected: paramDef,
        });
      }

      if (val !== undefined && val !== null) {
        const expectedType = paramDef.type;
        if (expectedType) {
          if (expectedType === 'array') {
            if (!Array.isArray(val)) {
              throw new ToolContractValidationError(`Parameter "${paramName}" must be an array. Got ${typeof val}.`, {
                tool: this.name,
                paramName,
                val,
              });
            }
          } else if (expectedType === 'object') {
            if (typeof val !== 'object' || Array.isArray(val)) {
              throw new ToolContractValidationError(`Parameter "${paramName}" must be an object. Got ${typeof val}.`, {
                tool: this.name,
                paramName,
                val,
              });
            }
          } else if (typeof val !== expectedType) {
            throw new ToolContractValidationError(`Parameter "${paramName}" must be of type "${expectedType}". Got ${typeof val}.`, {
              tool: this.name,
              paramName,
              val,
            });
          }
        }

        if (Array.isArray(paramDef.enum) && !paramDef.enum.includes(val)) {
          throw new ToolContractValidationError(`Parameter "${paramName}" must be one of [${paramDef.enum.join(', ')}]. Got "${val}".`, {
            tool: this.name,
            paramName,
            val,
            allowed: paramDef.enum,
          });
        }
      }
    }

    return safeArgs;
  }
}

/**
 * Audit record of a tool execution for zero-hallucination verification.
 */
class ToolExecutionRecord {
  constructor(spec = {}) {
    this.id = spec.id || `tool_exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.tool = spec.tool;
    this.args = spec.args || {};
    this.status = spec.status || 'pending'; // 'pending' | 'success' | 'failed' | 'timeout' | 'rejected'
    this.rawOutput = spec.rawOutput !== undefined ? spec.rawOutput : null;
    this.errorMessage = spec.errorMessage || null;
    this.executionEnvironment = spec.executionEnvironment || 'guest_vm';
    this.startedAt = spec.startedAt || Date.now();
    this.completedAt = spec.completedAt || null;
    this.durationMs = spec.durationMs || 0;
    this.artifacts = spec.artifacts || []; // List of verified file paths or created entities
    this.evidenceClassification = spec.evidenceClassification || EvidenceClassification.RETURNED_BY_TOOL;
  }

  complete(output, artifacts = []) {
    this.status = 'success';
    this.rawOutput = output;
    this.completedAt = Date.now();
    this.durationMs = this.completedAt - this.startedAt;
    this.artifacts = artifacts;
    this.evidenceClassification = EvidenceClassification.RETURNED_BY_TOOL;
  }

  fail(errorMessage) {
    this.status = 'failed';
    this.errorMessage = errorMessage && errorMessage.message ? errorMessage.message : String(errorMessage);
    this.completedAt = Date.now();
    this.durationMs = this.completedAt - this.startedAt;
  }

  toJSON() {
    return {
      id: this.id,
      tool: this.tool,
      args: this.args,
      status: this.status,
      rawOutput: typeof this.rawOutput === 'string' && this.rawOutput.length > 2000
        ? `${this.rawOutput.slice(0, 2000)}... [truncated]`
        : this.rawOutput,
      errorMessage: this.errorMessage,
      executionEnvironment: this.executionEnvironment,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      durationMs: this.durationMs,
      artifacts: this.artifacts,
      evidenceClassification: this.evidenceClassification,
    };
  }
}

/**
 * Registry and Grounding Verifier for tools.
 */
class ToolRegistryAndVerifier {
  constructor() {
    this.contracts = new Map();
    this.executionHistory = [];
  }

  registerContract(contract) {
    if (!(contract instanceof ToolContract)) {
      contract = new ToolContract(contract);
    }
    this.contracts.set(contract.name, contract);
    return contract;
  }

  getContract(toolName) {
    return this.contracts.get(toolName) || null;
  }

  hasContract(toolName) {
    return this.contracts.has(toolName);
  }

  /**
   * Validate tool call before execution.
   */
  validateToolCall(toolName, rawArgs = {}) {
    const contract = this.getContract(toolName);
    if (!contract) {
      throw new ToolContractValidationError(`Tool "${toolName}" is not registered in MAVE Tool Registry.`, {
        toolName,
        registeredTools: Array.from(this.contracts.keys()),
      });
    }
    return contract.validateArgs(rawArgs);
  }

  recordExecutionStart(toolName, args, executionEnvironment = 'guest_vm') {
    const record = new ToolExecutionRecord({
      tool: toolName,
      args,
      executionEnvironment,
      startedAt: Date.now(),
    });
    this.executionHistory.push(record);
    if (this.executionHistory.length > 500) this.executionHistory.shift();
    return record;
  }

  /**
   * Verify whether a claimed deliverable or action has physical grounding in execution records.
   * Prevents LLM from stating "I created website.html" when no write_file succeeded.
   */
  verifyDeliverableGrounding(claimedArtifactPath) {
    if (!claimedArtifactPath) return { grounded: false, reason: 'Empty artifact path provided' };

    const normTarget = path.normalize(String(claimedArtifactPath)).toLowerCase();

    // Check if any successful tool execution produced this artifact
    const matching = this.executionHistory.find((rec) => {
      if (rec.status !== 'success') return false;
      if (Array.isArray(rec.artifacts)) {
        return rec.artifacts.some((a) => path.normalize(String(a)).toLowerCase() === normTarget);
      }
      if (rec.args && (rec.args.path || rec.args.filePath)) {
        const p = path.normalize(String(rec.args.path || rec.args.filePath)).toLowerCase();
        return p === normTarget || p.endsWith(normTarget) || normTarget.endsWith(p);
      }
      return false;
    });

    if (matching) {
      return { grounded: true, record: matching, evidence: EvidenceClassification.RETURNED_BY_TOOL };
    }

    // Check physical filesystem if path is absolute or exists relative to workspace
    if (fs.existsSync(claimedArtifactPath)) {
      return { grounded: true, physicalExists: true, evidence: EvidenceClassification.DIRECTLY_OBSERVED };
    }

    return {
      grounded: false,
      reason: `Claimed deliverable "${claimedArtifactPath}" has no successful tool execution record and does not physically exist.`,
      evidence: EvidenceClassification.UNSUPPORTED,
    };
  }

  getRecentExecutions(limit = 20) {
    return this.executionHistory.slice(-limit);
  }

  clear() {
    this.executionHistory = [];
  }
}

let defaultToolRegistry = null;

function getToolRegistryAndVerifier() {
  if (!defaultToolRegistry) {
    defaultToolRegistry = new ToolRegistryAndVerifier();
  }
  return defaultToolRegistry;
}

module.exports = {
  EvidenceClassification,
  ToolContractValidationError,
  ToolContract,
  ToolExecutionRecord,
  ToolRegistryAndVerifier,
  getToolRegistryAndVerifier,
};
