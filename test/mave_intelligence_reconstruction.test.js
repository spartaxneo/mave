'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Core MAVE Brain V3 Subsystems
const {
  CognitiveEventTypes,
  getCognitiveEventBus,
  TaskStatus,
  GoalContract,
  getGoalDriftDetector,
  EvidenceClassification,
  ToolContract,
  getToolRegistryAndVerifier,
  CapabilityTier,
  ModelRole,
  RoutingPreference,
  getCapabilityRegistry,
  getResearchDiscoveryEngine,
  getCodingAgentOrchestrator,
  getCognitiveOrchestrator,
} = require('../src/main/orchestrator');

const { MemoryDatabase } = require('../src/main/memory/memory_database');
const { MemoryPipeline } = require('../src/main/memory/memory_pipeline');
const { getMemoryScopeRouter, ScopeCategory } = require('../src/main/memory/memory_scope_router');
const { getContextBudgetManager } = require('../src/main/memory/context_budget_manager');
const { getHandsFreeVoicePipeline } = require('../src/main/audio/hands_free_voice');
const { getScreenAwarenessService } = require('../src/main/multimodal/screen_awareness');
const { getCameraAwarenessService } = require('../src/main/multimodal/camera_awareness');
const { getMultimodalFusionEngine } = require('../src/main/multimodal/multimodal_fusion');
const { Settings } = require('../src/main/settings');

test('Test A — Hallucination Resistance & Tool Result Grounding', async (t) => {
  const verifier = getToolRegistryAndVerifier();
  verifier.clear();

  // 1. Invoking an unregistered or non-existent tool throws a validation error
  assert.throws(
    () => verifier.validateToolCall('fake_unregistered_tool', { foo: 'bar' }),
    /Tool "fake_unregistered_tool" is not registered/
  );

  // 2. Reject claimed deliverable that was never created
  const groundingCheck = verifier.verifyDeliverableGrounding('non_existent_file.html');
  assert.strictEqual(groundingCheck.grounded, false);
  assert.strictEqual(groundingCheck.evidence, EvidenceClassification.UNSUPPORTED);

  // 3. Register real tool contract and record execution
  verifier.registerContract(new ToolContract({
    name: 'write_code',
    parameters: { file: { type: 'string', required: true } },
  }));

  const exec = verifier.recordExecutionStart('write_code', { file: 'real_script.js' });
  exec.complete('Wrote 45 lines of code', ['real_script.js']);

  const verifiedCheck = verifier.verifyDeliverableGrounding('real_script.js');
  assert.strictEqual(verifiedCheck.grounded, true);
  assert.strictEqual(verifiedCheck.evidence, EvidenceClassification.RETURNED_BY_TOOL);
});

test('Test B — Goal Preservation & Unrequested Diversion Guard', async (t) => {
  const driftDetector = getGoalDriftDetector();
  driftDetector.resetHistory();

  const goal = new GoalContract({
    originalRequest: 'Write a technical summary of distributed consensus algorithms',
    status: TaskStatus.ACTIVE,
  });

  // Action 1: Legitimate research tool call
  const validAction = { tool: 'web_search', args: { query: 'Raft consensus algorithm paper' } };
  const eval1 = driftDetector.evaluateCandidateAction(goal, validAction);
  assert.strictEqual(eval1.allowed, true);

  // Action 2: Unrequested social media divert (Instagram/TikTok/Netflix)
  const divertAction = { tool: 'open_url', args: { url: 'https://instagram.com/reels' } };
  const eval2 = driftDetector.evaluateCandidateAction(goal, divertAction);
  assert.strictEqual(eval2.allowed, false);
  assert.match(eval2.reason, /Unrequested diversion to Instagram/);
});

