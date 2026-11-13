'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  OnboardingWizard,
  ONBOARDING_STEPS,
  RESOURCE_SAVING_OPTIONS,
} = require('../src/renderer/onboarding_wizard');
const { Settings } = require('../src/main/settings');
const { SkillLifecycleManager } = require('../src/main/evolution/skill_lifecycle');
const { systemPrompt } = require('../src/main/prompt');
const { classifyComplexity } = require('../src/main/local/router');

test('Onboarding asks user what to save more (storage, network, compute, electricity) with clear explanation', () => {
  assert.ok(Array.isArray(RESOURCE_SAVING_OPTIONS), 'RESOURCE_SAVING_OPTIONS must be exported');
  assert.equal(RESOURCE_SAVING_OPTIONS.length, 4, 'Must have 4 saving options: storage, network, compute, electricity');

  const ids = RESOURCE_SAVING_OPTIONS.map((o) => o.id);
  assert.deepEqual(ids, ['storage', 'network', 'compute', 'electricity'], 'Option IDs must match all 4 resource dimensions');

  const storageOpt = RESOURCE_SAVING_OPTIONS.find((o) => o.id === 'storage');
  assert.ok(storageOpt, 'Storage option must exist');
  assert.ok(
    storageOpt.desc.includes('download skills and packages according to the need') &&
    storageOpt.desc.includes('uninstall or remove them when they are of no use'),
    'Storage option must tell user MAVE downloads skills/packages on demand and uninstalls/removes them when not in use'
  );

  const networkOpt = RESOURCE_SAVING_OPTIONS.find((o) => o.id === 'network');
  assert.ok(networkOpt, 'Network option must exist');
  assert.ok(networkOpt.desc.includes('Pre-caches') && networkOpt.desc.includes('offline'), 'Network option explains local caching and offline availability');

  const computeOpt = RESOURCE_SAVING_OPTIONS.find((o) => o.id === 'compute');
  assert.ok(computeOpt, 'Compute option must exist');
  assert.ok(computeOpt.desc.includes('headroom') && computeOpt.desc.includes('lightweight'), 'Compute option explains CPU/GPU headroom and light models');

  const electricityOpt = RESOURCE_SAVING_OPTIONS.find((o) => o.id === 'electricity');
  assert.ok(electricityOpt, 'Electricity option must exist');
  assert.ok(electricityOpt.desc.includes('battery') && electricityOpt.desc.includes('idle'), 'Electricity option explains eco mode and battery saving');
});

test('OnboardingWizard renders saving goal cards and detail explanation inside personalize step', () => {
  const wizard = new OnboardingWizard(null, { api: { invoke: async () => ({}) } });
  wizard.stepId = 'personalize';
  wizard.state.resourceSavingGoal = 'storage';

  const html = wizard._renderBody();
  assert.ok(html.includes('What do you want to save more?'), 'Personalize step asks user what to save more');
  assert.ok(html.includes('data-save-goal="storage"'), 'Has button for storage');
  assert.ok(html.includes('data-save-goal="network"'), 'Has button for network');
  assert.ok(html.includes('data-save-goal="compute"'), 'Has button for compute');
  assert.ok(html.includes('data-save-goal="electricity"'), 'Has button for electricity');
  assert.ok(html.includes('uninstall or remove them when they are of no use'), 'Renders storage policy explanation');

  // Test dynamic switch to network
  wizard.state.resourceSavingGoal = 'network';
  const htmlNet = wizard._renderBody();
  assert.ok(htmlNet.includes('Pre-caches your selected AI models'), 'Renders network policy explanation');
});

