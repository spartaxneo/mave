'use strict';

/**
 * MAVE Continuous Multi-Year Learning Engine
 * 
 * Embodies the cognitive organization of a sharp 25-year-old executive:
 * - Operates 24/7/365 across multi-device, multi-camera, and multi-platform environments.
 * - Perceptual Saliency & Deduplication: Prevents database bloat by filtering out repetitive raw frames.
 * - Work & Learning Portfolio: Tracks projects, solutions, skills acquired, and lessons learned.
 * - Nightly Sleep Consolidation (Dreaming Cycle): Compresses micro-observations into structured Daily Digests,
 *   updates knowledge graph nodes, and prunes transient noise for bounded O(1)/day multi-year storage.
 * - Context-Budgeted Natural Recall: Delivers precise grounded memory within 400-600 tokens.
 */

const { MemoryDatabase } = require('./memory_database');
const { getContextBudgetManager } = require('./context_budget_manager');

class ContinuousLearningEngine {
  static _instances = new Map();

  static forUser(userId = 'default', options = {}) {
    const uid = String(userId || 'default').trim();
    if (!options.fresh && ContinuousLearningEngine._instances.has(uid)) {
      return ContinuousLearningEngine._instances.get(uid);
    }
    const instance = new ContinuousLearningEngine(uid, options);
    ContinuousLearningEngine._instances.set(uid, instance);
    return instance;
  }

  constructor(userId = 'default', options = {}) {
    this.userId = userId;
    this.db = options.db || MemoryDatabase.forUser(userId, options);
    this.budgetManager = options.budgetManager || getContextBudgetManager(options);
    
    // In-memory perceptual cache for fast deduplication (last observed hash/signature per channel)
    this._recentObservations = new Map(); // channel -> { text, timestamp, hash }
    this._dedupWindowMs = options.dedupWindowMs || 60 * 1000; // 1-minute deduplication window
  }

  /**
   * Ingest a sensory observation from a camera, screen, microphone, or IoT sensor.
   * Filters out trivial/repetitive input to preserve long-term storage efficiency.
   */
  ingestSensoryEvent({
    channel = 'camera',
    deviceId = 'primary_host',
    text = '',
    tags = [],
    salience = 0.5,
    timestamp = Date.now(),
  } = {}) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    // Perceptual Deduplication: check if same channel saw this exact or near-identical observation recently
    const channelKey = `${channel}:${deviceId}`;
    const prev = this._recentObservations.get(channelKey);
    const now = timestamp || Date.now();

    if (prev && (now - prev.timestamp) < this._dedupWindowMs) {
      if (prev.text.toLowerCase() === cleanText.toLowerCase()) {
        // Redundant observation within window; boost salience if recurring but skip duplicate DB write
        prev.timestamp = now;
        return null;
      }
    }

    // Low-salience gate: ignore ultra-low confidence noise unless explicitly tagged
    const salienceScore = Number(salience ?? 0.5);
    if (salienceScore < 0.2 && tags.length === 0) {
      return null;
    }

    // Update in-memory perceptual cache
    this._recentObservations.set(channelKey, {
      text: cleanText,
      timestamp: now,
    });

    // Record in persistent SQLite
    const id = this.db.recordSensoryObservation({
      channel,
      deviceId,
      observationText: cleanText,
      tags: Array.isArray(tags) ? tags : [tags],
      salienceScore,
      timestamp: now,
    });

