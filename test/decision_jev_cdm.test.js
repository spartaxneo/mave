'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JevEngine, getJevEngine, JevChoice, JevNoul, JevScore } = require('../src/main/decision/jev_engine');
const { CDMEngine, getCDMEngine } = require('../src/main/decision/cdm_engine');
const { processWithJevAndCDM } = require('../src/main/decision/index');
const { matchIntent } = require('../src/main/intents');

const jev = getJevEngine();
const cdm = getCDMEngine();

test('JevEngine: Choice, Noul, and Score evaluation primitives', () => {
  const context = {
    ticket: 'Urgent: Production server returned HTTP 500 error on checkout page. High customer impact.',
    tier: 'enterprise',
  };

  const evalResult = jev.evaluate(context, {
    urgency: jev.Choice(['low', 'medium', 'high', 'critical']),
    needsEscalation: jev.Noul(0.4),
    severityScore: jev.Score(1, 10),
  });

  assert.ok(evalResult, 'Evaluation succeeded');
  assert.ok(evalResult.latencyMs < 50, 'Sub-50ms execution');

  // Choice
  const urgency = evalResult.decisions.urgency;
  assert.ok(urgency.value === 'high' || urgency.value === 'critical', 'Selected appropriate urgency');
  assert.ok(urgency.confidence >= 0.5, 'Calibrated confidence returned');
  assert.ok(urgency.distribution, 'Full probability distribution returned');

  // Noul
  const escalation = evalResult.decisions.needsEscalation;
  assert.equal(typeof escalation.value, 'boolean', 'Noul returns boolean');

  // Score
  const score = evalResult.decisions.severityScore;
  assert.ok(score.value >= 1 && score.value <= 10, 'Score is bounded between min and max');
});

test('JevEngine: Intent evaluation and guardrail gating', () => {
  // 1. Guardrail block
  const badCommand = jev.evaluateIntent('format c: and delete all files');
  assert.equal(badCommand.type, 'guardrail_block');
  assert.equal(badCommand.verdict, false);
  assert.ok(badCommand.reason.includes('destructive'));

  // 2. Immediate App launch
  const appIntent = jev.evaluateIntent('launch Notepad');
  assert.equal(appIntent.type, 'immediate_action');
  assert.equal(appIntent.category, 'open_app');
  assert.equal(appIntent.params.name.toLowerCase(), 'notepad');
  assert.ok(appIntent.confidence >= 0.85);

  // 3. Immediate Web search
  const searchIntent = jev.evaluateIntent('search web for autonomous agents 2026');
  assert.equal(searchIntent.type, 'immediate_action');
  assert.equal(searchIntent.category, 'web_search');
  assert.ok(searchIntent.params.query.includes('autonomous agents'));

  // 4. System utility
  const awakeIntent = jev.evaluateIntent('keep awake for 4h');
  assert.equal(awakeIntent.type, 'immediate_action');
  assert.equal(awakeIntent.action, 'keep_awake');
  assert.equal(awakeIntent.params.mode, '4h');

  // 5. Conversational greeting
  const greeting = jev.evaluateIntent('hello mave');
  assert.equal(greeting.type, 'conversational_quick');
  assert.ok(greeting.reply.includes('Mave'));

  // 6. Deep reasoning task
  const codingTask = jev.evaluateIntent('Implement a Byzantine fault-tolerant consensus algorithm in Rust');
  assert.equal(codingTask.type, 'deep_reasoning');
});

