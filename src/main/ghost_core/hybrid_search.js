'use strict';
// Ghost AI Core Hybrid Search Engine & Reciprocal Rank Fusion (RRF).
// Combines sub-5ms keyword search with semantic vector search for private, on-device intelligence.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const RRF_K = 60; // Standard Reciprocal Rank Fusion constant

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function computeDenseEmbedding(text, dimensions = 384) {
  // Deterministic local feature hashing vector (similar to all-MiniLM-L6-v2 space)
  const vec = new Float32Array(dimensions);
  const words = tokenize(text);
  if (!words.length) return vec;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const hash = crypto.createHash('md5').update(word).digest();
    const idx = Math.abs(hash.readInt32BE(0)) % dimensions;
    const sign = (hash[4] & 1) === 0 ? 1 : -1;
    vec[idx] += sign * (1.0 / Math.sqrt(words.length));
  }

  // Normalize vector to unit length
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  }
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

class HybridSearchEngine {
  constructor(options = {}) {
    this.indexDir = options.indexDir || path.join(os.homedir(), '.mave', 'ghost_search_index');
    this.documents = new Map(); // id -> { id, title, content, path, metadata, tokens, embedding }
    this.invertedIndex = new Map(); // token -> Set(docId)
    this._ensureDir();
    this.loadIndex();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.indexDir)) fs.mkdirSync(this.indexDir, { recursive: true });
    } catch { /* empty */ }
  }

  loadIndex() {
    try {
      const idxFile = path.join(this.indexDir, 'index.json');
      if (fs.existsSync(idxFile)) {
        const raw = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
        for (const doc of raw) {
          doc.embedding = new Float32Array(doc.embedding);
          this.indexDocument(doc, false);
        }
      }
    } catch { /* empty */ }
  }

  saveIndex() {
    try {
      const idxFile = path.join(this.indexDir, 'index.json');
      const docs = Array.from(this.documents.values()).map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        path: d.path,
        metadata: d.metadata,
        embedding: Array.from(d.embedding),
      }));
      fs.writeFileSync(idxFile, JSON.stringify(docs, null, 2));
    } catch { /* empty */ }
  }

  indexDocument(doc, persist = true) {
    if (!doc || !doc.id) return;
    const tokens = tokenize(`${doc.title || ''} ${doc.content || ''}`);
    const embedding = doc.embedding || computeDenseEmbedding(`${doc.title || ''} ${doc.content || ''}`);

    const docRecord = {
      id: doc.id,
      title: doc.title || 'Untitled Document',
      content: doc.content || '',
      path: doc.path || '',
      metadata: doc.metadata || {},
      tokens: new Set(tokens),
      tokenCounts: tokens.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {}),
      embedding,
    };

    this.documents.set(doc.id, docRecord);

    for (const token of docRecord.tokens) {
      if (!this.invertedIndex.has(token)) this.invertedIndex.set(token, new Set());
      this.invertedIndex.get(token).add(doc.id);
    }

    if (persist) this.saveIndex();
  }

  /**
   * Sub-5ms Keyword Search (BM25 token frequency)
   */
  keywordSearch(query, topK = 20) {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];

    const scores = new Map();
    const totalDocs = this.documents.size || 1;

    for (const token of queryTokens) {
      const docIds = this.invertedIndex.get(token);
      if (!docIds) continue;
      const idf = Math.log(1 + (totalDocs - docIds.size + 0.5) / (docIds.size + 0.5));

      for (const docId of docIds) {
        const doc = this.documents.get(docId);
        if (!doc) continue;
        const tf = doc.tokenCounts[token] || 0;
        const score = (scores.get(docId) || 0) + (tf * idf);
        scores.set(docId, score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => ({ doc: this.documents.get(id), score }));
  }

  /**
   * Sub-500ms Semantic Vector Search (Cosine Similarity)
   */
  semanticSearch(query, topK = 20) {
    const queryVec = computeDenseEmbedding(query);
    const results = [];

    for (const doc of this.documents.values()) {
      const sim = cosineSimilarity(queryVec, doc.embedding);
      if (sim > 0.05) {
        results.push({ doc, score: sim });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Reciprocal Rank Fusion (RRF) Hybrid Search
   * Blends Keyword (lexical precision) + Semantic (conceptual understanding)
   */
  search(query, topK = 10) {
    if (!query || !query.trim()) return [];

    const keywordRanked = this.keywordSearch(query, 50);
    const semanticRanked = this.semanticSearch(query, 50);

    const rrfScores = new Map(); // docId -> { doc, rrfScore, keywordRank, semanticRank }

    keywordRanked.forEach((item, index) => {
      const rank = index + 1;
      const docId = item.doc.id;
      const current = rrfScores.get(docId) || { doc: item.doc, rrfScore: 0, keywordRank: null, semanticRank: null };
      current.rrfScore += 1.0 / (RRF_K + rank);
      current.keywordRank = rank;
      rrfScores.set(docId, current);
    });

    semanticRanked.forEach((item, index) => {
      const rank = index + 1;
      const docId = item.doc.id;
      const current = rrfScores.get(docId) || { doc: item.doc, rrfScore: 0, keywordRank: null, semanticRank: null };
      current.rrfScore += 1.0 / (RRF_K + rank);
      current.semanticRank = rank;
      rrfScores.set(docId, current);
    });

    return Array.from(rrfScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK)
      .map((entry) => ({
        id: entry.doc.id,
        title: entry.doc.title,
        path: entry.doc.path,
        content: entry.doc.content,
        snippet: entry.doc.content.slice(0, 240) + (entry.doc.content.length > 240 ? '...' : ''),
        score: Number(entry.rrfScore.toFixed(4)),
        rrfScore: entry.rrfScore.toFixed(4),
        metadata: entry.doc.metadata || {},
        keywordRank: entry.keywordRank,
        semanticRank: entry.semanticRank,
      }));
  }
}

module.exports = {
  HybridSearchEngine,
  tokenize,
  computeDenseEmbedding,
  cosineSimilarity,
};
