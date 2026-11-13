'use strict';

const EventEmitter = require('events');
const { AutonomousGoalGraph, GoalNode } = require('./goal_graph');
const { getVirtualComputerSession, ENVIRONMENTS } = require('../virtual_computer');

class BaseWorker {
  constructor(name, session, role = 'general') {
    this.name = name;
    this.session = session;
    this.role = role;
    this.activeTask = null;
    this.status = 'idle'; // 'idle' | 'busy' | 'paused' | 'error'
  }

  async executeStep(node) {
    throw new Error('executeStep must be implemented by concrete worker subclass.');
  }
}

class ResearchWorker extends BaseWorker {
  constructor(session) {
    super('ResearchWorker', session, 'web_research');
  }

  async executeStep(node) {
    this.status = 'busy';
    this.activeTask = node.title;
    this.session.updateProgress(`[${this.name}] Executing: ${node.title}`);

    const params = node.params || {};
    let result = null;

    if (params.url) {
      result = await this.session.executeGuestAction('open_url', { url: params.url });
    } else if (params.searchQuery) {
      const queryUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(params.searchQuery)}`;
      result = await this.session.executeGuestAction('open_url', { url: queryUrl });
    } else {
      result = await this.session.executeGuestAction('screenshot');
    }

    this.status = 'idle';
    this.activeTask = null;
    return { ok: true, worker: this.name, output: result };
  }
}

class CodingWorker extends BaseWorker {
  constructor(session) {
    super('CodingWorker', session, 'software_engineering');
  }

  async executeStep(node) {
    this.status = 'busy';
    this.activeTask = node.title;
    this.session.updateProgress(`[${this.name}] Executing: ${node.title}`);

    const params = node.params || {};
    let result = null;

    if (params.code && params.filePath) {
      result = await this.session.executeGuestAction('write_file', {
        path: params.filePath,
        content: params.code,
      });
    } else if (params.command) {
      result = await this.session.executeGuestAction('run_command', {
        command: params.command,
      });
    } else {
      result = await this.session.executeGuestAction('list_directory', { path: '.' });
    }

    this.status = 'idle';
    this.activeTask = null;
    return { ok: true, worker: this.name, output: result };
  }
}

class MissionController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.session = options.session || getVirtualComputerSession();
    this.researchWorker = new ResearchWorker(this.session);
    this.codingWorker = new CodingWorker(this.session);
    this.activeMission = null;
    this.activeGraph = null;
    this.status = 'idle'; // 'idle' | 'planning' | 'running' | 'completed' | 'failed'
    this.missionLogs = [];
  }

  log(level, message) {
    const entry = { timestamp: Date.now(), level, message };
    this.missionLogs.push(entry);
    if (this.missionLogs.length > 200) this.missionLogs.shift();
    this.emit('log', entry);
  }

  /**
   * Plan and execute a multi-worker autonomous mission inside the Virtual Computer.
   */
  async startMission(missionObjective, planSteps = []) {
    this.status = 'planning';
    this.activeMission = missionObjective;
    this.session.setActiveTask(missionObjective, ENVIRONMENTS.VIRTUAL_COMPUTER);
    this.log('info', `Starting Mission: "${missionObjective}"`);

    this.activeGraph = new AutonomousGoalGraph(missionObjective);

    if (Array.isArray(planSteps) && planSteps.length > 0) {
      for (const step of planSteps) {
        this.activeGraph.addNode(new GoalNode(step));
      }
    } else {
      // Default initial goal decomposition
      this.activeGraph.addNode(new GoalNode({
        id: 'step_1_research',
        title: `Research requirements for: ${missionObjective}`,
        params: { searchQuery: missionObjective },
      }));
      this.activeGraph.addNode(new GoalNode({
        id: 'step_2_build',
        title: `Implement solution in guest workspace`,
        dependencies: ['step_1_research'],
        params: { command: 'node -v' },
      }));
    }

    this.status = 'running';
    this.emit('mission-started', { objective: missionObjective, totalNodes: this.activeGraph.nodes.size });

    try {
      while (!this.activeGraph.isComplete() && !this.activeGraph.isFailed()) {
        const nextNode = this.activeGraph.getNextExecutableNode();
        if (!nextNode) {
          // If no node can execute and not complete, we might be blocked
          break;
        }

        nextNode.markInProgress();
        this.emit('step-started', { id: nextNode.id, title: nextNode.title });

        let worker = this.codingWorker;
        if (nextNode.id.includes('research') || nextNode.id.includes('search') || nextNode.id.includes('browse')) {
          worker = this.researchWorker;
        }

        try {
          const outcome = await worker.executeStep(nextNode);
          nextNode.markCompleted(outcome);
          this.log('info', `Step [${nextNode.id}] completed successfully.`);
          this.emit('step-completed', { id: nextNode.id, outcome });
        } catch (stepErr) {
          nextNode.markFailed(stepErr.message);
          this.log('error', `Step [${nextNode.id}] failed: ${stepErr.message}`);
          this.emit('step-failed', { id: nextNode.id, error: stepErr.message });
        }
      }

      this.status = this.activeGraph.isComplete() ? 'completed' : 'failed';
      this.session.updateProgress(this.status === 'completed' ? 'Mission accomplished.' : 'Mission stopped with issues.');
      this.emit('mission-finished', {
        status: this.status,
        stats: this.activeGraph.getStats(),
      });
      return { ok: this.status === 'completed', stats: this.activeGraph.getStats() };
    } catch (err) {
      this.status = 'failed';
      this.log('error', `Mission error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  getStatus() {
    return {
      status: this.status,
      activeMission: this.activeMission,
      workers: {
        research: { status: this.researchWorker.status, activeTask: this.researchWorker.activeTask },
        coding: { status: this.codingWorker.status, activeTask: this.codingWorker.activeTask },
      },
      graphStats: this.activeGraph ? this.activeGraph.getStats() : null,
      recentLogs: this.missionLogs.slice(-10),
    };
  }
}

let activeMissionController = null;

function getMissionController(options = {}) {
  if (!activeMissionController) {
    activeMissionController = new MissionController(options);
  }
  return activeMissionController;
}

module.exports = {
  MissionController,
  getMissionController,
  ResearchWorker,
  CodingWorker,
};
