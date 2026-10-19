'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { HybridSearchEngine } = require('../src/main/ghost_core/hybrid_search');
const { GhostFileWatcher, SUPPORTED_EXTENSIONS } = require('../src/main/ghost_core/file_watcher');
const { GhostHardwareProfiler, MODEL_TIERS } = require('../src/main/ghost_core/hardware_profiler');
const { getGhostAICore } = require('../src/main/ghost_core');

test('Ghost File Watcher correctly identifies supported extensions and crawls files', async () => {
  assert.equal(SUPPORTED_EXTENSIONS.has('.js'), true);
  assert.equal(SUPPORTED_EXTENSIONS.has('.md'), true);
  assert.equal(SUPPORTED_EXTENSIONS.has('.json'), true);
  assert.equal(SUPPORTED_EXTENSIONS.has('.exe'), false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-watcher-test-'));
  const testFile1 = path.join(tmpDir, 'test-doc.md');
  const testFile2 = path.join(tmpDir, 'data.json');
  fs.writeFileSync(testFile1, '# Sovereign Agent OS\nGhost AI architecture on-device intelligence.');
  fs.writeFileSync(testFile2, JSON.stringify({ mave: 'private', version: '1.4.8' }));

  const searchEngine = new HybridSearchEngine({
    indexDir: path.join(tmpDir, 'index')
  });

  const watcher = new GhostFileWatcher({
    searchEngine,
    watchRoots: [tmpDir],
    logger: { info: () => {}, error: () => {} }
  });

  const stats = await watcher.crawlAll();
  assert.ok(stats.filesIndexed >= 2, `Should have indexed at least 2 files, got ${stats.filesIndexed}`);

  // Test hybrid search finding the indexed file
  const searchResults = searchEngine.search('sovereign agent', 5);
  assert.ok(searchResults.length > 0, 'Should find indexed document');
  assert.equal(searchResults[0].title, 'test-doc.md');

  // Test preindexed system actions
  const actionResults = searchEngine.search('terminal command', 5);
  assert.ok(actionResults.length > 0, 'Should find preindexed terminal action');

  watcher.close();
  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Ghost Hardware Profiler dynamically recommends model tier based on specs', async () => {
  const profiler = new GhostHardwareProfiler();
  const profile = await profiler.profile();

  assert.ok(profile.hardware);
  assert.ok(profile.recommendation);
  assert.ok(profile.recommendation.tier);
  assert.ok(profile.recommendation.recommendedModel);
  assert.ok(profile.fallbackOrder.length >= 3);
});

test('Ghost AICore integrates file watcher and hardware profiler in getStatus()', async () => {
  const core = getGhostAICore();
  const status = core.getStatus();

  assert.equal(status.name, 'Mave');
  assert.ok(status.fileWatcher);
  assert.ok(typeof status.fileWatcher.filesIndexed === 'number');
  assert.ok(status.hardwareProfile);
  assert.ok(status.hardwareProfile.recommendation);
  core.fileWatcher.close();
});