test('Test C — User Correction during Active Task', async (t) => {
  const goal = new GoalContract({
    originalRequest: 'Build a landing page for my company in blue',
    status: TaskStatus.ACTIVE,
  });

  const originalFrozen = goal.originalRequest;

  // Halfway through, user clarifies: "Actually make the theme dark slate instead of blue"
  goal.clarifyObjective('Build a landing page for my company in dark slate', ['theme: dark slate'], 'User requested dark slate');

  // Verify original request remains permanently immutable for audit
  assert.strictEqual(goal.originalRequest, originalFrozen);
  assert.strictEqual(goal.confirmedObjective, 'Build a landing page for my company in dark slate');
  assert.ok(goal.expectedDeliverables.includes('theme: dark slate'));
  assert.strictEqual(goal.executionHistory.some((h) => h.action === 'CLARIFICATION'), true);
});

test('Test D — Specialist Coding Agent Delegation', async (t) => {
  const codingOrch = getCodingAgentOrchestrator();
  const testWorkspace = `test_workspace_${Date.now()}`;

  const mission = await codingOrch.executeCodingMission({
    taskId: 'test_task_coding_1',
    userRequest: 'Create a complete website for my company',
    workspaceRelPath: testWorkspace,
  });

  assert.strictEqual(mission.status, 'VERIFIED');
  assert.ok(mission.artifacts.length >= 3);
  assert.ok(mission.artifacts.some((a) => a.endsWith('index.html')));
  assert.ok(mission.artifacts.some((a) => a.endsWith('styles.css')));
  assert.ok(mission.artifacts.some((a) => a.endsWith('app.js')));
});

test('Test E — Free-First & Capability Discovery', async (t) => {
  const registry = getCapabilityRegistry();
  registry.setRoutingPreference(RoutingPreference.PREFER_FREE);

  // Check coding role routing under prefer_free
  const decision = registry.resolveBestCapability({
    task: 'Write a high-performance parser',
    requiredRole: ModelRole.CODING,
  });

  assert.ok(decision.target.isFree, 'Selected capability must be free under prefer_free');
  assert.ok(decision.target.isLocal, 'Selected capability should be local under prefer_free');

  // Test Research Discovery Engine
  const research = getResearchDiscoveryEngine();
  const findings = await research.researchCapability('How to transcode video with ffmpeg');
  assert.ok(findings.recommendedSolution);
  assert.ok(findings.steps.length > 0);
  assert.ok(findings.citations.length > 0);
});

test('Test F & H — Memory Across Sessions, Fact Persistence & Contradiction Resolution', async (t) => {
  const tempDb = MemoryDatabase.forUser('test_user_memory', { inMemory: true });
  const pipeline = new MemoryPipeline('test_user_memory', { db: tempDb });

  // Store preference in Session 1
  tempDb.storeFact('User prefers dark mode in all editors', {
    namespace: 'preferences',
    entityName: 'editor_theme',
    confidence: 1.0,
  });

  // Query in simulated Session 2
  const retrieved1 = pipeline.retrieveContext('What theme do I prefer?');
  assert.ok(retrieved1.contextText.includes('dark mode'));

  // Test H: Correct preference in Session 2 -> should update existing fact, not duplicate conflicting facts
  tempDb.storeFact('User prefers light mode high contrast in all editors', {
    namespace: 'preferences',
    entityName: 'editor_theme',
    confidence: 1.0,
  });

  const allThemes = tempDb.querySemanticFacts('preferences', 'editor', 10);
  assert.strictEqual(allThemes.length, 1, 'Contradictory fact should be resolved into a single updated record');
  assert.ok(allThemes[0].fact.includes('light mode high contrast'));
});

test('Test G — Memory Scope Filtering (Zero Irrelevant Context Injection)', async (t) => {
  const tempDb = MemoryDatabase.forUser('test_user_scope', { inMemory: true });
  const pipeline = new MemoryPipeline('test_user_scope', { db: tempDb });

  // Populate diverse memories across different scopes
  tempDb.storeFact('Project website uses Tailwind CSS and Vite', { namespace: 'coding' });
  tempDb.storeFact('Family dog name is Buster and eats kibble at 7am', { namespace: 'personal_life' });
  tempDb.storeFact('Living room camera detected a delivery package', { namespace: 'camera_observations' });

  // Query a coding task
  const codingResult = pipeline.retrieveContext('Fix the login bug in my website');

  assert.strictEqual(codingResult.scopeCategory, ScopeCategory.CODING_PROJECT);
  assert.ok(codingResult.contextText.includes('Tailwind CSS'));
  assert.strictEqual(codingResult.contextText.includes('Buster'), false, 'Personal dog memory must NOT leak into coding context');
  assert.strictEqual(codingResult.contextText.includes('delivery package'), false, 'Camera memory must NOT leak into coding context');
});

