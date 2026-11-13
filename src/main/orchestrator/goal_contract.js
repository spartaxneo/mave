'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TaskStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  QUEUED: 'queued',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  BLOCKED: 'blocked',
  FAILED: 'failed',
};

class GoalContract {
  /**
   * @param {object} spec
   * @param {string} [spec.taskId] - Unique task ID
   * @param {string} [spec.userId='default'] - User identity
   * @param {string} [spec.sessionId] - Active conversational session ID
   * @param {string} spec.originalRequest - Immutable user prompt/directive
   * @param {string} [spec.confirmedObjective] - Structured objective formulation
   * @param {string[]} [spec.expectedDeliverables=[]] - Expected physical artifacts or outcomes
   * @param {object} [spec.scope={}] - Allowed tools, target paths, boundaries
   * @param {object} [spec.constraints={}] - Privacy, offline-only, budget
   * @param {string[]} [spec.approvalRequirements=[]] - Operations needing explicit confirmation
   * @param {object[]} [spec.completionConditions=[]] - Verifiable acceptance checks
   */
  constructor(spec = {}) {
    if (!spec.originalRequest) {
      throw new Error('GoalContract requires an originalRequest string.');
    }

    this.taskId = spec.taskId || `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.userId = String(spec.userId || 'default').trim();
    this.sessionId = String(spec.sessionId || `session_${Date.now()}`).trim();

    // IMMUTABLE AUDIT RECORD of the user's original directive
    this.originalRequest = Object.freeze(String(spec.originalRequest).trim());

    this.confirmedObjective = String(spec.confirmedObjective || this.originalRequest).trim();
    this.expectedDeliverables = Array.isArray(spec.expectedDeliverables) ? [...spec.expectedDeliverables] : [];
    this.scope = spec.scope ? { ...spec.scope } : { allowedTools: [], targetPaths: [] };
    this.constraints = spec.constraints ? { ...spec.constraints } : {};
    this.approvalRequirements = Array.isArray(spec.approvalRequirements) ? [...spec.approvalRequirements] : [];
    this.completionConditions = Array.isArray(spec.completionConditions) ? [...spec.completionConditions] : [];

    this.status = spec.status || TaskStatus.PENDING;
    this.currentPhase = spec.currentPhase || 'initialization';
    this.activeWorkers = new Map(); // workerId -> workerMeta
    this.subtasks = []; // List of decomposed subtasks
    this.executionHistory = []; // Event audit log
    this.checkpoints = []; // State recovery checkpoints
    this.createdAt = spec.createdAt || Date.now();
    this.updatedAt = spec.updatedAt || Date.now();
    this.completedAt = spec.completedAt || null;
    this.verificationResults = null;
    this.failureReason = null;
  }

  /**
   * Update the confirmed objective or deliverables if clarified by user,
   * while keeping the originalRequest permanently frozen.
   */
  clarifyObjective(newObjective, addedDeliverables = [], reason = 'User clarification') {
    if (newObjective) {
      this.confirmedObjective = String(newObjective).trim();
    }
    if (Array.isArray(addedDeliverables)) {
      for (const d of addedDeliverables) {
        if (!this.expectedDeliverables.includes(d)) {
          this.expectedDeliverables.push(d);
        }
      }
    }
    this.updatedAt = Date.now();
    this.recordHistory('CLARIFICATION', { reason, newObjective, addedDeliverables });
  }

  setStatus(newStatus, reason = '') {
    const validStatuses = Object.values(TaskStatus);
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid task status: ${newStatus}. Valid: ${validStatuses.join(', ')}`);
    }
    const oldStatus = this.status;
    this.status = newStatus;
    this.updatedAt = Date.now();
    if (newStatus === TaskStatus.COMPLETED || newStatus === TaskStatus.FAILED || newStatus === TaskStatus.CANCELLED) {
      this.completedAt = Date.now();
    }
    this.recordHistory('STATUS_CHANGE', { from: oldStatus, to: newStatus, reason });
  }

  setPhase(phaseName) {
    this.currentPhase = String(phaseName || 'executing');
    this.updatedAt = Date.now();
    this.recordHistory('PHASE_CHANGE', { phase: this.currentPhase });
  }

  addSubtask(subtask) {
    const st = {
      id: subtask.id || `sub_${this.subtasks.length + 1}`,
      title: subtask.title,
      description: subtask.description || '',
      assignedWorker: subtask.assignedWorker || null,
      status: 'pending',
      dependencies: subtask.dependencies || [],
      deliverable: subtask.deliverable || null,
    };
    this.subtasks.push(st);
    this.updatedAt = Date.now();
    return st;
  }

  updateSubtask(id, updates = {}) {
    const st = this.subtasks.find((s) => s.id === id);
    if (st) {
      Object.assign(st, updates);
      this.updatedAt = Date.now();
    }
    return st;
  }

  recordHistory(action, details = {}) {
    this.executionHistory.push({
      timestamp: Date.now(),
      action,
      phase: this.currentPhase,
      details,
    });
    if (this.executionHistory.length > 500) this.executionHistory.shift();
  }

  /**
   * Save a durable checkpoint for recovery across restarts.
   */
  saveCheckpoint(checkpointDir = null) {
    const checkpoint = {
      checkpointId: `cp_${Date.now()}_${this.checkpoints.length + 1}`,
      timestamp: Date.now(),
      taskId: this.taskId,
      status: this.status,
      currentPhase: this.currentPhase,
      subtasks: JSON.parse(JSON.stringify(this.subtasks)),
      expectedDeliverables: [...this.expectedDeliverables],
    };
    this.checkpoints.push(checkpoint);

    if (checkpointDir) {
      try {
        fs.mkdirSync(checkpointDir, { recursive: true });
        const filePath = path.join(checkpointDir, `${this.taskId}_checkpoint.json`);
        fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), 'utf8');
      } catch (err) {
        // Non-fatal write failure
      }
    }

    return checkpoint;
  }

  toJSON() {
    return {
      taskId: this.taskId,
      userId: this.userId,
      sessionId: this.sessionId,
      originalRequest: this.originalRequest,
      confirmedObjective: this.confirmedObjective,
      expectedDeliverables: this.expectedDeliverables,
      scope: this.scope,
      constraints: this.constraints,
      approvalRequirements: this.approvalRequirements,
      completionConditions: this.completionConditions,
      status: this.status,
      currentPhase: this.currentPhase,
      subtasks: this.subtasks,
      activeWorkers: Array.from(this.activeWorkers.entries()),
      executionHistory: this.executionHistory,
      checkpoints: this.checkpoints,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      verificationResults: this.verificationResults,
      failureReason: this.failureReason,
    };
  }

  static fromJSON(data) {
    const contract = new GoalContract({
      taskId: data.taskId,
      userId: data.userId,
      sessionId: data.sessionId,
      originalRequest: data.originalRequest,
      confirmedObjective: data.confirmedObjective,
      expectedDeliverables: data.expectedDeliverables,
      scope: data.scope,
      constraints: data.constraints,
      approvalRequirements: data.approvalRequirements,
      completionConditions: data.completionConditions,
      status: data.status,
      currentPhase: data.currentPhase,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: data.completedAt,
    });
    contract.subtasks = data.subtasks || [];
    contract.executionHistory = data.executionHistory || [];
    contract.checkpoints = data.checkpoints || [];
    contract.verificationResults = data.verificationResults || null;
    contract.failureReason = data.failureReason || null;
    return contract;
  }
}

module.exports = {
  TaskStatus,
  GoalContract,
};
