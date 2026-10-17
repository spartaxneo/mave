'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const metaPlugin = require('../src/main/plugins/builtin/meta_orchestrator');

const findTool = (name) => metaPlugin.find((t) => t.name === name);

test('meta_orchestrator exports all 6 human metacognition, market analysis, and delegation tools', () => {
  const tools = metaPlugin.map((t) => t.name);
  assert.ok(tools.includes('human_strategy_planner'));
  assert.ok(tools.includes('delegate_to_codex_or_antigravity'));
  assert.ok(tools.includes('consult_dual_models_and_compare'));
  assert.ok(tools.includes('evaluate_human_satisfaction_loop'));
  assert.ok(tools.includes('conduct_rigorous_market_analysis'));
  assert.ok(tools.includes('provide_candid_critical_review'));
});

test('human_strategy_planner routes coding task to Codex/Antigravity with test-driven roadmap', async () => {
  const planner = findTool('human_strategy_planner');
  const mockCtx = { log: () => {} };

  const res = await planner.run({ task_description: 'Build a robust SQLite caching service for API tokens' }, mockCtx);
  assert.ok(res.includes('Codex & Antigravity'));
  assert.ok(res.includes('Architectural Specification'));

  assert.ok(res.includes('Automated Verification Harness'));
  assert.ok(res.includes('Human Quality & Acceptance Rubric'));
});

test('human_strategy_planner routes report task to dual-model ChatGPT + Claude consultation', async () => {
  const planner = findTool('human_strategy_planner');
  const mockCtx = { log: () => {} };

  const res = await planner.run({ task_description: 'Write an executive report on Microservices vs Monoliths for 2026' }, mockCtx);
  assert.ok(res.includes('ChatGPT + Claude'));
  assert.ok(res.includes('Multi-Model Cross-Examination'));
  assert.ok(res.includes('Master Synthesis'));
});

test('delegate_to_codex_or_antigravity establishes senior production standards and test verification', async () => {
  const codex = findTool('delegate_to_codex_or_antigravity');
  const mockCtx = { log: () => {} };

  const res = await codex.run({
    coding_task: 'Implement a thread-safe rate limiter with token bucket algorithm',
    language: 'python',
    require_tests: true,
  }, mockCtx);

  assert.ok(res.includes('CODEX & ANTIGRAVITY SPECIALIST DELEGATION COMPLETED'));
  assert.ok(res.includes('python'));
  assert.ok(res.includes('Antigravity Rule'));
  assert.ok(res.includes('Codex Rule'));
  assert.ok(res.includes('test_main.py'));
  assert.ok(res.includes('run_command'));
});

test('consult_dual_models_and_compare synthesizes ChatGPT + Claude perspectives with cross-examination', async () => {
  const dualModel = findTool('consult_dual_models_and_compare');
  const mockCtx = {
    log: () => {},
    settings: { secret: () => '' },
  };

  const res = await dualModel.run({
    report_topic: 'PostgreSQL vs DynamoDB for High-Throughput Fintech Ledger',
    target_audience: 'VP of Engineering and Principal Architects',
    min_depth_level: 'deep',
  }, mockCtx);

  assert.ok(res.includes('MASTER SYNTHESIS REPORT'));
  assert.ok(res.includes('Multi-Model Cross-Examination'));
  assert.ok(res.includes('ChatGPT Perspective'));
  assert.ok(res.includes('Claude Perspective'));
  assert.ok(res.includes('Points of Strong Consensus'));
  assert.ok(res.includes('Critical Points of Divergence'));
  assert.ok(res.includes('Blindspots Identified'));
  assert.ok(res.includes('Human Satisfaction Review'));
});

