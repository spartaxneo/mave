'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MemoryDatabase } = require('../src/main/memory/memory_database');
const { ContinuousLearningEngine } = require('../src/main/memory/continuous_learning_engine');
const { MemoryPipeline } = require('../src/main/memory/memory_pipeline');

test('ContinuousLearningEngine - Sensory Ingestion & Perceptual Deduplication', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave_learning_test_'));
  const dbPath = path.join(tempDir, 'test_memory.db');
  const db = new MemoryDatabase('user_alice', dbPath);
  const engine = new ContinuousLearningEngine('user_alice', { db, dedupWindowMs: 5000 });

  await t.test('ingests camera observation with salient score', () => {
    const id = engine.ingestSensoryEvent({
      channel: 'camera',
      deviceId: 'webcam_desk',
      text: 'User sat down at desk with notebook and opened laptop',
      tags: ['presence', 'desk_activity'],
      salience: 0.85,
    });
    assert.ok(id, 'Returns valid observation id');

    const obs = db.getSensoryObservations({ channel: 'camera' });
    assert.equal(obs.length, 1);
    assert.equal(obs[0].observationText, 'User sat down at desk with notebook and opened laptop');
    assert.equal(obs[0].salienceScore, 0.85);
    assert.equal(obs[0].consolidated, false);
  });

  await t.test('perceptual deduplication suppresses identical event within window', () => {
    const dupId = engine.ingestSensoryEvent({
      channel: 'camera',
      deviceId: 'webcam_desk',
      text: 'User sat down at desk with notebook and opened laptop',
      tags: ['presence'],
      salience: 0.85,
    });
    assert.equal(dupId, null, 'Duplicate event within window is filtered out');

    const obs = db.getSensoryObservations({ channel: 'camera' });
    assert.equal(obs.length, 1, 'Still only 1 record in database');
  });

  await t.test('low-salience background noise is ignored', () => {
    const noiseId = engine.ingestSensoryEvent({
      channel: 'audio',
      deviceId: 'room_mic',
      text: 'faint hum in distance',
      tags: [],
      salience: 0.1, // below 0.2 gate
    });
    assert.equal(noiseId, null, 'Low salience noise without tags is discarded');
  });

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('ContinuousLearningEngine - Work, Learning & Skill Portfolios', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave_learning_test_2_'));
  const dbPath = path.join(tempDir, 'test_memory.db');
  const db = new MemoryDatabase('user_bob', dbPath);
  const engine = new ContinuousLearningEngine('user_bob', { db });

  await t.test('records work milestone with semantic mirroring', () => {
    const workId = engine.recordWork({
      title: 'Built Distributed Mesh Transport',
      details: 'Implemented WebRTC and mDNS discovery for 3 connected devices',
      projectId: 'mave_core',
      skillsUsed: ['networking', 'webrtc'],
      sourceDevice: 'workstation_node1',
    });
    assert.ok(workId);

    const logs = db.queryWorkLearning({ category: 'work' });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].title, 'Built Distributed Mesh Transport');
    assert.equal(logs[0].projectId, 'mave_core');

    // Check semantic memory mirror
    const facts = db.querySemanticFacts('work_portfolio', 'Built Distributed Mesh Transport');
    assert.equal(facts.length, 1);
    assert.match(facts[0].fact, /WebRTC and mDNS/);
  });

  await t.test('records learning insight and updates semantic memory', () => {
    const learnId = engine.recordLearning({
      topic: 'Rust Async Executors',
      insight: 'Tokio multi-thread executor handles I/O bound tasks better with bounded queues',
      sourceDevice: 'macbook_air',
    });
    assert.ok(learnId);

    const learnLogs = db.queryWorkLearning({ category: 'learning' });
    assert.equal(learnLogs.length, 1);
    assert.equal(learnLogs[0].title, 'Rust Async Executors');

    const facts = db.querySemanticFacts('learning', 'Tokio');
    assert.equal(facts.length, 1);
    assert.match(facts[0].fact, /Tokio multi-thread executor/);
  });

  await t.test('records verified procedural skill', () => {
    const skillId = engine.recordSkillAcquired({
      skillName: 'Deploy Next.js to Vercel with Custom Domain',
      description: 'End-to-end steps to verify DNS, set environment secrets, and trigger production build',
      steps: ['Run git push origin main', 'Verify vercel --prod', 'Check SSL cert status via DNS API'],
      toolsNeeded: ['terminal', 'vercel_cli'],
    });
    assert.ok(skillId);

    const proc = db.getProcedure('Deploy Next.js to Vercel with Custom Domain');
    assert.ok(proc);
    assert.equal(proc.steps.length, 3);
  });

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('ContinuousLearningEngine - Nightly Sleep Consolidation Cycle', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave_learning_test_3_'));
  const dbPath = path.join(tempDir, 'test_memory.db');
  const db = new MemoryDatabase('user_carol', dbPath);
  const engine = new ContinuousLearningEngine('user_carol', { db });

  // Seed events
  engine.ingestSensoryEvent({
    channel: 'screen',
    deviceId: 'laptop',
    text: 'User spent 3 hours refactoring SQLite database queries in VS Code',
    tags: ['coding', 'screen'],
    salience: 0.9,
  });

  engine.recordWork({
    title: 'Optimized DB queries',
    details: 'Reduced query latency by 45%',
    projectId: 'alpha_proj',
  });

  engine.recordLearning({
    topic: 'SQLite Indexing',
    insight: 'Compound indexes on (user_id, timestamp) eliminate table scans',
  });

  // Run Sleep Consolidation
  const report = engine.consolidateMemories({ targetDateStr: '2026-11-13' });
  assert.equal(report.dateStr, '2026-11-13');
  assert.equal(report.consolidatedObservationsCount, 1);
  assert.ok(report.digestId);

  // Verify daily digest was saved in SQLite
  const digest = db.getDailyDigest('2026-11-13');
  assert.ok(digest);
  assert.match(digest.summary, /Completed 1 work items/);
  assert.match(digest.summary, /SQLite Indexing/);
  assert.ok(digest.activeProjects.includes('alpha_proj'));

  // Verify sensory observations marked consolidated
  const remainingUnconsolidated = db.getSensoryObservations({ unconsolidatedOnly: true });
  assert.equal(remainingUnconsolidated.length, 0);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('ContinuousLearningEngine & MemoryPipeline - Grounded Context Budgeting & Tenant Isolation', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave_learning_test_4_'));
  const dbPathA = path.join(tempDir, 'user_a.db');
  const dbPathB = path.join(tempDir, 'user_b.db');

  const dbA = new MemoryDatabase('tenant_a', dbPathA);
  const dbB = new MemoryDatabase('tenant_b', dbPathB);

  const engineA = new ContinuousLearningEngine('tenant_a', { db: dbA });
  const engineB = new ContinuousLearningEngine('tenant_b', { db: dbB });

  // Tenant A work
  engineA.recordWork({
    title: 'Secret Alpha Project for Tenant A',
    details: 'Confidential client algorithm deployment',
  });
  engineA.consolidateMemories({ targetDateStr: '2026-11-12' });

  // Tenant B context recall must NOT contain Tenant A data
  const contextB = engineB.getGroundedContext('Secret Alpha Project', { maxTokens: 400 });
  assert.doesNotMatch(contextB.contextText, /Secret Alpha Project/);
  assert.doesNotMatch(contextB.contextText, /Confidential client algorithm/);

  // Tenant A context recall retrieves its own work & past digest within budget
  const contextA = engineA.getGroundedContext('Secret Alpha Project', { maxTokens: 400 });
  assert.match(contextA.contextText, /Secret Alpha Project/);
  assert.ok(contextA.tokenCount > 0);
  assert.ok(contextA.tokenCount <= 400);

  // MemoryPipeline turn learning integration
  const pipelineA = new MemoryPipeline('tenant_a', { db: dbA, learningEngine: engineA });
  const turnLearnings = pipelineA.processTurnForLearning(
    'Today I learned that using Web Workers keeps the UI completely non-blocking during heavy compute.',
    'Understood! I will log that to your continuous learning portfolio.'
  );
  assert.equal(turnLearnings.length, 1);
  assert.equal(turnLearnings[0].type, 'learning');

  const savedLearningFacts = dbA.querySemanticFacts('learning', 'Web Workers');
  assert.equal(savedLearningFacts.length, 1);

  // Purge test
  pipelineA.db.purgeAllData();
  const clearedDigests = dbA.getRecentDigests(10);
  assert.equal(clearedDigests.length, 0);
  const clearedWork = dbA.queryWorkLearning({});
  assert.equal(clearedWork.length, 0);

  dbA.close();
  dbB.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
