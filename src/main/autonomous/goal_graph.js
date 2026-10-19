'use strict';
// Autonomous Goal Directed Acyclic Graph (DAG) Engine for Mave.
// Inspired by AutoGPT's Goal Decomposition, Plan-and-Solve (ReWOO/LATS),
// and hierarchical TodoComponent execution architecture.

class GoalNode {
  /**
   * @param {object} opts
   * @param {string} opts.id - Unique node ID (e.g. "step_1_clone")
   * @param {string} opts.title - Concise milestone title
   * @param {string} [opts.description] - Detailed step instructions
   * @param {string[]} [opts.dependencies] - IDs of prerequisite nodes
   * @param {string} [opts.tool] - Optional suggested tool
   * @param {object} [opts.params] - Optional tool parameters
   * @param {string} [opts.commitment] - Stated commitment/guarantee for auditor
   * @param {number} [opts.maxRetries=2] - Max retries before node failure
   */
  constructor({ id, title, description = '', dependencies = [], tool = null, params = {}, commitment = '', maxRetries = 2 }) {
    this.id = String(id);
    this.title = String(title || id);
    this.description = String(description || '');
    this.dependencies = Array.isArray(dependencies) ? dependencies.map(String) : [];
    this.tool = tool;
    this.params = params || {};
    this.commitment = String(commitment || '');
    this.maxRetries = Number(maxRetries) || 2;

    this.status = 'pending'; // 'pending' | 'in_progress' | 'auditing' | 'completed' | 'failed' | 'skipped'
    this.actionProposal = null;
    this.result = null;
    this.error = null;
    this.attempts = 0;
    this.reflexions = []; // History of self-correcting diagnoses on failure
    this.auditLogs = [];  // History of fresh-context adversary checks
    this.startedAt = null;
    this.completedAt = null;
  }

  canExecute(completedNodeIds) {
    if (this.status !== 'pending') return false;
    const completedSet = completedNodeIds instanceof Set ? completedNodeIds : new Set(completedNodeIds);
    return this.dependencies.every((depId) => completedSet.has(depId));
  }

  markInProgress() {
    this.status = 'in_progress';
    this.attempts++;
    if (!this.startedAt) this.startedAt = Date.now();
  }

  markAuditing(proposal) {
    this.status = 'auditing';
    this.actionProposal = proposal;
  }

  recordAudit(auditResult) {
    this.auditLogs.push({
      timestamp: Date.now(),
      verdict: auditResult.verdict,
      approved: auditResult.approved,
      reason: auditResult.reason,
      auditor: auditResult.auditor || 'Zero-Theatre Auditor',
    });
  }

  markCompleted(result) {
    this.status = 'completed';
    this.result = result;
    this.completedAt = Date.now();
  }

  markFailed(error, reflexion = null) {
    this.error = error && error.message ? error.message : String(error);
    if (reflexion) {
      this.reflexions.push({
        attempt: this.attempts,
        timestamp: Date.now(),
        error: this.error,
        diagnosis: reflexion.diagnosis || '',
        recoveryStrategy: reflexion.recoveryStrategy || '',
      });
    }
    if (this.attempts > this.maxRetries) {
      this.status = 'failed';
      this.completedAt = Date.now();
    } else {
      // Return to pending to allow retry under new reflexion strategy
      this.status = 'pending';
    }
  }

