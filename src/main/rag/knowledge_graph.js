'use strict';

/**
 * PersonalKnowledgeGraph - Deep Bidirectional Associative Memory Engine
 * 
 * Maps entities (People, Places, Organizations, Projects, Concepts, Habits, Objects)
 * and directed multi-hop relationships between them to empower associative reasoning,
 * fact cross-referencing, and graph traversal.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultKnowledgeGraphPath(userIdOrOptions = null, options = {}) {
  let uid = null;
  let opts = options;

  if (typeof userIdOrOptions === 'string') {
    uid = userIdOrOptions.trim();
  } else if (userIdOrOptions && typeof userIdOrOptions === 'object') {
    opts = { ...userIdOrOptions, ...options };
    if (opts.userId) uid = String(opts.userId).trim();
  } else if (options && options.userId) {
    uid = String(options.userId).trim();
  }

  if (opts && opts.baseDir) {
    if (!uid || uid.toLowerCase() === 'default') {
      return path.join(opts.baseDir, 'knowledge_graph.json');
    }
    const safeUid = uid.replace(/[/\\:*?"<>|]/g, '_');
    return path.join(opts.baseDir, 'users', safeUid, 'knowledge_graph.json');
  }

  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'mave')
    : path.join(os.homedir(), '.mave');

  if (!uid || uid.toLowerCase() === 'default') {
    return path.join(baseDir, 'knowledge_graph.json');
  }

  const safeUid = uid.replace(/[/\\:*?"<>|]/g, '_');
  return path.join(baseDir, 'users', safeUid, 'knowledge_graph.json');
}

class PersonalKnowledgeGraph {
  static _userInstances = new Map();

  static forUser(userId = 'default', options = {}) {
    const uid = (typeof userId === 'string' ? userId.trim() : null) || (options && options.userId ? String(options.userId).trim() : 'default');
    const storagePath = options.storagePath || options.filePath || defaultKnowledgeGraphPath(uid, options);
    const cacheKey = `${uid}:${storagePath}`;

    if (!options.fresh && PersonalKnowledgeGraph._userInstances.has(cacheKey)) {
      return PersonalKnowledgeGraph._userInstances.get(cacheKey);
    }

    const mergedOptions = { ...options, userId: uid, storagePath };
    const instance = new PersonalKnowledgeGraph(mergedOptions);
    if (!options.noCache) {
      PersonalKnowledgeGraph._userInstances.set(cacheKey, instance);
    }
    return instance;
  }

  static purgeUserData(userId, options = {}) {
    const uid = typeof userId === 'string' ? userId.trim() : (userId && userId.userId ? String(userId.userId).trim() : null);
    if (!uid) throw new Error('userId is required to purge user data');

    for (const [key, instance] of PersonalKnowledgeGraph._userInstances.entries()) {
      if (key.startsWith(`${uid}:`)) {
        instance.nodes.clear();
        instance.edges = [];
        PersonalKnowledgeGraph._userInstances.delete(key);
      }
    }

    const filePath = options.storagePath || options.filePath || defaultKnowledgeGraphPath(uid, options);
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
      const userDir = path.dirname(filePath);
      if (uid.toLowerCase() !== 'default' && fs.existsSync(userDir)) {
        const remaining = fs.readdirSync(userDir);
        if (remaining.length === 0) {
          fs.rmdirSync(userDir);
        }
      }
    } catch {}

    return true;
  }

  purgeUserData() {
    return PersonalKnowledgeGraph.purgeUserData(this.userId, this.options);
  }

  clear() {
    this.nodes.clear();
    this.edges = [];
    this._save();
  }

  constructor(options = {}) {
    let resolvedOptions = {};
    let resolvedUserId = 'default';
    let resolvedPath = null;

    if (typeof options === 'string') {
      if (options.includes('/') || options.includes('\\') || options.endsWith('.json')) {
        resolvedPath = options;
      } else {
        resolvedUserId = options || 'default';
        resolvedPath = defaultKnowledgeGraphPath(resolvedUserId);
      }
    } else if (options && typeof options === 'object') {
      resolvedOptions = options;
      resolvedUserId = options.userId || 'default';
      resolvedPath = options.storagePath || options.filePath || defaultKnowledgeGraphPath(resolvedUserId, options);
    } else {
      resolvedPath = defaultKnowledgeGraphPath('default');
    }

    this.userId = resolvedUserId;
    this.storagePath = resolvedPath;
    this.file = resolvedPath;
    this.options = resolvedOptions;

    this.nodes = new Map(); // id -> { id, label, type, properties, createdAt }
    this.edges = [];        // [{ id, source, predicate, target, confidence, metadata, createdAt }]
    
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (raw.nodes && Array.isArray(raw.nodes)) {
          for (const n of raw.nodes) this.nodes.set(n.id.toLowerCase(), n);
        }
        if (raw.edges && Array.isArray(raw.edges)) {
          this.edges = raw.edges;
        }
      }
    } catch {}
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        userId: this.userId,
        nodes: Array.from(this.nodes.values()),
        edges: this.edges,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
  }

  addNode(id, type = 'concept', properties = {}) {
    if (!id) throw new Error('Node ID is required');
    const canonicalId = id.trim().toLowerCase();
    const existing = this.nodes.get(canonicalId);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      this._save();
      return existing;
    }

    const node = {
      id: canonicalId,
      label: id.trim(),
      type: type.toLowerCase(),
      properties,
      createdAt: new Date().toISOString()
    };
    this.nodes.set(canonicalId, node);
    this._save();
    return node;
  }

  getNode(id) {
    if (!id) return null;
    return this.nodes.get(id.trim().toLowerCase()) || null;
  }

  addRelation(subject, predicate, object, metadata = {}) {
    if (!subject || !predicate || !object) {
      throw new Error('Subject, predicate, and object are required for graph edge');
    }

    const subNode = this.addNode(subject, metadata.subjectType || 'entity');
    const objNode = this.addNode(object, metadata.objectType || 'entity');
    const canonicalPred = predicate.trim().toLowerCase().replace(/\s+/g, '_');

    // Avoid duplicate identical edges
    const existing = this.edges.find(e => 
      e.source === subNode.id && 
      e.predicate === canonicalPred && 
      e.target === objNode.id
    );

    if (existing) {
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.updatedAt = new Date().toISOString();
      this._save();
      return existing;
    }

    const edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source: subNode.id,
      predicate: canonicalPred,
      target: objNode.id,
      confidence: metadata.confidence ?? 1.0,
      metadata,
      createdAt: new Date().toISOString()
    };

    this.edges.push(edge);
    this._save();
    return edge;
  }

  queryRelationships(filter = {}) {
    const sub = filter.subject ? filter.subject.trim().toLowerCase() : null;
    const pred = filter.predicate ? filter.predicate.trim().toLowerCase().replace(/\s+/g, '_') : null;
    const obj = filter.object ? filter.object.trim().toLowerCase() : null;

    return this.edges.filter(e => {
      if (sub && e.source !== sub) return false;
      if (pred && e.predicate !== pred) return false;
      if (obj && e.target !== obj) return false;
      return true;
    }).map(e => ({
      ...e,
      sourceLabel: (this.nodes.get(e.source) || {}).label || e.source,
      targetLabel: (this.nodes.get(e.target) || {}).label || e.target,
    }));
  }

  /**
   * Explores multi-hop connections outward from an entity up to maxDepth.
   */
  traverse(startEntityId, maxDepth = 2) {
    if (!startEntityId) return { nodes: [], edges: [] };
    const startId = startEntityId.trim().toLowerCase();
    const visitedNodes = new Set([startId]);
    const gatheredEdges = [];

    let currentLevel = [startId];
    for (let depth = 0; depth < maxDepth; depth++) {
      const nextLevel = [];
      for (const nodeId of currentLevel) {
        // Find outgoing and incoming edges
        const connectedEdges = this.edges.filter(e => e.source === nodeId || e.target === nodeId);
        for (const e of connectedEdges) {
          if (!gatheredEdges.some(ge => ge.id === e.id)) {
            gatheredEdges.push(e);
          }
          const neighbor = e.source === nodeId ? e.target : e.source;
          if (!visitedNodes.has(neighbor)) {
            visitedNodes.add(neighbor);
            nextLevel.push(neighbor);
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    const gatheredNodes = Array.from(visitedNodes).map(id => this.nodes.get(id)).filter(Boolean);
    return {
      startEntity: startId,
      depthExplored: maxDepth,
      nodes: gatheredNodes,
      edges: gatheredEdges
    };
  }

  /**
   * Breadth-first search for shortest associative reasoning path between two entities.
   */
  findShortestPath(sourceId, targetId) {
    const src = sourceId.trim().toLowerCase();
    const tgt = targetId.trim().toLowerCase();
    if (src === tgt) return { found: true, distance: 0, path: [src] };

    const queue = [[src]];
    const visited = new Set([src]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentNode = currentPath[currentPath.length - 1];

      // Outgoing edges
      const nextEdges = this.edges.filter(e => e.source === currentNode || e.target === currentNode);
      for (const edge of nextEdges) {
        const neighbor = edge.source === currentNode ? edge.target : edge.source;
        if (neighbor === tgt) {
          return {
            found: true,
            distance: currentPath.length,
            path: [...currentPath, tgt],
            relationshipHops: [...currentPath, tgt].map((id, i, arr) => {
              if (i === arr.length - 1) return null;
              const nextId = arr[i + 1];
              const matchEdge = this.edges.find(e => 
                (e.source === id && e.target === nextId) || (e.source === nextId && e.target === id)
              );
              return matchEdge ? { from: id, predicate: matchEdge.predicate, to: nextId } : null;
            }).filter(Boolean)
          };
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...currentPath, neighbor]);
        }
      }
    }

    return { found: false, distance: -1, path: [] };
  }

  /**
   * Heuristic semantic triple extractor for sentences like:
   * "Alex bought Tesla Model S" -> (Alex, bought, Tesla Model S)
   * "Sarah is allergic to peanuts" -> (Sarah, allergic_to, peanuts)
   */
  extractTriplesFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const triples = [];

    const patterns = [
      /(?<subject>[A-Z][a-z0-9_]+(?:\s+[A-Z][a-z0-9_]+)?)\s+(?:owns|bought|purchased|drives)\s+(?<object>[A-Z0-9][a-zA-Z0-9_\s]+)/gi,
      /(?<subject>[A-Z][a-z0-9_]+)\s+is allergic to\s+(?<object>[a-zA-Z0-9_\s]+)/gi,
      /(?<subject>[A-Z][a-z0-9_]+)\s+works at\s+(?<object>[A-Z0-9][a-zA-Z0-9_\s]+)/gi,
      /(?<subject>[A-Z][a-z0-9_]+)\s+lives in\s+(?<object>[A-Z][a-zA-Z0-9_\s]+)/gi,
      /(?<subject>[A-Z][a-z0-9_]+)\s+depends on\s+(?<object>[A-Z0-9][a-zA-Z0-9_\s]+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match.groups && match.groups.subject && match.groups.object) {
          const sub = match.groups.subject.trim();
          const obj = match.groups.object.trim().replace(/[.,;]$/, '');
          let pred = 'relates_to';
          if (/allergic to/i.test(match[0])) pred = 'allergic_to';
          else if (/owns|bought|purchased|drives/i.test(match[0])) pred = 'owns';
          else if (/works at/i.test(match[0])) pred = 'employed_at';
          else if (/lives in/i.test(match[0])) pred = 'resides_in';
          else if (/depends on/i.test(match[0])) pred = 'depends_on';

          triples.push({ subject: sub, predicate: pred, object: obj });
        }
      }
    }

    return triples;
  }
}

