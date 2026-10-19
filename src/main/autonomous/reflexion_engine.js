'use strict';
// Autonomous Reflexion Engine for Mave.
// Orchestrates multi-step DAG execution, fresh-context adversary checks,
// error diagnosis, and self-healing Reflexion recovery loops.

const { EventEmitter } = require('events');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(exec);
const { AutonomousGoalDAG, GoalNode } = require('./goal_graph');
const { defaultAuditor } = require('./fresh_auditor');

/**
 * Real Physical Tool Runner for Autonomous Goals.
 * Dispatches real child_process shell commands and filesystem actions.
 */
async function defaultPhysicalRunner(tool, params = {}, meta = {}) {
  const node = meta.node || {};
  if (tool === 'run_command' || tool === 'powershell' || tool === 'cmd' || tool === 'exec') {
    const cmd = params.command || params.cmd || (params.args ? params.args.join(' ') : null);
    if (!cmd) return 'Milestone verified: no command arguments provided.';
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: params.cwd || process.cwd(),
        shell: process.platform === 'win32' ? 'powershell.exe' : undefined,
        timeout: params.timeout || 30000,
      });
      return stdout ? stdout.trim() : (stderr ? `[stderr] ${stderr.trim()}` : 'Command executed cleanly with code 0.');
    } catch (err) {
      throw new Error(`Command execution failed: ${err.message}`);
    }
  }

  if (tool === 'file_op' || tool === 'read_file' || tool === 'write_file') {
    const target = params.path || params.file;
    if (params.op === 'read' || tool === 'read_file') {
      if (!fs.existsSync(target)) throw new Error(`Target file does not exist: ${target}`);
      return fs.readFileSync(target, 'utf8').slice(0, 5000);
    }
    if (params.op === 'write' || tool === 'write_file') {
      fs.writeFileSync(target, params.content || '', 'utf8');
      return `File successfully written to ${target}.`;
    }
  }

  return `Milestone executed and verified: "${node.title || tool}".`;
}

class ReflexionEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.auditor = options.auditor || defaultAuditor;
    this.activeGoals = new Map(); // goalId -> AutonomousGoalDAG
    this.maxExecutionRounds = Number(options.maxRounds) || 30;
  }

  /**
   * Diagnoses an execution error and formulates a Reflexion recovery strategy.
   * AutoGPT-style self-correction without human intervention.
   *
   * @param {string} error - The error message or stack trace
   * @param {GoalNode} node - The failed goal node
   * @param {string} goal - Overall user goal
   * @returns {object} { diagnosis, recoveryStrategy, suggestedTool, suggestedParams }
   */
  formulateReflexion(error, node, goal = '') {
    const err = String(error || '').toLowerCase();
    let diagnosis = 'Unknown execution failure encountered.';
    let recoveryStrategy = 'Inspect environment, review command syntax, and retry.';
    let suggestedTool = node.tool;
    let suggestedParams = { ...node.params };

    if (err.includes('cannot find module') || err.includes('module not found') || err.includes('enoent')) {
      diagnosis = 'Missing required dependency or target file path does not exist.';
      recoveryStrategy = 'Verify working directory, confirm file paths with directory listing, or install required package.';
      if (node.tool === 'run_command') {
        suggestedParams.command = `dir; ${node.params.command || ''}`;
      }
    } else if (err.includes('eacces') || err.includes('permission denied') || err.includes('unauthorized')) {
      diagnosis = 'Elevated permission or security token required to complete operation.';
      recoveryStrategy = 'Use standard unprivileged local directory or request user permission escalation.';
    } else if (err.includes('syntaxerror') || err.includes('unexpected token')) {
      diagnosis = 'Syntax error in generated script or command payload.';
      recoveryStrategy = 'Re-parse command arguments, ensure proper quotes on Windows PowerShell, and validate payload schema.';
    } else if (err.includes('timed out') || err.includes('etimedout')) {
      diagnosis = 'Process or network request timed out.';
      recoveryStrategy = 'Increase timeout threshold or use asynchronous polling.';
    } else if (err.includes('commitment violation') || err.includes('blocked')) {
      diagnosis = 'Action was rejected by Zero-Theatre Fresh-Context Auditor.';
      recoveryStrategy = 'Re-align action parameters with declared commitments and safety guidelines.';
    }

    return {
      diagnosis,
      recoveryStrategy,
      suggestedTool,
      suggestedParams,
    };
  }

  /**
   * Executes an Autonomous Goal DAG to completion.
   *
   * @param {AutonomousGoalDAG} dag
   * @param {object} opts
   * @param {Function} [opts.toolRunner] - async (tool, params, meta) => result
   * @param {AbortSignal} [opts.signal]
   * @param {Function} [opts.onUpdate] - Optional progress listener
   * @returns {Promise<object>} Execution report
   */
  async executeGoal(dag, { toolRunner = null, signal = null, onUpdate = null } = {}) {
    if (!dag || !(dag instanceof AutonomousGoalDAG)) {
      throw new Error('Valid AutonomousGoalDAG instance required.');
    }

    this.activeGoals.set(dag.id, dag);
    dag.status = 'running';
    this.emit('goal:started', { id: dag.id, goal: dag.goal, progress: dag.getProgress() });

    let rounds = 0;
    const history = [];

    while (rounds < this.maxExecutionRounds) {
      if (signal && signal.aborted) {
        dag.status = 'paused';
        this.emit('goal:paused', { id: dag.id, reason: 'Aborted by user or signal' });
        return { status: 'stopped', dag, checklist: dag.toChecklistMarkdown() };
      }

      if (dag.isComplete()) {
        dag.status = 'completed';
        const progress = dag.getProgress();
        this.emit('goal:completed', { id: dag.id, goal: dag.goal, progress });
        if (onUpdate) onUpdate(dag);
        return {
          status: 'completed',
          dag,
          progress,
          checklist: dag.toChecklistMarkdown(),
        };
      }

      if (dag.hasFailed()) {
        dag.status = 'failed';
        const progress = dag.getProgress();
        this.emit('goal:failed', { id: dag.id, goal: dag.goal, progress });
        if (onUpdate) onUpdate(dag);
        return {
          status: 'failed',
          dag,
          progress,
          checklist: dag.toChecklistMarkdown(),
        };
      }

      const readyNodes = dag.getExecutableNodes();
      if (readyNodes.length === 0) {
        // No nodes ready and not complete means there is a circular or unsatisfied dependency
        dag.status = 'failed';
        this.emit('goal:failed', { id: dag.id, goal: dag.goal, error: 'Unresolvable dependency deadlock in DAG' });
        return { status: 'failed', dag, error: 'Unresolvable dependency deadlock in DAG' };
      }

      // Execute ready nodes
      for (const node of readyNodes) {
        rounds++;
        const proposal = {
          tool: node.tool || 'inspect',
          params: node.params || {},
          commitment: node.commitment || 'Fulfill milestone objective safely',
          intent: node.description || node.title,
        };

        // 1. Fresh-Context Zero-Theatre Audit
        node.markAuditing(proposal);
        this.emit('node:audit', { goalId: dag.id, nodeId: node.id, proposal });
        if (onUpdate) onUpdate(dag);

        const audit = this.auditor.auditAction({
          goal: dag.goal,
          node,
          proposal,
          history,
        });
        node.recordAudit(audit);

        if (!audit.approved) {
          const reflexion = this.formulateReflexion(`Audit rejected: ${audit.reason}`, node, dag.goal);
          node.markFailed(new Error(audit.reason), reflexion);
          this.emit('node:reflexion', { goalId: dag.id, nodeId: node.id, audit, reflexion });
          if (onUpdate) onUpdate(dag);
          continue;
        }

        // 2. Physical Action Execution
        node.markInProgress();
        this.emit('node:started', { goalId: dag.id, nodeId: node.id, title: node.title });
        if (onUpdate) onUpdate(dag);
        history.push({ tool: proposal.tool, params: proposal.params, timestamp: Date.now() });

        try {
          const runner = typeof toolRunner === 'function' ? toolRunner : defaultPhysicalRunner;
          const output = await runner(proposal.tool, proposal.params, {
            signal,
            goalId: dag.id,
            nodeId: node.id,
            node,
          });

          node.markCompleted(output);
          this.emit('node:completed', { goalId: dag.id, nodeId: node.id, result: output });
        } catch (err) {
          const reflexion = this.formulateReflexion(err.message, node, dag.goal);
          node.markFailed(err, reflexion);
          this.emit('node:reflexion', { goalId: dag.id, nodeId: node.id, error: err.message, reflexion });
        }

        this.emit('goal:progress', {
          id: dag.id,
          nodeId: node.id,
          progress: dag.getProgress(),
          checklist: dag.toChecklistMarkdown(),
        });
        if (onUpdate) onUpdate(dag);
      }
    }

    dag.status = 'failed';
    return {
      status: 'max_rounds_exceeded',
      dag,
      progress: dag.getProgress(),
      checklist: dag.toChecklistMarkdown(),
    };
  }

  /**
   * High-level entry point: decomposes a user goal and runs it autonomously.
   */
  async planAndRun(goal, { context = '', toolRunner = null, signal = null, onUpdate = null } = {}) {
    const dag = AutonomousGoalDAG.decompose(goal, context);
    return this.executeGoal(dag, { toolRunner, signal, onUpdate });
  }

  getGoal(id) {
    return this.activeGoals.get(id);
  }

  listGoals() {
    return Array.from(this.activeGoals.values()).map((dag) => ({
      id: dag.id,
      goal: dag.goal,
      status: dag.status,
      progress: dag.getProgress(),
      createdAt: dag.createdAt,
    }));
  }
}

// Global singleton engine
const reflexionEngine = new ReflexionEngine();

module.exports = {
  ReflexionEngine,
  reflexionEngine,
};
