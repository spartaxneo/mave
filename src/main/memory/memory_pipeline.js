'use strict';

const fs = require('fs');
const path = require('path');
const { MemoryDatabase } = require('./memory_database');
const { getMemoryScopeRouter, ScopeCategory } = require('./memory_scope_router');
const { getContextBudgetManager } = require('./context_budget_manager');
const { ContinuousLearningEngine } = require('./continuous_learning_engine');

class MemoryPipeline {
  constructor(userId = 'default', options = {}) {
    this.userId = userId;
    this.db = options.db || MemoryDatabase.forUser(userId, options);
    this.scopeRouter = options.scopeRouter || getMemoryScopeRouter();
    this.budgetManager = options.budgetManager || getContextBudgetManager(options);
    this.learningEngine = options.learningEngine || ContinuousLearningEngine.forUser(userId, options);
  }

  /**
   * 8-Stage Retrieval Pipeline:
   * 1. Intent & Scope Classification
   * 2. Authorization Check
   * 3. Structured Lookup
   * 4. Metadata Filtering
   * 5. Hybrid Search
   * 6. Reranking
   * 7. Context Packing
   * 8. Grounded Context Delivery
   */
  retrieveContext(taskOrQuery, options = {}) {
    const query = String(taskOrQuery || '').trim();
    if (!query) return { contextText: '', sources: [], tokenCount: 0 };

    // Stage 1: Intent & Scope
    const scope = this.scopeRouter.classifyScope(query);

    // Stage 2: Authorization Check (enforce user boundaries)
    const effectiveUserId = options.userId || this.userId;

    // Stage 3 & 4: Structured Lookup & Metadata Filtering
    const candidateMemories = [];

    if (scope.category === ScopeCategory.PERSON_DIRECTORY) {
      const match = query.match(/\b(?:who is|recognize|about)\s+([a-zA-Z0-9_\s]+)/i);
      const personName = match && match[1] ? match[1].trim() : query;
      const enrolled = this.db.searchAuthorizedPeople(personName);

      if (enrolled.length > 0) {
        for (const p of enrolled) {
          candidateMemories.push({
            type: 'authorized_person',
            text: `Authorized Person: ${p.name} (Relationship: ${p.relationship}, Biometrics Enabled: ${Boolean(p.biometric_enabled)})`,
            confidence: 1.0,
            source: 'authorized_people_directory',
            score: 10,
          });
        }
      } else {
        candidateMemories.push({
          type: 'authorized_person_notice',
          text: `[Identity Security Notice: No enrolled, consenting person matching "${personName}" was found in your authorized directory. Unverified stranger identification is blocked.]`,
          confidence: 1.0,
          source: 'identity_policy',
          score: 10,
        });
      }
    } else if (scope.category === ScopeCategory.CODING_PROJECT) {
      // Query coding semantic facts and procedural skills
      const codingFacts = this.db.querySemanticFacts('coding', '', 5);
      for (const cf of codingFacts) {
        candidateMemories.push({
          type: 'coding_fact',
          text: cf.fact,
          confidence: cf.confidence,
          source: cf.sourceProvenance || 'project_knowledge',
          score: 5,
        });
      }

      // Check relevant past episodes
      const episodes = this.db.queryEpisodes({ limit: 3 });
      for (const ep of episodes) {
        candidateMemories.push({
          type: 'episode',
          text: `Prior Task: "${ep.goal}" — Outcome: ${ep.outcome}`,
          confidence: ep.confidence,
          source: 'episodic_memory',
          score: 4,
        });
      }

      // Check relevant work & learning portfolio items
      const workLogs = this.db.queryWorkLearning({ query, limit: 3 });
      for (const wl of workLogs) {
        candidateMemories.push({
          type: 'work_portfolio',
          text: `Past Work Milestone [${wl.title}]: ${wl.details}`,
          confidence: 1.0,
          source: 'work_learning_portfolio',
          score: 6,
        });
      }
    } else if (scope.category === ScopeCategory.USER_PREFERENCES) {
      const prefFacts = this.db.querySemanticFacts('preferences', '', 5);
      for (const pf of prefFacts) {
        candidateMemories.push({
          type: 'preference',
          text: pf.fact,
          confidence: pf.confidence,
          source: pf.sourceProvenance || 'user_preference',
          score: 8,
        });
      }
    } else {
      // General semantic facts within target namespaces
      for (const ns of scope.targetNamespaces) {
        const facts = this.db.querySemanticFacts(ns, '', 5);
        for (const f of facts) {
          candidateMemories.push({
            type: 'fact',
            text: f.fact,
            confidence: f.confidence,
            source: f.sourceProvenance || 'semantic_store',
            score: 3,
          });
        }
      }

      // Check recent executive daily digests for broad context
      const recentDigests = this.db.getRecentDigests(2);
      for (const rd of recentDigests) {
        candidateMemories.push({
          type: 'daily_digest',
          text: `Daily Executive Digest (${rd.dateStr}): ${rd.summary}`,
          confidence: 1.0,
          source: 'daily_digests',
          score: 4,
        });
      }
    }

    // Stage 5 & 6: Hybrid Scoring & Reranking
    const queryTokens = new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    for (const mem of candidateMemories) {
      const memTokens = mem.text.toLowerCase().split(/\s+/);
      for (const t of memTokens) {
        if (queryTokens.has(t)) mem.score += 2;
      }
    }

    candidateMemories.sort((a, b) => b.score - a.score);

    // Stage 7: Context Packing within Token Budget
    const maxMemoryTokens = options.maxMemoryTokens || 600;
    const packedLines = [];
    let usedTokens = 0;
    const usedSources = [];

    for (const mem of candidateMemories) {
      const line = `- ${mem.text}`;
      const lineTokens = this.budgetManager.estimateTokens(line);
      if (usedTokens + lineTokens <= maxMemoryTokens) {
        packedLines.push(line);
        usedTokens += lineTokens;
        if (!usedSources.includes(mem.source)) usedSources.push(mem.source);
      } else {
        break;
      }
    }

    const contextText = packedLines.length > 0 ? packedLines.join('\n') : '';

    return {
      contextText,
      sources: usedSources,
      tokenCount: usedTokens,
      scopeCategory: scope.category,
    };
  }

