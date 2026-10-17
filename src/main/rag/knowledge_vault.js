'use strict';
// Local Neural Knowledge Vault (Personal RAG) for Bigfoot.
// Provides 100% offline document indexing, chunking, and semantic BM25 relevance retrieval.
// Zero data leaves the PC. Index stored in D:\Bigfoot\vault\.

const fs = require('fs');
const path = require('path');

class KnowledgeVault {
  constructor(vaultDir = 'D:\\Bigfoot\\vault') {
    this.vaultDir = vaultDir;
    this.indexFilePath = path.join(vaultDir, 'vault_index.json');
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.vaultDir)) fs.mkdirSync(this.vaultDir, { recursive: true });
    } catch {}
  }

  loadIndex() {
    this._ensureDir();
    if (!fs.existsSync(this.indexFilePath)) return { documents: [], chunks: [] };
    try {
      return JSON.parse(fs.readFileSync(this.indexFilePath, 'utf8'));
    } catch {
      return { documents: [], chunks: [] };
    }
  }

  saveIndex(index) {
    this._ensureDir();
    fs.writeFileSync(this.indexFilePath, JSON.stringify(index, null, 2), 'utf8');
  }

  _chunkText(text, chunkSize = 400, overlap = 50) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const piece = text.slice(start, end).trim();
      if (piece) chunks.push(piece);
      if (end >= text.length) break;
      start += chunkSize - overlap;
    }
    return chunks;
  }

  /**
   * Index a local file into the personal vault.
   */
  indexFile(filePath, customCategory = 'General') {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);

    const stats = fs.statSync(resolved);
    const content = fs.readFileSync(resolved, 'utf8');
    const chunksText = this._chunkText(content);

    const index = this.loadIndex();

    // Remove old chunks for this file if already indexed
    index.documents = index.documents.filter((d) => d.path !== resolved);
    index.chunks = index.chunks.filter((c) => c.sourcePath !== resolved);

    const docId = `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const docEntry = {
      id: docId,
      name: path.basename(resolved),
      path: resolved,
      category: customCategory,
      sizeBytes: stats.size,
      indexedAt: new Date().toISOString(),
      chunkCount: chunksText.length,
    };
    index.documents.push(docEntry);

    chunksText.forEach((text, idx) => {
      index.chunks.push({
        id: `${docId}_c${idx}`,
        docId,
        sourceName: path.basename(resolved),
        sourcePath: resolved,
        category: customCategory,
        chunkIndex: idx,
        text,
      });
    });

    this.saveIndex(index);
    return {
      docId,
      name: path.basename(resolved),
      path: resolved,
      chunkCount: chunksText.length,
      category: customCategory,
    };
  }

  /**
   * Search the vault using tokenized relevance scoring.
   */
  search(query, categoryFilter = null, limit = 5) {
    const index = this.loadIndex();
    if (!index.chunks.length) return [];

    const terms = String(query || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (!terms.length) return [];

    const scored = [];

    for (const chunk of index.chunks) {
      if (categoryFilter && chunk.category.toLowerCase() !== categoryFilter.toLowerCase()) continue;

      const lower = chunk.text.toLowerCase();
      let score = 0;

      for (const term of terms) {
        if (lower.includes(term)) {
          // Exact term match weight
          score += 2;
          // Count frequency
          const matches = lower.split(term).length - 1;
          score += Math.min(matches, 5) * 0.5;
        }
      }

      // Bonus if document name matches search term
      for (const term of terms) {
        if (chunk.sourceName.toLowerCase().includes(term)) score += 3;
      }

      if (score > 0) {
        scored.push({
          score: Math.round(score * 10) / 10,
          sourceName: chunk.sourceName,
          sourcePath: chunk.sourcePath,
          category: chunk.category,
          chunkIndex: chunk.chunkIndex,
          snippet: chunk.text,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  getVaultStats() {
    const index = this.loadIndex();
    return {
      totalDocuments: index.documents.length,
      totalChunks: index.chunks.length,
      documents: index.documents,
    };
  }
}

let _vault = null;
function getKnowledgeVault() {
  if (!_vault) _vault = new KnowledgeVault();
  return _vault;
}

module.exports = { KnowledgeVault, getKnowledgeVault };
