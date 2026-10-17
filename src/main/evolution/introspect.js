'use strict';
// Metacognitive Introspection Engine for Bigfoot.
// Runs during system idle time or on demand to analyze recent execution logs,
// failed actions, user skip feedback, and capability gaps, formulating
// concrete Evolution Tickets for the Architect AI.

const fs = require('fs');
const path = require('path');
const { getMemoryStore } = require('../memory');

const os = require('os');
const { app } = require('electron');

function defaultProfileDir() {
  return app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
}

class IntrospectionEngine {
  constructor(profileDir = defaultProfileDir()) {
    this.profileDir = profileDir;
    this.proposalsFile = path.join(profileDir, 'evolution_proposals.json');
    this.historyFile = path.join(profileDir, 'evolution_history.json');
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.profileDir)) fs.mkdirSync(this.profileDir, { recursive: true });
    } catch {}
  }

  loadProposals() {
    this._ensureDir();
    if (!fs.existsSync(this.proposalsFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.proposalsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  saveProposals(proposals) {
    this._ensureDir();
    fs.writeFileSync(this.proposalsFile, JSON.stringify(proposals, null, 2), 'utf8');
  }

  loadHistory() {
    this._ensureDir();
    if (!fs.existsSync(this.historyFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
    } catch {
      return [];
    }
  }

  recordHistory(record) {
    const history = this.loadHistory();
    history.push({ ...record, timestamp: new Date().toISOString() });
    this._ensureDir();
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2), 'utf8');
  }

  /**
   * Scan memory store and session context to find capability gaps and user friction.
   */
  async introspect(recentLogs = []) {
    const memory = getMemoryStore();
    const proposals = this.loadProposals();
    const newTickets = [];

    // 1. Audit user negative feedback & skips
    const feedbacks = memory.recall('skip') || [];
    for (const fb of feedbacks) {
      const match = fb.fact && fb.fact.match(/Action:\s*([^;]+);\s*Item:\s*([^;]+);\s*Reason:\s*(.+)/i);
      if (match) {
        const [, action, item, reason] = match;
        const ticketId = `ticket_feedback_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        newTickets.push({
          id: ticketId,
          type: 'user_friction',
          category: action.trim().toLowerCase(),
          subject: item.trim(),
          context: `User skipped or expressed negative feedback: "${reason.trim()}"`,
          goal: `Refine operational taste, playbook, or validation checks for ${item.trim()} in ${action.trim()}.`,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 2. Audit recent execution failures in logs
    for (const log of recentLogs) {
      if (typeof log === 'string' && (log.includes('error') || log.includes('failed') || log.includes('unavailable'))) {
        const ticketId = `ticket_log_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        newTickets.push({
          id: ticketId,
          type: 'runtime_failure',
          category: 'tool_reliability',
          subject: log.slice(0, 100),
          context: log,
          goal: 'Enhance error resilience, add fallback mechanism, or repair tool implementation.',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 3. Detect missing application integrations from playbooks
    const apps = memory.listWorkflowRecipes ? memory.listWorkflowRecipes() : [];
    if (apps.length === 0) {
      newTickets.push({
        id: `ticket_recipe_seed_${Date.now()}`,
        type: 'capability_expansion',
        category: 'workflow_recipes',
        subject: 'Standard Desktop Workflows',
        context: 'No saved custom workflow recipes detected.',
        goal: 'Generate starter automated macro recipes for browser research, code compilation, and media playback.',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    // Deduplicate against existing pending proposals
    for (const ticket of newTickets) {
      const exists = proposals.some((p) => p.goal === ticket.goal || (p.subject === ticket.subject && p.type === ticket.type));
      if (!exists) {
        proposals.push(ticket);
      }
    }

    this.saveProposals(proposals);
    return proposals;
  }
}

let _instance = null;
function getIntrospectionEngine() {
  if (!_instance) _instance = new IntrospectionEngine();
  return _instance;
}

module.exports = { IntrospectionEngine, getIntrospectionEngine };