test('Test I & J — Context Budget Packing & Token Efficiency', async (t) => {
  const budget = getContextBudgetManager({ totalBudget: 1024 });

  const largeText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100);
  const packed = budget.packPrompt({
    systemPrompt: 'You are MAVE.',
    userRequest: 'Summarize this file.',
    taskState: 'Active task #1',
    scopedMemory: largeText,
    conversationTurns: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ],
  });

  assert.ok(packed.tokenUsage.isWithinBudget, 'Packed prompt must strictly satisfy token budget constraint');
  assert.ok(packed.fittedMemory.includes('truncated to fit context budget'));
});

test('Test K & L — Hands-Free Voice Pipeline & Real Barge-In Interruption', async (t) => {
  const voice = getHandsFreeVoicePipeline();
  voice.setHandsFree(true);

  let stateChanges = [];
  voice.on('state-change', (e) => stateChanges.push(e.newState));

  // 1. Assistant begins speaking
  voice.speak('I am currently analyzing your codebase and preparing a refactoring plan.');
  assert.strictEqual(voice.state, 'speaking');

  // 2. User interrupts by speaking (energyDb > threshold)
  const result = voice.processAudioChunk(Buffer.alloc(100), -20); // loud speech (-20 dB > -32 dB threshold)

  assert.strictEqual(result.interrupted, true);
  assert.strictEqual(result.action, 'barge_in');
  assert.strictEqual(voice.state, 'listening', 'State must immediately transition to listening for user follow-up');
});

test('Test M — Task Interruption via Voice or Chat (Status without Drift)', async (t) => {
  const orchestrator = getCognitiveOrchestrator({ userId: 'test_interruption_user' });

  // Start an active goal contract
  orchestrator.activeTask = new GoalContract({
    originalRequest: 'Implement authentication backend',
    confirmedObjective: 'Implement authentication backend with JWT',
    status: TaskStatus.ACTIVE,
    currentPhase: 'writing_auth_routes',
  });

  // User interrupts with a status inquiry: "How is it going?"
  const statusReply = await orchestrator.handleUserInteraction("How's it going?");

  assert.strictEqual(statusReply.status, 'active_status_reported');
  assert.ok(statusReply.text.includes('Implement authentication backend with JWT'));
  assert.ok(statusReply.text.includes('writing_auth_routes'));
  assert.strictEqual(orchestrator.activeTask.status, TaskStatus.ACTIVE, 'Task must remain active');
});

test('Test N & O — Screen and Camera Awareness Services', async (t) => {
  // Screen Awareness
  const screen = getScreenAwarenessService();
  screen.setEnabled(true);
  screen.addExcludedApp('1password');

  // Excluded app check
  const privateCheck = await screen.captureContext({ windowTitle: '1Password Vault - Logins' });
  assert.strictEqual(privateCheck.allowed, false);
  assert.strictEqual(privateCheck.privacyBlocked, true);

  // Allowed app check
  const allowedCheck = await screen.captureContext({ windowTitle: 'Visual Studio Code - server.js' });
  assert.strictEqual(allowedCheck.allowed, true);
  assert.ok(allowedCheck.observation.summary.includes('Visual Studio Code'));

  // Camera Awareness
  const camera = getCameraAwarenessService();
  camera.setEnabled(true);
  const camObs = await camera.processFrame(null, { simulatedDescription: 'A coffee mug next to a laptop' });
  assert.strictEqual(camObs.allowed, true);
  assert.strictEqual(camObs.observation.description, 'A coffee mug next to a laptop');
});

