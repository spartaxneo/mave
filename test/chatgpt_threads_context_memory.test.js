'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

test('ThreadManager: isolates conversation contexts and auto-titles on first prompt', () => {
  const { ThreadManager } = require('../src/main/threads');
  const tempThreads = path.join(os.tmpdir(), `test_th_${Date.now()}.json`);
  const tempProjects = path.join(os.tmpdir(), `test_pr_${Date.now()}.json`);

  try {
    const tm = new ThreadManager(tempThreads, tempProjects);

    // Create Thread 1
    const t1 = tm.createThread('New Chat', 'desktop');
    assert.equal(t1.title, 'New Chat');
    assert.equal(t1.messages.length, 0);

    // Add first message to Thread 1 -> should auto-title
    tm.addMessage(t1.id, 'user', 'How do I build a trading bot in Node.js?');
    assert.ok(t1.title.includes('Trading bot') || t1.title.includes('Build a trading bot'));
    assert.equal(t1.messages.length, 1);

    // Add reply to Thread 1
    tm.addMessage(t1.id, 'assistant', 'Here is how you structure a trading bot in Node.js...');
    assert.equal(t1.messages.length, 2);

    // Create Thread 2 -> completely isolated
    const t2 = tm.createThread('New Chat', 'desktop');
    assert.equal(t2.messages.length, 0);
    tm.addMessage(t2.id, 'user', 'What is the capital of France?');
    assert.ok(t2.title.includes('Capital of France') || t2.title.includes('France'));
    assert.equal(t2.messages.length, 1);

    // Thread 1 messages must remain intact and independent
    const freshT1 = tm.getThread(t1.id);
    assert.equal(freshT1.messages.length, 2);
    assert.equal(freshT1.messages[0].content, 'How do I build a trading bot in Node.js?');
    assert.equal(freshT1.messages[1].content, 'Here is how you structure a trading bot in Node.js...');

    // Thread 2 messages must remain independent
    const freshT2 = tm.getThread(t2.id);
    assert.equal(freshT2.messages.length, 1);
    assert.equal(freshT2.messages[0].content, 'What is the capital of France?');

    // Test exportThread
    const mdExport = tm.exportThread(t1.id, 'markdown');
    assert.ok(mdExport.includes('# Build a trading bot') || mdExport.includes('# Trading bot'));
    assert.ok(mdExport.includes('**User**'));
    assert.ok(mdExport.includes('**Mave**'));
    assert.ok(mdExport.includes('How do I build a trading bot in Node.js?'));

    const jsonExport = tm.exportThread(t1.id, 'json');
    const parsed = JSON.parse(jsonExport);
    assert.equal(parsed.id, t1.id);
    assert.equal(parsed.messages.length, 2);
  } finally {
    if (fs.existsSync(tempThreads)) fs.unlinkSync(tempThreads);
    if (fs.existsSync(tempProjects)) fs.unlinkSync(tempProjects);
  }
});

test('MemoryStore: ChatGPT-style continuous learning (identity, tech, preferences, explicit remember/forget)', () => {
  const { MemoryStore } = require('../src/main/memory');
  const tempFile = path.join(os.tmpdir(), `test_mem_chatgpt_${Date.now()}.json`);

  try {
    const store = new MemoryStore(tempFile);

    // 1. Explicit Memory Instruction
    store.autoExtractLearnings('Remember that I prefer dark mode and compact code');
    const darkMem = store.recall('dark mode');
    assert.ok(darkMem.length >= 1);

    // 2. Identity & Name
    store.autoExtractLearnings('My name is Alex Vance');
    const nameMem = store.recall('Alex');
    assert.ok(nameMem.length >= 1);
    assert.ok(nameMem[0].fact.includes('Alex Vance'));

    // 3. Profession
    store.autoExtractLearnings('I work as a senior backend engineer');
    const roleMem = store.recall('backend engineer');
    assert.ok(roleMem.length >= 1);

    // 4. Tech stack
    store.autoExtractLearnings('I primarily code in Python and TypeScript');
    const techMem = store.recall('Python');
    assert.ok(techMem.length >= 1);

    // 5. Context summary
    const summary = store.contextSummary('Can you write code for my project?');
    assert.ok(summary.length > 0);

    // 6. Explicit forget
    store.autoExtractLearnings('Forget that I like dark mode');
    const forgotten = store.recall('dark mode');
    assert.equal(forgotten.length, 0);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});