    return id;
  }

  /**
   * Log high-value work or milestone completed by user or agent.
   */
  recordWork({
    title = '',
    details = '',
    projectId = null,
    skillsUsed = [],
    sourceDevice = 'primary_host',
    timestamp = Date.now(),
  } = {}) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return null;

    const id = this.db.logWorkOrLearning({
      category: 'work',
      title: cleanTitle,
      details: String(details || '').trim(),
      projectId: projectId ? String(projectId).trim() : null,
      skillsUsed: Array.isArray(skillsUsed) ? skillsUsed : [skillsUsed],
      sourceDevice: String(sourceDevice || 'primary_host'),
      timestamp: timestamp || Date.now(),
    });

    // Mirror to semantic fact for associative recall
    this.db.storeFact(`Work completed on ${cleanTitle}: ${details || cleanTitle}`, {
      namespace: 'work_portfolio',
      entityName: projectId || 'project',
      sourceProvenance: 'work_learning_tracker',
      confidence: 1.0,
    });

    return id;
  }

  /**
   * Log a new learning insight, concept, or technical lesson.
   */
  recordLearning({
    topic = '',
    insight = '',
    category = 'learning',
    sourceDevice = 'primary_host',
    timestamp = Date.now(),
  } = {}) {
    const cleanTopic = String(topic || '').trim();
    const cleanInsight = String(insight || '').trim();
    if (!cleanTopic && !cleanInsight) return null;

    const id = this.db.logWorkOrLearning({
      category: category || 'learning',
      title: cleanTopic || 'Insight',
      details: cleanInsight,
      projectId: null,
      skillsUsed: [],
      sourceDevice: String(sourceDevice || 'primary_host'),
      timestamp: timestamp || Date.now(),
    });

    // Store in semantic memory
    this.db.storeFact(`Learned concept [${cleanTopic}]: ${cleanInsight}`, {
      namespace: 'learning',
      entityName: cleanTopic,
      sourceProvenance: 'continuous_learning_engine',
      confidence: 1.0,
    });

    return id;
  }

  /**
   * Record a new verified procedural skill or workflow.
   */
  recordSkillAcquired({
    skillName = '',
    description = '',
    steps = [],
    toolsNeeded = [],
  } = {}) {
    const name = String(skillName || '').trim();
    if (!name) return null;

    const skillId = this.db.storeProcedure({
      name,
      description: String(description || ''),
      steps: Array.isArray(steps) ? steps : [steps],
      toolsNeeded: Array.isArray(toolsNeeded) ? toolsNeeded : [],
      successCount: 1,
    });

    this.db.logWorkOrLearning({
      category: 'skill_acquired',
      title: `Skill Acquired: ${name}`,
      details: description || steps.join(' -> '),
      skillsUsed: [name],
      timestamp: Date.now(),
    });

    return skillId;
  }

  /**
   * Nightly Sleep Consolidation Cycle (Memory Dreaming).
   * Compresses the day's sensory observations, episodes, work logs, and learnings
   * into a compact Daily Digest, marks observations as consolidated, and prunes stale micro-events.
   */
  consolidateMemories({ targetDateStr = null } = {}) {
    const dateStr = targetDateStr || new Date().toISOString().slice(0, 10);

    // 1. Fetch unconsolidated sensory observations
    const observations = this.db.getSensoryObservations({
      unconsolidatedOnly: true,
      limit: 200,
    });

    // 2. Fetch work & learning logs for this period
    const workItems = this.db.queryWorkLearning({ category: 'work', limit: 50 });
    const learningItems = this.db.queryWorkLearning({ category: 'learning', limit: 50 });
    const episodes = this.db.queryEpisodes({ limit: 20 });

    // 3. Synthesize summary structures
    const workCompleted = workItems.map((w) => `${w.title}: ${w.details}`.slice(0, 150));
    const learningInsights = learningItems.map((l) => `${l.title}: ${l.details}`.slice(0, 150));
    const keyDecisions = [];
    const activeProjects = new Set();

    for (const ep of episodes) {
      if (ep.projectId) activeProjects.add(ep.projectId);
      if (ep.outcome && ep.outcome.includes('Decision:')) {
        keyDecisions.push(ep.outcome);
      }
    }
    for (const w of workItems) {
      if (w.projectId) activeProjects.add(w.projectId);
    }

    // High-level daily narrative synthesis
    const parts = [];
    if (workCompleted.length > 0) {
      parts.push(`Completed ${workCompleted.length} work items including: ${workCompleted.slice(0, 3).join('; ')}`);
    }
    if (learningInsights.length > 0) {
      parts.push(`Acquired insights on: ${learningInsights.slice(0, 3).join('; ')}`);
    }
    if (observations.length > 0) {
      const channels = [...new Set(observations.map((o) => o.channel))];
      parts.push(`Processed ${observations.length} sensory events across ${channels.join(', ')}.`);
    }

    const summary = parts.length > 0
      ? parts.join(' | ')
      : `Quiet day on ${dateStr}. System maintained continuous readiness.`;

    // 4. Save structured Daily Digest
    const digestId = this.db.saveDailyDigest({
      dateStr,
      summary,
      keyDecisions: keyDecisions.slice(0, 10),
      workCompleted: workCompleted.slice(0, 15),
      learningInsights: learningInsights.slice(0, 15),
      activeProjects: Array.from(activeProjects),
      createdAt: Date.now(),
    });

    // 5. Mark observations as consolidated
    if (observations.length > 0) {
      const obsIds = observations.map((o) => o.id);
      this.db.markSensoryConsolidated(obsIds);
    }

    // 6. Prune stale consolidated observations older than 30 days
    const prunedCount = this.db.pruneOldSensoryObservations(30);

    return {
      digestId,
      dateStr,
      summary,
      consolidatedObservationsCount: observations.length,
      prunedStaleObservationsCount: prunedCount,
      activeProjectsCount: activeProjects.size,
    };
  }

  /**
   * Fast, Context-Budgeted Memory Recall (<600 tokens) for Prompt Injection.
   * Delivers the exact knowledge a 25-year-old assistant needs for the current task.
   */
  getGroundedContext(query = '', options = {}) {
    const maxTokens = Number(options.maxTokens) || 500;
    const q = String(query || '').trim();
    const packedLines = [];
    let usedTokens = 0;

    // Helper to safely pack lines within budget
    const tryAddLine = (line) => {
      const lineTokens = this.budgetManager.estimateTokens(line);
      if (usedTokens + lineTokens <= maxTokens) {
        packedLines.push(line);
        usedTokens += lineTokens;
        return true;
      }
      return false;
    };

    // 1. Relevant Recent Work / Projects
    if (q) {
      const matchingWork = this.db.queryWorkLearning({ query: q, limit: 3 });
      for (const w of matchingWork) {
        const line = `- [Work Milestone (${w.category})] ${w.title}: ${w.details.slice(0, 120)}`;
        if (!tryAddLine(line)) break;
      }
    }

    // 2. Recent Daily Digest Context (Past 3 days overview)
    const recentDigests = this.db.getRecentDigests(2);
    for (const d of recentDigests) {
      const line = `- [Past Digest (${d.dateStr})] ${d.summary.slice(0, 160)}`;
      if (!tryAddLine(line)) break;
    }

    // 3. Relevant Skills / Procedures
    if (q) {
      const words = q.split(/\s+/).filter((w) => w.length > 3);
      for (const word of words.slice(0, 2)) {
        const proc = this.db.getProcedure(word);
        if (proc) {
          const line = `- [Procedural Skill: ${proc.name}] ${proc.description || 'Verified execution flow'}`;
          if (!tryAddLine(line)) break;
        }
      }
    }

    return {
      contextText: packedLines.length > 0 ? packedLines.join('\n') : '',
      tokenCount: usedTokens,
      linesCount: packedLines.length,
    };
  }

  purgeAllData() {
    this._recentObservations.clear();
    this.db.purgeAllData();
  }
}

module.exports = {
  ContinuousLearningEngine,
};