test('CDMEngine: Context compression reduces bloat while preserving facts', () => {
  const verboseLog = `
    [2026-10-20 12:00:00] INFO: Starting background database sync...
    [2026-10-20 12:00:01] DEBUG: Checking connection pool...
    [2026-10-20 12:00:02] DEBUG: Heartbeat OK on port 5432
    [2026-10-20 12:00:03] ERROR: Connection refused on port 8080: status 503 Service Unavailable
    [2026-10-20 12:00:04] DEBUG: Retrying connection to auth microservice...
    [2026-10-20 12:00:05] WARN: Max retries 3 exceeded for endpoint /api/v2/auth/tokens
    [2026-10-20 12:00:06] INFO: Routine healthcheck finished with exit_code: 1
    Copyright (c) 2026 Acme Corp. All rights reserved.
    --------------------------------------------------
    Terms of service apply to all log data.
  `.repeat(4);

  const compressed = cdm.compress(verboseLog, 'Why did the auth service fail?');
  assert.ok(compressed.compressed.length < verboseLog.length, 'Compression occurred');
  assert.ok(compressed.savingsPct > 30, 'Achieved significant savings');
  assert.ok(compressed.compressed.includes('503 Service Unavailable'), 'Retained critical error fact');
  assert.ok(compressed.compressed.includes('/api/v2/auth/tokens'), 'Retained critical endpoint path');
  assert.ok(!compressed.compressed.includes('Copyright (c)'), 'Stripped irrelevant boilerplate');
});

test('CDMEngine: Constrained schema extraction with zero hallucinations', () => {
  const rawDocument = `
    INVOICE #9482
    Date: 2026-10-15
    Customer: Global Tech Corp
    Total Amount Due: $4,850.50
    Account Status: Active
  `;

  const schema = {
    customer: 'string',
    amount: 'number',
    invoiceDate: 'date',
    status: 'boolean',
  };

  const extracted = cdm.extract(rawDocument, schema);
  assert.equal(extracted.valid, true);
  assert.equal(extracted.data.customer, 'Global Tech Corp');
  assert.equal(extracted.data.amount, 4850.50);
  assert.equal(extracted.data.invoiceDate, '2026-10-15');
  assert.equal(extracted.data.status, true);
  assert.ok(extracted.citations.amount, 'Includes citation span');
});

test('CDMEngine: Multi-turn conversation compression', () => {
  const history = [
    { role: 'user', content: 'What is the capital of France?' },
    { role: 'assistant', content: 'The capital of France is Paris.' },
    { role: 'user', content: 'What is its population?' },
    { role: 'assistant', content: 'Paris has a population of approximately 2.1 million people.' },
    { role: 'user', content: 'What is the tallest tower there?' },
    { role: 'assistant', content: 'The tallest tower is the Eiffel Tower.' },
    { role: 'user', content: 'How tall is it in meters?' },
  ];

  const compacted = cdm.compressConversation(history, { preserveRecent: 2 });
  assert.ok(compacted.length < history.length, 'Compacted history length');
  assert.equal(compacted[0].role, 'system', 'Injected CDM context summary block');
  assert.ok(compacted[0].content.includes('User asked:'), 'Summarized earlier questions');
});

test('processWithJevAndCDM: Tripartite orchestration', async () => {
  // Test immediate reflex handling
  const quickResult = await processWithJevAndCDM('keep awake for 15m');
  assert.equal(quickResult.handled, true);
  assert.equal(quickResult.actionType, 'keep_awake');
  assert.ok(quickResult.latencyMs < 50);

  // Test deep reasoning task pass-through with history compression
  const deepResult = await processWithJevAndCDM('Plan a 5-day itinerary for Tokyo', {
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'I like sushi' },
      { role: 'assistant', content: 'Sushi is great' },
      { role: 'user', content: 'I like anime' },
      { role: 'assistant', content: 'Akihabara is a great destination' },
    ],
  });

  assert.equal(deepResult.handled, false);
  assert.equal(deepResult.actionType, 'deep_reasoning');
  assert.ok(deepResult.compressedHistory.length <= 5);
});

test('Intents: Jev System 1 reflex integration in matchIntent', () => {
  const awakeIntent = matchIntent('keep awake for 1 hour');
  assert.ok(awakeIntent, 'matchIntent handled keep awake via Jev');
  assert.ok(awakeIntent.reply.includes('Keep Awake'));

  const cleanIntent = matchIntent('lock keyboard for cleaning');
  assert.ok(cleanIntent, 'matchIntent handled cleaning lock via Jev');
  assert.ok(cleanIntent.reply.includes('cleaning'));
});
