'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { SwarmPredictionSandbox } = require('../src/main/swarm/swarm_prediction_sandbox');
const { getInstagramSocialBrain } = require('../src/main/social/instagram');
const swarmPredictionPlugin = require('../src/main/plugins/builtin/swarm_prediction_sandbox');
const { validate } = require('../src/main/plugins/registry');

test('SwarmPredictionSandbox: Generates tailored stakeholder populations across domains', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-swarm-'));
  const sandbox = new SwarmPredictionSandbox({ storageDir: tmpDir });

  // 1. Social media domain
  const popSocial = sandbox.generatePopulation({
    topic: 'Announcing open-source AI assistant',
    domain: 'social_media',
    populationSize: 8
  });

  assert.equal(popSocial.length, 8);
  assert.ok(popSocial.some(a => a.archetype === 'Influencer' || a.archetype === 'Champion'));
  assert.ok(popSocial.some(a => a.archetype === 'Skeptic' || a.archetype === 'Critic'));
  assert.ok(popSocial[0].id.startsWith('agent_'));
  assert.ok(Array.isArray(popSocial[0].traits));
  assert.ok(typeof popSocial[0].bias === 'number');

  // 2. Business product domain
  const popBusiness = sandbox.generatePopulation({
    topic: 'Pricing enterprise tier at $499/seat',
    domain: 'business_product',
    populationSize: 6
  });

  assert.equal(popBusiness.length, 6);
  assert.ok(popBusiness.some(a => a.role === 'Enterprise Buyer' || a.role === 'Budget Controller'));

  // 3. Career negotiation domain
  const popCareer = sandbox.generatePopulation({
    topic: 'Counter-offering $185k base + equity',
    domain: 'career_negotiation',
    populationSize: 4
  });

  assert.equal(popCareer.length, 4);
  assert.ok(popCareer.some(a => a.role === 'HR Compensation Director' || a.role === 'Direct Hiring Manager'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SwarmPredictionSandbox: Runs multi-round temporal simulation with consensus metrics', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-sim-'));
  const sandbox = new SwarmPredictionSandbox({ storageDir: tmpDir });

  const sim = await sandbox.runSimulation({
    topic: 'Launching AI Video Generator with 3 free credits then $19/mo',
    description: 'Generates 1080p Sora-quality clips in 30 seconds',
    domain: 'social_media',
    populationSize: 10,
    rounds: 3
  });

  assert.ok(sim.id.startsWith('sim_'));
  assert.equal(sim.topic, 'Launching AI Video Generator with 3 free credits then $19/mo');
  assert.equal(sim.populationSize, 10);
  assert.equal(sim.roundsCount, 3);
  assert.equal(sim.timelineRounds.length, 3);

  // Check metrics
  assert.ok(typeof sim.metrics.consensusScore === 'number');
  assert.ok(typeof sim.metrics.controversyScore === 'number');
  assert.ok(typeof sim.metrics.viralityMultiplier === 'number');
  assert.ok(sim.metrics.viralityMultiplier >= 1.0);

  // Check action logs across rounds
  const round1 = sim.timelineRounds[0];
  assert.equal(round1.roundNumber, 1);
  assert.equal(round1.actions.length, 10);
  assert.ok(round1.actions[0].statement.length > 5);

  const round3 = sim.timelineRounds[2];
  assert.equal(round3.roundNumber, 3);
  assert.equal(round3.actions.length, 10);

  // Check flashpoints and recommendations
  assert.ok(Array.isArray(sim.keyFlashpoints));
  assert.ok(sim.keyFlashpoints.length >= 2);
  assert.ok(Array.isArray(sim.strategicRecommendations));
  assert.ok(sim.strategicRecommendations.length >= 2);

  // Check persistence
  const savedSim = sandbox.getSimulation(sim.id);
  assert.ok(savedSim);
  assert.equal(savedSim.id, sim.id);

  const history = sandbox.listSimulations();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, sim.id);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SwarmPredictionSandbox: Forks "What-If" counterfactual branches and computes comparative deltas', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-whatif-'));
  const sandbox = new SwarmPredictionSandbox({ storageDir: tmpDir });

  // Baseline simulation
  const sim = await sandbox.runSimulation({
    topic: 'Hardware device launch at $299 with mandatory $15/mo cloud subscription',
    domain: 'business_product',
    populationSize: 8,
    rounds: 2
  });

  // What-if branch: waive subscription for early adopters + 60-day money-back guarantee
  const branch = await sandbox.runWhatIfBranch({
    simulationId: sim.id,
    branchName: 'Waive Subscription & 60-Day Guarantee',
    variableModifications: {
      guarantee: true,
      priceDrop: false,
      waiveCloudFee: true
    },
    rounds: 2
  });

  assert.ok(branch.branchId.startsWith('branch_'));
  assert.equal(branch.parentSimulationId, sim.id);
  assert.equal(branch.branchName, 'Waive Subscription & 60-Day Guarantee');
  assert.ok(typeof branch.metrics.consensusScore === 'number');
  assert.ok(typeof branch.metrics.deltaConsensus === 'string');

  // Verify branch is attached to parent simulation
  const parent = sandbox.getSimulation(sim.id);
  assert.equal(parent.branches.length, 1);
  assert.equal(parent.branches[0].branchId, branch.branchId);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('SwarmPredictionSandbox: ReACT Agent Interrogation / Interview returns in-character psychological responses', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-test-interview-'));
  const sandbox = new SwarmPredictionSandbox({ storageDir: tmpDir });

  const sim = await sandbox.runSimulation({
    topic: 'Migrating legacy monolith to Rust microservices',
    domain: 'business_product',
    populationSize: 6,
    rounds: 2
  });

  const targetAgent = sim.population[0];
  const interview = await sandbox.interviewAgent({
    simulationId: sim.id,
    agentId: targetAgent.id,
    question: 'What is your primary concern regarding the migration timeline?'
  });

  assert.equal(interview.agentId, targetAgent.id);
  assert.equal(interview.role, targetAgent.role);
  assert.ok(interview.answer.includes(targetAgent.name));
  assert.ok(interview.answer.includes(targetAgent.role));
  assert.ok(interview.answer.includes('What is your primary concern'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('InstagramSocialBrain: Integrates with SwarmPredictionSandbox to simulate reel audience impact', async () => {
  const brain = getInstagramSocialBrain();

  const prediction = await brain.predictReelAudienceReaction({
    caption: 'Building an autonomous AI desktop companion with local models and Web Audio API',
    audioConcept: 'Upbeat cyberpunk synthwave pacing with high-tempo coding visuals'
  });

  assert.ok(prediction.id.startsWith('sim_'));
  assert.equal(prediction.domain, 'social_media');
  assert.ok(prediction.metrics.consensusScore >= 0);
  assert.ok(prediction.metrics.viralityMultiplier >= 1.0);
  assert.ok(prediction.timelineRounds.length === 3);
});

test('Swarm Prediction Sandbox Plugin: Exports valid schemas and executes all 4 tools', async () => {
  assert.equal(Array.isArray(swarmPredictionPlugin), true);
  assert.equal(swarmPredictionPlugin.length, 4);

  // Validate all tool schemas
  for (const def of swarmPredictionPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Plugin tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = {
    log: () => {},
    confirm: async () => true,
    sleep: async () => {}
  };

  const simTool = swarmPredictionPlugin.find(t => t.name === 'simulate_swarm_future');
  const branchTool = swarmPredictionPlugin.find(t => t.name === 'run_what_if_branch');
  const interviewTool = swarmPredictionPlugin.find(t => t.name === 'interview_simulation_agent');
  const listTool = swarmPredictionPlugin.find(t => t.name === 'list_simulation_history');

  // 1. Run simulate_swarm_future
  const simRes = await simTool.run({
    topic: 'Deploying autonomous desktop agent to production',
    domain: 'social_media',
    population_size: 6,
    rounds: 2
  }, mockCtx);

  assert.ok(simRes.includes('SWARM PREDICTION SANDBOX REPORT'));
  assert.ok(simRes.includes('QUANTITATIVE FORECAST METRICS'));
  assert.ok(simRes.includes('Consensus Agreement'));

  // Extract sim ID from output
  const match = simRes.match(/Simulation ID\**:\s*`?(sim_[a-z0-9_]+)`?/i);
  assert.ok(match, 'Simulation ID must be present in tool output');
  const simId = match[1];

  // 2. Run run_what_if_branch
  const branchRes = await branchTool.run({
    simulation_id: simId,
    branch_name: 'Add Local Zero-Telemetry Privacy Shield',
    modifications_summary: 'Guaranteed 100% on-device private processing with zero cloud data transmission'
  }, mockCtx);

  assert.ok(branchRes.includes('WHAT-IF COUNTERFACTUAL BRANCH EXECUTED'));
  assert.ok(branchRes.includes('New Consensus Score'));

  // 3. Run interview_simulation_agent
  const interviewRes = await interviewTool.run({
    simulation_id: simId,
    agent_id: 'agent_1',
    question: 'How do you feel about the privacy guarantees?'
  }, mockCtx);

  assert.ok(interviewRes.includes('Interview with'));

  // 4. Run list_simulation_history
  const listRes = await listTool.run({}, mockCtx);
  assert.ok(listRes.includes('SWARM SIMULATION ARCHIVE'));
  assert.ok(listRes.includes(simId));
});