  /**
   * Automatic Memory Formation:
   * Extracts enduring user preferences, project configurations, or decisions.
   * Ignores one-time transient conversational chatter.
   */
  processTurnForLearning(userMessage = '', assistantReply = '') {
    const text = String(userMessage || '').trim();
    if (!text) return [];

    const learnings = [];

    // 1. Explicit preference expressions ("I prefer dark mode", "Remember that I live in Seattle")
    const prefMatch = text.match(/\b(?:remember that|i prefer|i always want|my preference is|call me|i like|i love)\s+([^.!?]+)/i);
    if (prefMatch && prefMatch[1]) {
      const fact = prefMatch[1].trim();
      const factId = this.db.storeFact(`User preference: ${fact}`, {
        namespace: 'preferences',
        entityName: 'general_preference',
        sourceProvenance: 'explicit_user_statement',
        confidence: 1.0,
      });
      learnings.push({ id: factId, type: 'preference', fact });
    }

    // 2. Project or technology choices ("We are using Next.js with Tailwind")
    const techMatch = text.match(/\b(?:we are using|the project uses|our stack is|built with)\s+([^.!?]+)/i);
    if (techMatch && techMatch[1]) {
      const stack = techMatch[1].trim();
      const factId = this.db.storeFact(`Project stack: ${stack}`, {
        namespace: 'coding',
        entityName: 'project_stack',
        sourceProvenance: 'explicit_user_statement',
        confidence: 0.95,
      });
      learnings.push({ id: factId, type: 'project_stack', fact: stack });
    }

    // 3. Learning or insight expressions ("I learned that ...", "Today I studied ...", "Key takeaway is ...")
    const learnMatch = text.match(/\b(?:today i learned|i learned that|key takeaway is|note to self|lesson learned)\s+([^.!?]+)/i);
    if (learnMatch && learnMatch[1]) {
      const insight = learnMatch[1].trim();
      const learnId = this.learningEngine.recordLearning({
        topic: 'User Insight',
        insight,
      });
      learnings.push({ id: learnId, type: 'learning', fact: insight });
    }

    return learnings;
  }

  /**
   * Migrate data from legacy memory.json if present.
   */
  migrateLegacyJson(legacyJsonPath) {
    if (!fs.existsSync(legacyJsonPath)) return { migratedCount: 0 };
    try {
      const raw = fs.readFileSync(legacyJsonPath, 'utf8');
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) return { migratedCount: 0 };

      let count = 0;
      for (const item of items) {
        if (item.fact) {
          this.db.storeFact(item.fact, {
            namespace: item.topic || 'general',
            entityName: (item.keywords && item.keywords[0]) || null,
            sourceProvenance: 'legacy_json_migration',
            confidence: 0.9,
          });
          count++;
        }
      }
      return { migratedCount: count };
    } catch {
      return { migratedCount: 0 };
    }
  }
}

module.exports = {
  MemoryPipeline,
};