let _kgInstance = null;
function getKnowledgeGraph(userIdOrOptions = null) {
  if (typeof userIdOrOptions === 'string') {
    if (userIdOrOptions.includes('/') || userIdOrOptions.includes('\\') || userIdOrOptions.endsWith('.json')) {
      return new PersonalKnowledgeGraph({ storagePath: userIdOrOptions });
    }
    return PersonalKnowledgeGraph.forUser(userIdOrOptions);
  }
  if (userIdOrOptions && typeof userIdOrOptions === 'object') {
    if (userIdOrOptions.userId) {
      return PersonalKnowledgeGraph.forUser(userIdOrOptions.userId, userIdOrOptions);
    }
    if (userIdOrOptions.storagePath || userIdOrOptions.filePath) {
      return new PersonalKnowledgeGraph(userIdOrOptions);
    }
  }
  if (!_kgInstance) {
    _kgInstance = PersonalKnowledgeGraph.forUser('default');
  }
  return _kgInstance;
}

function purgeUserData(userId, options = {}) {
  const kgPurged = PersonalKnowledgeGraph.purgeUserData(userId, options);
  try {
    const { MemoryStore } = require('../memory');
    MemoryStore.purgeUserData(userId, options);
  } catch {}
  return kgPurged;
}

module.exports = {
  PersonalKnowledgeGraph,
  getKnowledgeGraph,
  defaultKnowledgeGraphPath,
  purgeUserData,
};