  markSkipped(reason = '') {
    this.status = 'skipped';
    this.result = reason || 'Skipped due to dependency resolution';
    this.completedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      dependencies: this.dependencies,
      tool: this.tool,
      params: this.params,
      commitment: this.commitment,
      status: this.status,
      attempts: this.attempts,
      maxRetries: this.maxRetries,
      result: this.result,
      error: this.error,
      reflexions: this.reflexions,
      auditLogs: this.auditLogs,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  static fromJSON(data) {
    const node = new GoalNode({
      id: data.id,
      title: data.title,
      description: data.description,
      dependencies: data.dependencies,
      tool: data.tool,
      params: data.params,
      commitment: data.commitment,
      maxRetries: data.maxRetries,
    });
    node.status = data.status || 'pending';
    node.attempts = data.attempts || 0;
    node.result = data.result || null;
    node.error = data.error || null;
    node.reflexions = Array.isArray(data.reflexions) ? data.reflexions : [];
    node.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    node.startedAt = data.startedAt || null;
    node.completedAt = data.completedAt || null;
    return node;
  }
}

class AutonomousGoalDAG {
  /**
   * @param {object} opts
   * @param {string} opts.id - Unique execution ID
   * @param {string} opts.goal - High level user goal
   * @param {string} [opts.context] - Background environment / project context
   */
  constructor({ id, goal, context = '' }) {
    this.id = id || `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.goal = String(goal || '').trim();
    this.context = String(context || '').trim();
    this.nodes = new Map(); // id -> GoalNode
    this.status = 'planning'; // 'planning' | 'running' | 'paused' | 'completed' | 'failed'
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addNode(nodeOrOpts) {
    const node = nodeOrOpts instanceof GoalNode ? nodeOrOpts : new GoalNode(nodeOrOpts);
    this.nodes.set(node.id, node);
    this.updatedAt = Date.now();
    return node;
  }

  addEdge(fromId, toId) {
    const toNode = this.nodes.get(toId);
    if (toNode && !toNode.dependencies.includes(fromId)) {
      toNode.dependencies.push(fromId);
      this.updatedAt = Date.now();
    }
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  getCompletedNodeIds() {
    const set = new Set();
    for (const [id, node] of this.nodes.entries()) {
      if (node.status === 'completed' || node.status === 'skipped') {
        set.add(id);
      }
    }
    return set;
  }

  getExecutableNodes() {
    const completedSet = this.getCompletedNodeIds();
    const executable = [];
    for (const node of this.nodes.values()) {
      if (node.canExecute(completedSet)) {
        executable.push(node);
      }
    }
    return executable;
  }

  isComplete() {
    if (this.nodes.size === 0) return false;
    for (const node of this.nodes.values()) {
      if (node.status !== 'completed' && node.status !== 'skipped') {
        return false;
      }
    }
    return true;
  }

  hasFailed() {
    for (const node of this.nodes.values()) {
      if (node.status === 'failed') return true;
    }
    return false;
  }

  getProgress() {
    let completed = 0;
    let failed = 0;
    let inProgress = 0;
    let pending = 0;
    let auditing = 0;
    let skipped = 0;

    for (const node of this.nodes.values()) {
      if (node.status === 'completed') completed++;
      else if (node.status === 'failed') failed++;
      else if (node.status === 'in_progress') inProgress++;
      else if (node.status === 'auditing') auditing++;
      else if (node.status === 'skipped') skipped++;
      else pending++;
    }

    const total = this.nodes.size;
    const resolved = completed + skipped;
    const percentage = total === 0 ? 0 : Math.round((resolved / total) * 100);

    return {
      total,
      completed,
      skipped,
      failed,
      inProgress,
      auditing,
      pending,
      percentage,
      status: this.status,
    };
  }

  /**
   * Generates a clean markdown checklist representing the live execution status.
   */
  toChecklistMarkdown() {
    const lines = [`### 🎯 Autonomous Goal: "${this.goal}"\n`];
    const progress = this.getProgress();
    lines.push(`**Progress**: ${progress.percentage}% completed (${progress.completed}/${progress.total} milestones)\n`);

    for (const node of this.nodes.values()) {
      let icon = '[ ]';
      let tag = '';
      switch (node.status) {
        case 'completed':
          icon = '[✓]';
          tag = ' `COMPLETED`';
          break;
        case 'in_progress':
          icon = '[⏳]';
          tag = ' `EXECUTING`';
          break;
        case 'auditing':
          icon = '[🛡️]';
          tag = ' `AUDITING (Zero-Theatre Check)`';
          break;
        case 'failed':
          icon = '[✗]';
          tag = ` \`FAILED (Attempt ${node.attempts})\``;
          break;
        case 'skipped':
          icon = '[-]';
          tag = ' `SKIPPED`';
          break;
        default:
          icon = '[ ]';
          tag = ' `PENDING`';
          break;
      }

      const deps = node.dependencies.length ? ` *(after: ${node.dependencies.join(', ')})*` : '';
      lines.push(`- ${icon} **${node.title}**${tag}${deps}`);
      if (node.description) {
        lines.push(`  - *Plan*: ${node.description}`);
      }
      if (node.commitment) {
        lines.push(`  - *Commitment*: \`${node.commitment}\``);
      }
      if (node.result && node.status === 'completed') {
        const preview = typeof node.result === 'string' ? node.result.slice(0, 140) : JSON.stringify(node.result).slice(0, 140);
        lines.push(`  - *Output*: ${preview}${preview.length >= 140 ? '...' : ''}`);
      }
      if (node.error && node.status === 'failed') {
        lines.push(`  - *Error*: \`${node.error}\``);
      }
      if (node.reflexions.length > 0) {
        const lastReflexion = node.reflexions[node.reflexions.length - 1];
        lines.push(`  - 💡 *Reflexion*: ${lastReflexion.recoveryStrategy}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates a Mermaid DAG diagram string for rich visualization.
   */
  toMermaidDiagram() {
    const lines = ['flowchart TD'];
    for (const node of this.nodes.values()) {
      const safeId = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
      const safeTitle = node.title.replace(/["\\]/g, '');
      let style = '';
      if (node.status === 'completed') style = ':::completed';
      else if (node.status === 'in_progress') style = ':::active';
      else if (node.status === 'auditing') style = ':::auditing';
      else if (node.status === 'failed') style = ':::failed';

      lines.push(`  ${safeId}["${safeTitle}"]${style}`);

      for (const depId of node.dependencies) {
        const safeDepId = depId.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`  ${safeDepId} --> ${safeId}`);
      }
    }

    lines.push('  classDef completed fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff;');
    lines.push('  classDef active fill:#3b82f6,stroke:#2563eb,stroke-width:2px,color:#fff;');
    lines.push('  classDef auditing fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff;');
    lines.push('  classDef failed fill:#ef4444,stroke:#dc2626,stroke-width:2px,color:#fff;');

    return lines.join('\n');
  }

  toJSON() {
    return {
      id: this.id,
      goal: this.goal,
      context: this.context,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      nodes: Array.from(this.nodes.values()).map((n) => n.toJSON()),
    };
  }

  static fromJSON(data) {
    const dag = new AutonomousGoalDAG({
      id: data.id,
      goal: data.goal,
      context: data.context,
    });
    dag.status = data.status || 'planning';
    dag.createdAt = data.createdAt || Date.now();
    dag.updatedAt = data.updatedAt || Date.now();
    if (Array.isArray(data.nodes)) {
      for (const nodeData of data.nodes) {
        dag.addNode(GoalNode.fromJSON(nodeData));
      }
    }
    return dag;
  }

  /**
   * Decomposes any goal into a multi-step DAG.
   * Uses heuristic pattern matching or structured input.
   */
  static decompose(goal, context = '') {
    const dag = new AutonomousGoalDAG({ goal, context });
    const g = goal.toLowerCase();

    // 1. Coding / Repository / Development workflow
    if (g.includes('clone') || g.includes('build') || g.includes('test') || g.includes('refactor') || g.includes('fix bug') || g.includes('pull request')) {
      dag.addNode(new GoalNode({
        id: 'inspect_workspace',
        title: 'Inspect Workspace & Environment',
        description: 'Examine directory structure, package manifests, and active branch state.',
        tool: 'run_command',
        params: { command: 'git status; dir' },
        commitment: 'Read-only inspection of repository state.',
      }));
      dag.addNode(new GoalNode({
        id: 'analyze_requirements',
        title: 'Analyze Requirements & Dependencies',
        description: 'Review dependencies, configuration files, and target code files.',
        dependencies: ['inspect_workspace'],
        commitment: 'Verify dependencies without external network leaks.',
      }));
      dag.addNode(new GoalNode({
        id: 'execute_modifications',
        title: 'Implement Code or Configuration Changes',
        description: 'Apply high-precision modifications adhering to Antigravity and Codex standards.',
        dependencies: ['analyze_requirements'],
        commitment: 'Modify only targeted source files; preserve existing documentation and contracts.',
      }));
      dag.addNode(new GoalNode({
        id: 'verify_and_test',
        title: 'Automated Test Verification & Zero-Regression Check',
        description: 'Run project test suite and verify clean exit codes.',
        dependencies: ['execute_modifications'],
        tool: 'run_command',
        params: { command: 'npm test' },
        commitment: 'Execute test harness and report pass/fail metrics.',
      }));
      dag.addNode(new GoalNode({
        id: 'summarize_deliverable',
        title: 'Synthesize Executive Deliverable',
        description: 'Generate concise executive summary of completed changes.',
        dependencies: ['verify_and_test'],
        commitment: 'Present complete audit trail and next steps.',
      }));
      return dag;
    }

    // 2. Data processing / File organization
    if (g.includes('organize') || g.includes('clean') || g.includes('csv') || g.includes('download') || g.includes('files') || g.includes('backup')) {
      dag.addNode(new GoalNode({
        id: 'scan_target_files',
        title: 'Scan Target Files & Collect Metadata',
        description: 'Discover all target files, calculate sizes, and detect duplicates.',
        tool: 'run_command',
        commitment: 'Read-only traversal of specified folders.',
      }));
      dag.addNode(new GoalNode({
        id: 'audit_plan',
        title: 'Audit Organization Strategy',
        description: 'Validate destination paths and prevent accidental data loss.',
        dependencies: ['scan_target_files'],
        commitment: 'Ensure no destructive operations without backup.',
      }));
      dag.addNode(new GoalNode({
        id: 'execute_organization',
        title: 'Process and Organize Files',
        description: 'Relocate, transform, or categorize files as planned.',
        dependencies: ['audit_plan'],
        commitment: 'Safely move files to target directories.',
      }));
      dag.addNode(new GoalNode({
        id: 'verify_filesystem',
        title: 'Verify File Integrity & Generate Report',
        description: 'Confirm all items are accounted for and produce summary log.',
        dependencies: ['execute_organization'],
        commitment: 'Produce complete audit report.',
      }));
      return dag;
    }

    // 3. Research / Analysis / Dual-Model synthesis
    if (g.includes('research') || g.includes('analyze') || g.includes('compare') || g.includes('report') || g.includes('investigate')) {
      dag.addNode(new GoalNode({
        id: 'gather_evidence',
        title: 'Gather Fact-Based Evidence & Ground Truth',
        description: 'Search web, read source repositories, and pull verified documentation.',
        tool: 'web_search',
        commitment: 'Retrieve verified real-world facts without hallucination.',
      }));
      dag.addNode(new GoalNode({
        id: 'cross_examine',
        title: 'Cross-Examine Perspectives & Models',
        description: 'Analyze findings through dual-model synthesis and counter-arguments.',
        dependencies: ['gather_evidence'],
        commitment: 'Objective multi-perspective analysis.',
      }));
      dag.addNode(new GoalNode({
        id: 'synthesize_report',
        title: 'Synthesize High-Impact Report',
        description: 'Formulate final structured analysis with actionable recommendations.',
        dependencies: ['cross_examine'],
        commitment: 'Clear, substantiated executive deliverable.',
      }));
      return dag;
    }

    // Default 3-stage autonomous workflow
    dag.addNode(new GoalNode({
      id: 'step_1_plan_and_survey',
      title: 'Survey Environment & Define Strategy',
      description: `Analyze prerequisites for: "${goal}".`,
      commitment: 'Read-only survey of current system state.',
    }));
    dag.addNode(new GoalNode({
      id: 'step_2_execute_core_actions',
      title: 'Execute Core Autonomous Actions',
      description: `Perform primary tasks required for: "${goal}".`,
      dependencies: ['step_1_plan_and_survey'],
      commitment: 'Execute actions strictly adhering to user intent.',
    }));
    dag.addNode(new GoalNode({
      id: 'step_3_verify_and_conclude',
      title: 'Verify Results & Deliver Summary',
      description: 'Audit output against goal acceptance criteria.',
      dependencies: ['step_2_execute_core_actions'],
      commitment: 'Validate outcome and report completion to user.',
    }));

    return dag;
  }
}

module.exports = {
  GoalNode,
  AutonomousGoalDAG,
};
