'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { MemoryStore } = require('../src/main/memory');
const memoryPlugin = require('../src/main/plugins/builtin/memory');
const modelsPlugin = require('../src/main/plugins/builtin/models');
const catalog = require('../src/main/local/catalog');
const { validate } = require('../src/main/plugins/registry');

test('MemoryStore stores, recalls, and formats context summary', () => {
  const tempFile = path.join(os.tmpdir(), `test_memory_${Date.now()}.json`);
  try {
    const store = new MemoryStore(tempFile);
    assert.equal(store.memories.length, 0);

    const m1 = store.remember('User prefers dark mode in all applications', { topic: 'preference' });
    assert.equal(m1.topic, 'preference');
    assert.equal(store.memories.length, 1);

    const m2 = store.remember('Project backend is Node.js with PostgreSQL on port 5432', { topic: 'project', keywords: ['database', 'postgres'] });
    assert.equal(m2.topic, 'project');
    assert.equal(store.memories.length, 2);

    // Recall matching keywords
    const recalled = store.recall('database settings for my project');
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0].id, m2.id);

    // Context summary includes both
    const summary = store.contextSummary('dark mode preferences');
    assert.ok(summary.includes('dark mode'));

    // Forget memory
    const removed = store.forget(m1.id);
    assert.equal(removed, true);
    assert.equal(store.memories.length, 1);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('memory builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(memoryPlugin));
  assert.equal(memoryPlugin.length, 4);

  for (const tool of memoryPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Memory tool ${tool.name} must be valid: ${error}`);
  }

  const names = memoryPlugin.map((t) => t.name);
  assert.ok(names.includes('remember_fact'));
  assert.ok(names.includes('recall_memory'));
  assert.ok(names.includes('list_memories'));
  assert.ok(names.includes('forget_memory'));
});

test('models builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(modelsPlugin));
  assert.equal(modelsPlugin.length, 3);

  for (const tool of modelsPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Models tool ${tool.name} must be valid: ${error}`);
  }

  const names = modelsPlugin.map((t) => t.name);
  assert.ok(names.includes('register_custom_model'));
  assert.ok(names.includes('list_ai_models'));
  assert.ok(names.includes('switch_ai_model'));
});

test('catalog supports registering and retrieving custom models', () => {
  const dummyGguf = path.join(os.tmpdir(), `dummy_${Date.now()}.gguf`);
  fs.writeFileSync(dummyGguf, Buffer.alloc(1024));

  try {
    const custom = {
      id: `test-model-${Date.now()}`,
      size: '1GB',
      label: 'Test Custom Model',
      memoryGB: 4,
      custom: true,
      modelPath: dummyGguf,
      files: [],
    };

    catalog.saveCustomModel(custom);
    const found = catalog.modelById(custom.id);
    assert.ok(found);
    assert.equal(found.id, custom.id);
    assert.equal(found.label, 'Test Custom Model');
    assert.equal(catalog.downloadBytes(custom.id), 0);

    // Clean up
    catalog.removeCustomModel(custom.id);
    assert.equal(catalog.modelById(custom.id), null);
  } finally {
    if (fs.existsSync(dummyGguf)) fs.unlinkSync(dummyGguf);
  }
});
