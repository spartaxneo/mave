'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Standard cognitive event types across MAVE Brain V3.
 */
const CognitiveEventTypes = {
  USER_MESSAGE_RECEIVED: 'USER_MESSAGE_RECEIVED',
  VOICE_TRANSCRIPT_RECEIVED: 'VOICE_TRANSCRIPT_RECEIVED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_PAUSED: 'TASK_PAUSED',
  TASK_RESUMED: 'TASK_RESUMED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_FAILED: 'TASK_FAILED',
  TASK_BLOCKED: 'TASK_BLOCKED',
  TASK_CANCELLED: 'TASK_CANCELLED',
  TOOL_STARTED: 'TOOL_STARTED',
  TOOL_COMPLETED: 'TOOL_COMPLETED',
  TOOL_FAILED: 'TOOL_FAILED',
  WORKER_ASSIGNED: 'WORKER_ASSIGNED',
  WORKER_COMPLETED: 'WORKER_COMPLETED',
  MEMORY_WRITTEN: 'MEMORY_WRITTEN',
  MEMORY_RETRIEVED: 'MEMORY_RETRIEVED',
  VISUAL_OBSERVATION: 'VISUAL_OBSERVATION',
  USER_INTERRUPTION: 'USER_INTERRUPTION',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  GOAL_DRIFT_DETECTED: 'GOAL_DRIFT_DETECTED',
  VERIFICATION_COMPLETED: 'VERIFICATION_COMPLETED',
  FINAL_RESPONSE_DELIVERED: 'FINAL_RESPONSE_DELIVERED',
};

class CognitiveEventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxInMemoryEvents = options.maxInMemoryEvents || 1000;
    this.events = [];
    this.taskIndex = new Map(); // taskId -> event[]
    this.ledgerDb = options.ledgerDb || null; // Optional SQLite DatabaseSync instance
  }

  setLedgerDb(db) {
    this.ledgerDb = db;
    if (this.ledgerDb) {
      try {
        this.ledgerDb.exec(`
          CREATE TABLE IF NOT EXISTS cognitive_events (
            event_id TEXT PRIMARY KEY,
            correlation_id TEXT,
            task_id TEXT,
            event_type TEXT NOT NULL,
            source TEXT,
            timestamp INTEGER NOT NULL,
            payload_json TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_cog_events_task ON cognitive_events(task_id);
          CREATE INDEX IF NOT EXISTS idx_cog_events_type ON cognitive_events(event_type);
        `);
      } catch (err) {
        console.error('[CognitiveEventBus] Failed to initialize DB table:', err.message);
      }
    }
  }

  /**
   * Emit a structured event with correlation and provenance.
   */
  emitEvent(eventType, payload = {}, metadata = {}) {
    const eventId = metadata.eventId || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const correlationId = metadata.correlationId || payload.correlationId || (payload.taskId ? `corr_${payload.taskId}` : null);
    const taskId = metadata.taskId || payload.taskId || null;
    const timestamp = metadata.timestamp || Date.now();
    const source = metadata.source || payload.source || 'cognitive_orchestrator';

    const event = {
      eventId,
      correlationId,
      taskId,
      eventType,
      source,
      timestamp,
      payload,
    };

    this.events.push(event);
    if (this.events.length > this.maxInMemoryEvents) {
      this.events.shift();
    }

    if (taskId) {
      if (!this.taskIndex.has(taskId)) {
        this.taskIndex.set(taskId, []);
      }
      const taskEvents = this.taskIndex.get(taskId);
      taskEvents.push(event);
      if (taskEvents.length > 200) taskEvents.shift();
    }

    if (this.ledgerDb) {
      try {
        const stmt = this.ledgerDb.prepare(`
          INSERT INTO cognitive_events (event_id, correlation_id, task_id, event_type, source, timestamp, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(eventId, correlationId, taskId, eventType, source, timestamp, JSON.stringify(payload));
      } catch (err) {
        // Non-fatal write failure to ledger
      }
    }

    this.emit(eventType, event);
    this.emit('*', event);
    return event;
  }

  getEventsForTask(taskId) {
    if (!taskId) return [];
    if (this.taskIndex.has(taskId)) {
      return [...this.taskIndex.get(taskId)];
    }
    if (this.ledgerDb) {
      try {
        const stmt = this.ledgerDb.prepare('SELECT * FROM cognitive_events WHERE task_id = ? ORDER BY timestamp ASC');
        const rows = stmt.all(taskId);
        return rows.map((r) => ({
          eventId: r.event_id,
          correlationId: r.correlation_id,
          taskId: r.task_id,
          eventType: r.event_type,
          source: r.source,
          timestamp: r.timestamp,
          payload: JSON.parse(r.payload_json || '{}'),
        }));
      } catch {
        return [];
      }
    }
    return [];
  }

  getRecentEvents(limit = 50) {
    return this.events.slice(-limit);
  }

  clear() {
    this.events = [];
    this.taskIndex.clear();
  }
}

let defaultEventBus = null;

function getCognitiveEventBus(options = {}) {
  if (!defaultEventBus) {
    defaultEventBus = new CognitiveEventBus(options);
  }
  return defaultEventBus;
}

module.exports = {
  CognitiveEventTypes,
  CognitiveEventBus,
  getCognitiveEventBus,
};
