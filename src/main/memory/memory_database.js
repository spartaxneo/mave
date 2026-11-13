'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

function resolveDatabasePath(userId = 'default', options = {}) {
  const baseDir = options.baseDir || (
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'mave', 'memory_v2')
      : path.join(os.homedir(), '.mave', 'memory_v2')
  );

  const safeUid = String(userId || 'default').trim().replace(/[/\\:*?"<>|]/g, '_');
  const userDir = path.join(baseDir, 'users', safeUid);
  fs.mkdirSync(userDir, { recursive: true });
  return path.join(userDir, 'mave_memory.db');
}

class MemoryDatabase {
  static _instances = new Map();

  static forUser(userId = 'default', options = {}) {
    const uid = String(userId || 'default').trim();
    const dbPath = options.dbPath || (options.inMemory ? ':memory:' : resolveDatabasePath(uid, options));
    const cacheKey = `${uid}:${dbPath}`;

    if (!options.fresh && MemoryDatabase._instances.has(cacheKey)) {
      return MemoryDatabase._instances.get(cacheKey);
    }

    const instance = new MemoryDatabase(uid, dbPath, options);
    if (!options.noCache) {
      MemoryDatabase._instances.set(cacheKey, instance);
    }
    return instance;
  }

  constructor(userId, dbPath, options = {}) {
    this.userId = userId;
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      -- 1. Working Memory (Active Task Scratchpad)
      CREATE TABLE IF NOT EXISTS working_memory (
        task_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        active_objective TEXT NOT NULL,
        current_subtask TEXT,
        constraints_json TEXT,
        active_tool_results_json TEXT,
        token_budget INTEGER DEFAULT 2048,
        updated_at INTEGER NOT NULL
      );

      -- 2. Session Memory (Conversations & Decisions)
      CREATE TABLE IF NOT EXISTS session_memory (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        summary TEXT,
        decisions_json TEXT,
        corrections_json TEXT,
        turn_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- 3. Episodic Memory (Experiences & Outcomes)
      CREATE TABLE IF NOT EXISTS episodic_memory (
        event_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        project_id TEXT,
        session_id TEXT,
        event_type TEXT NOT NULL,
        goal TEXT NOT NULL,
        entities_json TEXT,
        actions_json TEXT,
        outcome TEXT NOT NULL,
        verification_status TEXT DEFAULT 'VERIFIED',
        confidence REAL DEFAULT 1.0,
        retention_policy TEXT DEFAULT 'permanent'
      );
      CREATE INDEX IF NOT EXISTS idx_episodic_user_time ON episodic_memory(user_id, timestamp);

      -- 4. Semantic Memory (Hierarchical Facts & Knowledge)
      CREATE TABLE IF NOT EXISTS semantic_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        entity_name TEXT,
        fact TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        source_provenance TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_user_ns ON semantic_memory(user_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_semantic_entity ON semantic_memory(user_id, entity_name);

      -- 5. Procedural Memory (How to do things / Skills)
      CREATE TABLE IF NOT EXISTS procedural_memory (
        skill_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        preconditions_json TEXT,
        tools_needed_json TEXT,
        steps_json TEXT NOT NULL,
        verification_conditions_json TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_tested_at INTEGER
      );

      -- 6. Life Graph Nodes & Edges (Personal Relationships)
      CREATE TABLE IF NOT EXISTS life_graph_nodes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        node_type TEXT NOT NULL, -- 'person' | 'project' | 'goal' | 'device' | 'preference'
        name TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lg_user_type ON life_graph_nodes(user_id, node_type);

      CREATE TABLE IF NOT EXISTS life_graph_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL
      );

      -- 7. Authorized People Directory (Explicit Consent Biometrics & Identity)
      CREATE TABLE IF NOT EXISTS authorized_people (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT,
        biometric_enabled INTEGER DEFAULT 0,
        authorized_scope TEXT DEFAULT 'general',
        enrolled_at INTEGER NOT NULL
      );

      -- 8. Multi-Year Daily Digests (Episodic Sleep Consolidation)
      CREATE TABLE IF NOT EXISTS daily_digests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date_str TEXT NOT NULL,
        summary TEXT NOT NULL,
        key_decisions_json TEXT,
        work_completed_json TEXT,
        learning_insights_json TEXT,
        active_projects_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_digest_user_date ON daily_digests(user_id, date_str);

      -- 9. Work & Continuous Learning Portfolio Tracker
      CREATE TABLE IF NOT EXISTS work_learning_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL,
        project_id TEXT,
        skills_used_json TEXT,
        source_device TEXT DEFAULT 'primary_host',
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_work_learning_cat ON work_learning_log(user_id, category, timestamp);

      -- 10. Multi-Device Sensory Observations (Camera, Screen, IoT, Audio)
      CREATE TABLE IF NOT EXISTS sensory_observations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        device_id TEXT NOT NULL,
        observation_text TEXT NOT NULL,
        tags_json TEXT,
        salience_score REAL DEFAULT 0.5,
        consolidated INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sensory_chan_time ON sensory_observations(user_id, channel, timestamp);
    `);
  }

  // --- Working Memory Methods ---
  setWorkingMemory(taskId, data = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO working_memory (task_id, user_id, active_objective, current_subtask, constraints_json, active_tool_results_json, token_budget, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        active_objective = excluded.active_objective,
        current_subtask = excluded.current_subtask,
        constraints_json = excluded.constraints_json,
        active_tool_results_json = excluded.active_tool_results_json,
        token_budget = excluded.token_budget,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      taskId,
      this.userId,
      data.activeObjective || '',
      data.currentSubtask || null,
      JSON.stringify(data.constraints || {}),
      JSON.stringify(data.activeToolResults || []),
      Number(data.tokenBudget) || 2048,
      Date.now()
    );
  }

  getWorkingMemory(taskId) {
    const stmt = this.db.prepare('SELECT * FROM working_memory WHERE task_id = ? AND user_id = ?');
    const row = stmt.get(taskId, this.userId);
    if (!row) return null;
    return {
      taskId: row.task_id,
      userId: row.user_id,
      activeObjective: row.active_objective,
      currentSubtask: row.current_subtask,
      constraints: JSON.parse(row.constraints_json || '{}'),
      activeToolResults: JSON.parse(row.active_tool_results_json || '[]'),
      tokenBudget: row.token_budget,
      updatedAt: row.updated_at,
    };
  }

  // --- Episodic Memory Methods ---
  recordEpisode(episode = {}) {
    const eventId = episode.eventId || `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO episodic_memory (event_id, user_id, timestamp, project_id, session_id, event_type, goal, entities_json, actions_json, outcome, verification_status, confidence, retention_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      eventId,
      this.userId,
      episode.timestamp || Date.now(),
      episode.projectId || null,
      episode.sessionId || null,
      episode.eventType || 'task_execution',
      episode.goal || '',
      JSON.stringify(episode.entities || []),
      JSON.stringify(episode.actions || []),
      episode.outcome || '',
      episode.verificationStatus || 'VERIFIED',
      Number(episode.confidence) || 1.0,
      episode.retentionPolicy || 'permanent'
    );
    return eventId;
  }

  queryEpisodes(filter = {}) {
    let sql = 'SELECT * FROM episodic_memory WHERE user_id = ?';
    const params = [this.userId];
    if (filter.projectId) {
      sql += ' AND project_id = ?';
      params.push(filter.projectId);
    }
    if (filter.eventType) {
      sql += ' AND event_type = ?';
      params.push(filter.eventType);
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(filter.limit) || 10);

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => ({
      eventId: r.event_id,
      userId: r.user_id,
      timestamp: r.timestamp,
      projectId: r.project_id,
      sessionId: r.session_id,
      eventType: r.event_type,
      goal: r.goal,
      entities: JSON.parse(r.entities_json || '[]'),
      actions: JSON.parse(r.actions_json || '[]'),
      outcome: r.outcome,
      verificationStatus: r.verification_status,
      confidence: r.confidence,
    }));
  }

  // --- Semantic Memory Methods ---
  storeFact(fact, options = {}) {
    const id = options.id || `sem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const namespace = options.namespace || 'general';
    const entityName = options.entityName || null;
    const now = Date.now();

    // Check for contradiction or existing fact under same entity
    if (entityName) {
      const existing = this.db.prepare(`
        SELECT * FROM semantic_memory WHERE user_id = ? AND namespace = ? AND entity_name = ?
      `).get(this.userId, namespace, entityName);

      if (existing) {
        // Update existing fact with new information
        this.db.prepare(`
          UPDATE semantic_memory SET fact = ?, confidence = ?, source_provenance = ?, updated_at = ?
          WHERE id = ?
        `).run(fact, options.confidence || 1.0, options.sourceProvenance || 'user_update', now, existing.id);
        return existing.id;
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO semantic_memory (id, user_id, namespace, entity_name, fact, confidence, source_provenance, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      this.userId,
      namespace,
      entityName,
      fact,
      options.confidence || 1.0,
      options.sourceProvenance || 'direct_observation',
      now,
      now,
      options.expiresAt || null
    );
    return id;
  }

  querySemanticFacts(namespace = null, query = '', limit = 10) {
    let sql = 'SELECT * FROM semantic_memory WHERE user_id = ?';
    const params = [this.userId];

    if (namespace && namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }

    if (query) {
      sql += ' AND fact LIKE ?';
      params.push(`%${query}%`);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params).map((r) => ({
      id: r.id,
      userId: r.user_id,
      namespace: r.namespace,
      entityName: r.entity_name,
      fact: r.fact,
      confidence: r.confidence,
      sourceProvenance: r.source_provenance,
      updatedAt: r.updated_at,
    }));
  }

  // --- Procedural Memory Methods ---
  storeProcedure(procedure = {}) {
    const skillId = procedure.skillId || `proc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO procedural_memory (skill_id, user_id, name, description, preconditions_json, tools_needed_json, steps_json, verification_conditions_json, success_count, failure_count, last_tested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(skill_id) DO UPDATE SET
        description = excluded.description,
        steps_json = excluded.steps_json,
        success_count = procedural_memory.success_count + 1,
        last_tested_at = excluded.last_tested_at
    `);
    stmt.run(
      skillId,
      this.userId,
      procedure.name,
      procedure.description || '',
      JSON.stringify(procedure.preconditions || []),
      JSON.stringify(procedure.toolsNeeded || []),
      JSON.stringify(procedure.steps || []),
      JSON.stringify(procedure.verificationConditions || []),
      procedure.successCount || 0,
      procedure.failureCount || 0,
      Date.now()
    );
    return skillId;
  }

  getProcedure(name) {
    const row = this.db.prepare('SELECT * FROM procedural_memory WHERE user_id = ? AND name = ?').get(this.userId, name);
    if (!row) return null;
    return {
      skillId: row.skill_id,
      name: row.name,
      description: row.description,
      preconditions: JSON.parse(row.preconditions_json || '[]'),
      toolsNeeded: JSON.parse(row.tools_needed_json || '[]'),
      steps: JSON.parse(row.steps_json || '[]'),
      verificationConditions: JSON.parse(row.verification_conditions_json || '[]'),
      successCount: row.success_count,
    };
  }

  // --- Authorized People Directory ---
  enrollAuthorizedPerson(person = {}) {
    const id = person.id || `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO authorized_people (id, user_id, name, relationship, biometric_enabled, authorized_scope, enrolled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      this.userId,
      person.name,
      person.relationship || 'contact',
      person.biometricEnabled ? 1 : 0,
      person.authorizedScope || 'general',
      Date.now()
    );
    return id;
  }

  searchAuthorizedPeople(query = '') {
    const q = String(query || '').trim();
    if (!q) {
      return this.db.prepare('SELECT * FROM authorized_people WHERE user_id = ?').all(this.userId);
    }
    return this.db.prepare(`
      SELECT * FROM authorized_people WHERE user_id = ? AND name LIKE ?
    `).all(this.userId, `%${q}%`);
  }

  // --- Sensory Observations (Camera, Screen, IoT, Audio) ---
  recordSensoryObservation(obs = {}) {
    const id = obs.id || `sens_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = obs.channel || 'camera';
    const deviceId = obs.deviceId || 'primary_host';
    const text = obs.observationText || obs.text || '';
    const tags = JSON.stringify(obs.tags || []);
    const salience = Number(obs.salienceScore ?? obs.salience ?? 0.5);
    const timestamp = obs.timestamp || Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO sensory_observations (id, user_id, channel, device_id, observation_text, tags_json, salience_score, consolidated, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    stmt.run(id, this.userId, channel, deviceId, text, tags, salience, timestamp);
    return id;
  }

  getSensoryObservations(options = {}) {
    let sql = 'SELECT * FROM sensory_observations WHERE user_id = ?';
    const params = [this.userId];

    if (options.channel) {
      sql += ' AND channel = ?';
      params.push(options.channel);
    }
    if (options.unconsolidatedOnly) {
      sql += ' AND consolidated = 0';
    }
    if (options.minSalience != null) {
      sql += ' AND salience_score >= ?';
      params.push(Number(options.minSalience));
    }

    sql += ' ORDER BY timestamp ASC LIMIT ?';
    params.push(Number(options.limit) || 100);

    return this.db.prepare(sql).all(...params).map((r) => ({
      id: r.id,
      userId: r.user_id,
      channel: r.channel,
      deviceId: r.device_id,
      observationText: r.observation_text,
      tags: JSON.parse(r.tags_json || '[]'),
      salienceScore: r.salience_score,
      consolidated: Boolean(r.consolidated),
      timestamp: r.timestamp,
    }));
  }

  markSensoryConsolidated(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE sensory_observations SET consolidated = 1 WHERE user_id = ? AND id IN (${placeholders})
    `);
    const res = stmt.run(this.userId, ...ids);
    return res.changes;
  }

  pruneOldSensoryObservations(retentionDays = 30) {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const stmt = this.db.prepare(`
      DELETE FROM sensory_observations WHERE user_id = ? AND consolidated = 1 AND timestamp < ?
    `);
    const res = stmt.run(this.userId, cutoff);
    return res.changes;
  }

  // --- Multi-Year Daily Digests (Episodic Sleep Consolidation) ---
  saveDailyDigest(digest = {}) {
    const dateStr = digest.dateStr || new Date().toISOString().slice(0, 10);
    const id = digest.id || `digest_${dateStr}_${this.userId}`;
    const summary = digest.summary || '';
    const keyDecisions = JSON.stringify(digest.keyDecisions || []);
    const workCompleted = JSON.stringify(digest.workCompleted || []);
    const learningInsights = JSON.stringify(digest.learningInsights || []);
    const activeProjects = JSON.stringify(digest.activeProjects || []);
    const createdAt = digest.createdAt || Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO daily_digests (id, user_id, date_str, summary, key_decisions_json, work_completed_json, learning_insights_json, active_projects_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        key_decisions_json = excluded.key_decisions_json,
        work_completed_json = excluded.work_completed_json,
        learning_insights_json = excluded.learning_insights_json,
        active_projects_json = excluded.active_projects_json
    `);
    stmt.run(id, this.userId, dateStr, summary, keyDecisions, workCompleted, learningInsights, activeProjects, createdAt);
    return id;
  }

  getDailyDigest(dateStr) {
    const row = this.db.prepare('SELECT * FROM daily_digests WHERE user_id = ? AND date_str = ?').get(this.userId, dateStr);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      dateStr: row.date_str,
      summary: row.summary,
      keyDecisions: JSON.parse(row.key_decisions_json || '[]'),
      workCompleted: JSON.parse(row.work_completed_json || '[]'),
      learningInsights: JSON.parse(row.learning_insights_json || '[]'),
      activeProjects: JSON.parse(row.active_projects_json || '[]'),
      createdAt: row.created_at,
    };
  }

  getRecentDigests(limit = 7) {
    const rows = this.db.prepare('SELECT * FROM daily_digests WHERE user_id = ? ORDER BY date_str DESC LIMIT ?').all(this.userId, limit);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      dateStr: row.date_str,
      summary: row.summary,
      keyDecisions: JSON.parse(row.key_decisions_json || '[]'),
      workCompleted: JSON.parse(row.work_completed_json || '[]'),
      learningInsights: JSON.parse(row.learning_insights_json || '[]'),
      activeProjects: JSON.parse(row.active_projects_json || '[]'),
      createdAt: row.created_at,
    }));
  }

  // --- Work & Learning Portfolio Tracker ---
  logWorkOrLearning(entry = {}) {
    const id = entry.id || `wl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const category = entry.category || 'work'; // 'work' | 'learning' | 'skill_acquired' | 'incident_fix'
    const title = entry.title || '';
    const details = entry.details || '';
    const projectId = entry.projectId || null;
    const skillsUsed = JSON.stringify(entry.skillsUsed || []);
    const sourceDevice = entry.sourceDevice || 'primary_host';
    const timestamp = entry.timestamp || Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO work_learning_log (id, user_id, category, title, details, project_id, skills_used_json, source_device, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, this.userId, category, title, details, projectId, skillsUsed, sourceDevice, timestamp);
    return id;
  }

  queryWorkLearning(options = {}) {
    let sql = 'SELECT * FROM work_learning_log WHERE user_id = ?';
    const params = [this.userId];

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options.projectId) {
      sql += ' AND project_id = ?';
      params.push(options.projectId);
    }
    if (options.query) {
      sql += ' AND (title LIKE ? OR details LIKE ?)';
      params.push(`%${options.query}%`, `%${options.query}%`);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(options.limit) || 20);

    return this.db.prepare(sql).all(...params).map((r) => ({
      id: r.id,
      userId: r.user_id,
      category: r.category,
      title: r.title,
      details: r.details,
      projectId: r.project_id,
      skillsUsed: JSON.parse(r.skills_used_json || '[]'),
      sourceDevice: r.source_device,
      timestamp: r.timestamp,
    }));
  }

  purgeAllData() {
    this.db.exec(`
      DELETE FROM working_memory WHERE user_id = '${this.userId}';
      DELETE FROM session_memory WHERE user_id = '${this.userId}';
      DELETE FROM episodic_memory WHERE user_id = '${this.userId}';
      DELETE FROM semantic_memory WHERE user_id = '${this.userId}';
      DELETE FROM procedural_memory WHERE user_id = '${this.userId}';
      DELETE FROM life_graph_nodes WHERE user_id = '${this.userId}';
      DELETE FROM life_graph_edges WHERE user_id = '${this.userId}';
      DELETE FROM authorized_people WHERE user_id = '${this.userId}';
      DELETE FROM daily_digests WHERE user_id = '${this.userId}';
      DELETE FROM work_learning_log WHERE user_id = '${this.userId}';
      DELETE FROM sensory_observations WHERE user_id = '${this.userId}';
    `);
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  MemoryDatabase,
};