test('evaluate_human_satisfaction_loop accurately identifies defects and approves excellence', async () => {
  const critic = findTool('evaluate_human_satisfaction_loop');
  const mockCtx = { log: () => {} };

  // Defective code draft with TODO and no tests/error handling
  const badCode = 'function doSomething() { // TODO: implement\n return true; }';
  const badRes = await critic.run({
    draft_content: badCode,
    original_goal: 'Create an authentication validator',
    deliverable_type: 'code',
  }, mockCtx);

  assert.ok(badRes.includes('NEEDS REFINEMENT'));
  assert.ok(badRes.includes('TODO') || badRes.includes('error') || badRes.includes('test'));

  // High quality structured report
  const goodReport = `### Executive Summary
• Core finding: Distributed event log architecture delivers sub-10ms ledger immutability.

### 1. Architectural Taxonomy
Detailed breakdown of ledger consensus.

### 2. Failure Mode Analysis
Graceful degradation through idempotent event sourcing.

### 3. Conclusion & Recommendations
Summary: Deploy in three canary rings with automated snapshot rollbacks.`;

  const goodRes = await critic.run({
    draft_content: goodReport,
    original_goal: 'Analyze fintech ledger architecture',
    deliverable_type: 'report',
  }, mockCtx);

  assert.ok(goodRes.includes('SATISFIED') || goodRes.includes('Score'));
});

test('human_strategy_planner routes market analysis and feedback requests to specialized reality-check tools', async () => {
  const planner = findTool('human_strategy_planner');
  const mockCtx = { log: () => {} };

  const marketRes = await planner.run({ task_description: 'Analyze the market opportunity, TAM, and pricing for an AI sales assistant' }, mockCtx);
  assert.ok(marketRes.includes('conduct_rigorous_market_analysis'));
  assert.ok(marketRes.includes('Bottom-Up Market Sizing'));

  const feedbackRes = await planner.run({ task_description: 'Give me your honest feedback and critique on my B2B SaaS pitch' }, mockCtx);
  assert.ok(feedbackRes.includes('provide_candid_critical_review'));
  assert.ok(feedbackRes.includes('Strip Away False Hope'));
});

test('conduct_rigorous_market_analysis performs empirical TAM/SAM/SOM sizing and moat reality check', async () => {
  const marketTool = findTool('conduct_rigorous_market_analysis');
  const mockCtx = { log: () => {} };

  const res = await marketTool.run({
    product_or_concept: 'Autonomous AI Email Assistant for Busy Executives',
    target_customer: 'Fortune 500 VPs and Directors',
    pricing_model: '$49/month per user',
    geographic_market: 'North America & Europe',
  }, mockCtx);

  assert.ok(res.includes('EMPIRICAL MARKET ANALYSIS & REALITY AUDIT'));
  assert.ok(res.includes('TAM (Total Addressable Market)'));
  assert.ok(res.includes('SAM (Serviceable Addressable Market)'));
  assert.ok(res.includes('SOM (Serviceable Obtainable Market)'));
  assert.ok(res.includes('Big Tech & Platform Threats'));
  assert.ok(res.includes('Unit Economics & Margin Stress Test'));
  assert.ok(res.includes('Defensibility & Moat Reality Check'));
  assert.ok(res.includes('Top 3 Mortality Traps'));
  assert.ok(res.includes('Battle-Tested Strategic Pivot Roadmap'));
});

test('provide_candid_critical_review debunks flawed assumptions and eliminates fake hope', async () => {
  const reviewTool = findTool('provide_candid_critical_review');
  const mockCtx = { log: () => {} };

  const res = await reviewTool.run({
    proposal_or_idea: 'A mobile app that summarizes news using ChatGPT and charges $10/month',
    context_or_domain: 'Consumer Mobile AI App',
    brutality_level: 'unvarnished',
  }, mockCtx);

  assert.ok(res.includes('CANDID CRITICAL REVIEW & REALITY CHECK'));
  assert.ok(res.includes('The Hard Truths'));
  assert.ok(res.includes('Flawed Assumptions Debunked'));
  assert.ok(res.includes('Calculated Mortality Risk'));
  assert.ok(res.includes('Fatal Trapdoor Analysis'));
  assert.ok(res.includes('Concrete High-Leverage Turnaround Roadmap'));
});