test('Settings updates resourceSavingGoal and automatically sets matching flags', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-settings-resource-test-'));
  const settingsFile = path.join(tmpDir, 'settings.json');
  const settings = new Settings({ filePath: settingsFile });

  // 1. Storage mode
  settings.update({ resourceSavingGoal: 'storage' });
  assert.equal(settings.get('resourceSavingGoal'), 'storage');
  assert.equal(settings.get('onDemandAssets'), true);
  assert.equal(settings.get('autoPruneUnused'), true);
  assert.equal(settings.get('precacheAssets'), false);
  assert.equal(settings.get('lowComputeMode'), false);
  assert.equal(settings.get('ecoMode'), false);

  // 2. Network mode
  settings.update({ resourceSavingGoal: 'network' });
  assert.equal(settings.get('resourceSavingGoal'), 'network');
  assert.equal(settings.get('onDemandAssets'), false);
  assert.equal(settings.get('autoPruneUnused'), false);
  assert.equal(settings.get('precacheAssets'), true);

  // 3. Compute mode
  settings.update({ resourceSavingGoal: 'compute' });
  assert.equal(settings.get('resourceSavingGoal'), 'compute');
  assert.equal(settings.get('lowComputeMode'), true);

  // 4. Electricity mode
  settings.update({ resourceSavingGoal: 'electricity' });
  assert.equal(settings.get('resourceSavingGoal'), 'electricity');
  assert.equal(settings.get('ecoMode'), true);

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('SkillLifecycleManager acquires on-demand and auto-prunes unused skills under storage policy', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-skill-lifecycle-test-'));
  const lifecycle = new SkillLifecycleManager({
    policy: 'storage',
    cacheDir: tmpDir,
  });

  // Acquire skill
  const acq = await lifecycle.acquireSkill('video-editor', { name: 'Video Editor Suite', sizeBytes: 5000000 });
  assert.equal(acq.ok, true);
  assert.equal(acq.downloadedOnDemand, true);
  assert.equal(acq.leases, 1);
  assert.equal(lifecycle.installedPackages.has('video-editor'), true);
  assert.ok(fs.existsSync(path.join(tmpDir, 'video-editor.pkg')));

  // Release skill -> because policy is 'storage', it auto-prunes
  const rel = await lifecycle.releaseSkill('video-editor');
  assert.equal(rel.ok, true);
  assert.equal(rel.pruned, true);
  assert.ok(rel.message.includes('Uninstalled unused skill'));
  assert.equal(lifecycle.installedPackages.has('video-editor'), false);
  assert.equal(fs.existsSync(path.join(tmpDir, 'video-editor.pkg')), false, 'Package file deleted from disk');
  assert.ok(lifecycle.totalBytesSaved >= 5000000, 'Reclaimed storage tracked');

  // Under 'network' policy, packages are NOT auto-pruned
  lifecycle.setPolicy('network');
  await lifecycle.acquireSkill('heavy-nlp', { name: 'NLP Tools', sizeBytes: 8000000 });
  const relNet = await lifecycle.releaseSkill('heavy-nlp');
  assert.equal(relNet.pruned, false, 'Package retained on disk under network saving policy');
  assert.equal(lifecycle.installedPackages.has('heavy-nlp'), true, 'Still retained in cache');

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('MAVE Quality-Controlled Setup: Auto-determines optimal tier-matched Core Brain without random user model checkboxes', () => {
  const wizard = new OnboardingWizard(null, { api: { invoke: async () => ({}) } });
  wizard.hwScan = {
    hardware: { gpu: 'NVIDIA GeForce RTX 5060', dedicated: true, vramGB: 8, ramGB: 48, freeDiskGB: 40, cpu: 'AMD Ryzen 5 3600 · 12 threads' },
    pick: 'phi-4-mini',
    options: [
      { id: 'phi-4-mini', label: 'Phi-4-mini 3.8B Sovereign Brain', available: true, recommended: true, memoryGB: 4.2, bytes: 2.49 * (1024 ** 3), tokensPerSecMin: 65, tokensPerSecMax: 90 },
      { id: 'qwen3-vl-8b', label: 'Qwen3-VL 8B Sovereign Brain', available: true, recommended: false, memoryGB: 7.2, bytes: 5.4 * (1024 ** 3), tokensPerSecMin: 32, tokensPerSecMax: 50 },
    ],
  };
  wizard.stepId = 'device_models';

  const html = wizard._renderBody();
  assert.ok(html.includes('Your MAVE Intelligence Setup'), 'Header emphasizes MAVE Intelligence Setup');
  assert.ok(html.includes('Certified Core Local Brain'), 'Shows Certified Core Local Brain');
  assert.ok(html.includes('Core Sovereign Brain ✓'), 'Displays Core Sovereign Brain badge');
  assert.ok(html.includes('Master Orchestrator &amp; Specialist AI Network'), 'Displays Master Orchestrator and Specialist AI Network');
  assert.ok(html.includes('Phi-4-mini 3.8B Brain'), 'Displays Phi-4-mini 3.8B Brain description');
  assert.ok(html.includes('Specialist Coding Engine'), 'Displays Specialist Coding Engine (Qwen-Coder / Gemini / Claude)');
  assert.ok(html.includes('Specialist Reasoning &amp; Logic'), 'Displays Specialist Reasoning Engine (DeepSeek-R1 / o1)');
  assert.ok(html.includes('Specialist Deep Research Engine'), 'Displays Specialist Deep Research Engine (ChatGPT / Perplexity)');
  assert.ok(html.includes('Specialist Document &amp; Vision Engine'), 'Displays Specialist Document & Vision Engine (Qwen 2.5-VL)');
  assert.equal(html.includes('data-model-toggle="phi-4-mini"'), false, 'Does not present arbitrary checkbox options to change local brain');
  assert.equal(html.includes('Search MAVE Certified Compatible LLMs'), false, 'Removes online Hugging Face search input from onboarding');
});

test('MAVE Cognitive Architecture: System prompt and router reflect 25-year-old conductor delegating coding to Gemini and research to ChatGPT', () => {
  const promptText = systemPrompt('Mave');
  assert.ok(promptText.includes('mentality, sharp intellect, street-smarts, and emotional maturity of a capable 25-year-old guy'), 'Prompt reflects 25-year-old mature mentality');
  assert.ok(promptText.includes('master organizer: you organize, categorize, fill, and store information efficiently, perfectly, and with uncompromising quality and quantity'), 'Prompt reflects master organizer principle');
  assert.ok(promptText.includes('Executive Master Conductor driven by your sovereign on-device brain (Phi-4-mini)'), 'Prompt reflects Executive Conductor paradigm with Phi-4-mini');
  assert.ok(promptText.includes('Qwen 2.5-Coder') && promptText.includes('DeepSeek-R1'), 'Prompt mentions specialist delegation engines');

  // Router delegation checks
  const codingTask = classifyComplexity('Write a Python FastAPI service with JWT authentication and PostgreSQL async queries');
  assert.ok(codingTask.specialistDelegation, 'Coding task has specialist delegation');
  assert.equal(codingTask.specialistDelegation.role, 'Specialist Coding Engine');
  assert.ok(codingTask.specialistDelegation.engine.includes('Qwen 2.5-Coder') || codingTask.specialistDelegation.engine.includes('Gemini'));

  const mathTask = classifyComplexity('Derive the formal mathematical proof for this algorithm complexity and equation theorem');
  assert.ok(mathTask.specialistDelegation, 'Math task has specialist delegation');
  assert.equal(mathTask.specialistDelegation.role, 'Specialist Reasoning Engine');
  assert.ok(mathTask.specialistDelegation.engine.includes('DeepSeek-R1-Distill'));

  const researchTask = classifyComplexity('Conduct deep research and synthesize recent breakthroughs in solid-state battery electrolytes with citations');
  assert.ok(researchTask.specialistDelegation, 'Research task has specialist delegation');
  assert.equal(researchTask.specialistDelegation.role, 'Specialist Deep Research Engine');
  assert.ok(researchTask.specialistDelegation.engine.includes('ChatGPT'));

  const everydayTask = classifyComplexity('What is on my desktop screen right now? Close Spotify and open my notes');
  assert.ok(everydayTask.specialistDelegation, 'Everyday task has delegation');
  assert.equal(everydayTask.specialistDelegation.role, 'Local Executive & OS Conductor');
  assert.ok(everydayTask.specialistDelegation.engine.includes('Phi-4-mini'));
});