test('Test P — Person Directory Scope (Authorized Only, No Guessing Strangers)', async (t) => {
  const db = MemoryDatabase.forUser('test_user_biometric', { inMemory: true });
  db.enrollAuthorizedPerson({
    name: 'Alice Cooper',
    relationship: 'Colleague',
    biometricEnabled: true,
    authorizedScope: 'workplace',
  });

  const camera = getCameraAwarenessService();
  camera.setEnabled(true);
  camera.setMemoryDb(db);

  // Authorized person match
  const matchRes = await camera.processFrame(null, { requestedAction: 'identify_person', query: 'Alice' });
  assert.strictEqual(matchRes.identified, true);
  assert.strictEqual(matchRes.person.name, 'Alice Cooper');

  // Unknown stranger check -> MUST NOT GUESS or invent traits
  const strangerRes = await camera.processFrame(null, { requestedAction: 'identify_person', query: 'Random Person' });
  assert.strictEqual(strangerRes.identified, false);
  assert.strictEqual(strangerRes.evidence, 'UNENROLLED_UNKNOWN_INDIVIDUAL');
  assert.ok(strangerRes.message.includes('No enrolled consenting individual'));
});

test('Test Q — Skill Learning and Procedural Execution', async (t) => {
  const db = MemoryDatabase.forUser('test_skill_user', { inMemory: true });

  const skillId = db.storeProcedure({
    name: 'export_csv_report',
    description: 'Transform JSON metrics to formatted CSV',
    steps: ['Parse JSON input', 'Extract headers', 'Format comma-separated rows', 'Save to disk'],
    toolsNeeded: ['write_file'],
  });

  const recalled = db.getProcedure('export_csv_report');
  assert.ok(recalled);
  assert.strictEqual(recalled.name, 'export_csv_report');
  assert.strictEqual(recalled.steps.length, 4);
});

test('Test R — Remote Model & Mesh Routing', async (t) => {
  const registry = getCapabilityRegistry();
  registry.registerMeshWorker({
    id: 'mesh_worker_desktop_rtx',
    label: 'Authorized Mesh GPU Node (RTX 5090)',
    roles: [ModelRole.COMPLEX_REASONING, ModelRole.CODING],
    isLocal: false,
    isFree: true,
    installed: true,
  });

  const decision = registry.resolveBestCapability({
    task: 'Solve high-dimensional tensor optimization on secondary GPU rig',
    requiredRole: ModelRole.COMPLEX_REASONING,
  });

  assert.ok(decision.target);
  assert.ok(decision.resolvedTier <= CapabilityTier.AUTHORIZED_PAID_API);
});

test('Test S — Multi-Tenant Privacy Isolation', async (t) => {
  const dbUserA = MemoryDatabase.forUser('user_alice_secret', { inMemory: true });
  const dbUserB = MemoryDatabase.forUser('user_bob_secret', { inMemory: true });

  dbUserA.storeFact('Alice private bank account number is 987654321', { namespace: 'finance' });
  dbUserB.storeFact('Bob private medical record is blood type O+', { namespace: 'health' });

  const aliceFactsForBob = dbUserB.querySemanticFacts('finance', 'bank', 10);
  assert.strictEqual(aliceFactsForBob.length, 0, 'User Bob must NEVER see Alice private financial facts');

  const bobFactsForAlice = dbUserA.querySemanticFacts('health', 'blood', 10);
  assert.strictEqual(bobFactsForAlice.length, 0, 'User Alice must NEVER see Bob private medical facts');
});

test('Test T — End-to-End Cognitive Loop Execution in Orchestrator', async (t) => {
  const orchestrator = getCognitiveOrchestrator({ userId: 'e2e_test_user', fresh: true });

  const result = await orchestrator.handleUserInteraction('Create a complete website for my company');

  assert.strictEqual(result.status, 'done');
  assert.strictEqual(result.verificationStatus, 'VERIFIED');
  assert.ok(result.artifacts.length >= 3);
  assert.ok(result.text.includes('website project'));
  assert.ok(result.text.includes('Deliverables verified'));
});
