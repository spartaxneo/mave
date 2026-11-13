'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { RealVMDriver } = require('../src/main/virtual_computer/real_vm_driver');
const { getVirtualComputerSession, ExecutionTargetRouter } = require('../src/main/virtual_computer');
const { FullDuplexVoiceCoordinator } = require('../src/main/voice_full_duplex');
const { ResearchEngine } = require('../src/main/autonomous/research_engine');
const { ChatArtifactsRenderer } = require('../src/renderer/chat_artifacts');
const { OnboardingWizard, ONBOARDING_STEPS, FEATURE_FOOTPRINTS } = require('../src/renderer/onboarding_wizard');

test('MAVE Comprehensive Acceptance Suite: Real VM Driver & Isolation Proof', async () => {
  const driver = new RealVMDriver();
  const detection = await driver.detectHypervisor();

  assert.ok(detection, 'Hypervisor detection object must exist');
  assert.equal(typeof detection.hypervAvailable, 'boolean');
  assert.equal(typeof detection.wsl2Available, 'boolean');
  assert.ok(['hyperv', 'wsl2', 'wsl_linux_guest', 'native_isolated'].includes(detection.recommendedBackend));

  // Verify real guest command execution
  if (detection.recommendedBackend === 'wsl_linux_guest') {
    const cmdResult = await driver.executeGuestCommand('uname -a');
    assert.equal(cmdResult.ok, true, 'Command inside real Linux guest must succeed');
    assert.ok(cmdResult.stdout.includes('Linux'), 'Must output real Linux kernel identity');

    const screenshotResult = await driver.captureGuestScreenshot();
    assert.equal(screenshotResult.ok, true, 'Guest screenshot capture must succeed');
  }

  // Verify guest path isolation & traversal blocking
  const isolationCheck = await driver.verifyGuestIsolation();
  assert.equal(isolationCheck.isolated, true, 'Guest environment must be isolated');
  assert.ok(isolationCheck.guestRoot, 'Guest root path must exist');
  assert.ok(fs.existsSync(isolationCheck.guestRoot), 'Guest root directory must exist on disk');

  // Verify path containment
  assert.equal(driver.isPathContained('workspace/notes.txt'), true);
  assert.equal(driver.isPathContained('../../Windows/System32/cmd.exe'), false);
  assert.equal(driver.isPathContained('C:\\Windows\\System32'), false);
});

test('MAVE Comprehensive Acceptance Suite: Real-time Voice Interruption (<50ms)', async () => {
  const voice = new FullDuplexVoiceCoordinator({ interruptionWindowMs: 50 });
  const statesObserved = [];

  voice.on('state-change', ({ newState }) => {
    statesObserved.push(newState);
  });

  // 1. Initial State
  assert.equal(voice.getState(), 'idle');

  // 2. Start Assistant Speaking
  voice.startAssistantSpeaking('Hello, I am MAVE. I can help you research topics.');
  assert.equal(voice.getState(), 'speaking');

  // 3. User Interrupts with Voice Activity
  const startTime = process.hrtime.bigint();
  const interruptResult = voice.handleUserVoiceActivity(true, 0.85);
  const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;

  assert.equal(interruptResult.interrupted, true, 'Speaking must be interrupted');
  assert.ok(statesObserved.includes('interrupted'), 'Must transition through interrupted state');
  assert.equal(voice.getState(), 'listening', 'Must immediately transition to listening for user follow-up');
  assert.ok(elapsedMs < 50.0, `Interruption latency must be under 50ms (measured: ${elapsedMs.toFixed(3)}ms)`);

  // 4. Acknowledges interruption and maintains listening state
  voice.acknowledgeInterruption();
  assert.equal(voice.getState(), 'listening');
});

test('MAVE Comprehensive Acceptance Suite: Deep Research Engine & Verified Citations', async () => {
  const tmpGuest = path.join(os.tmpdir(), `mave_acceptance_research_${Date.now()}`);
  fs.mkdirSync(path.join(tmpGuest, 'guest_fs', 'workspace', 'artifacts'), { recursive: true });

  const session = getVirtualComputerSession();
  const research = new ResearchEngine({
    session,
    userDataPath: tmpGuest,
  });

  let artifactEmitted = null;
  research.on('artifact-created', (art) => {
    artifactEmitted = art;
  });

  const res = await research.conductResearch('WebAssembly SIMD Performance');

  assert.ok(res.ok, 'Research result must be ok');
  assert.ok(res.report.includes('MAVE Deep Research Report'), 'Report must have official header');
  assert.ok(res.citations.length >= 2, 'Must have at least 2 verified source citations');
  assert.ok(artifactEmitted, 'artifact-created event must be emitted');
  assert.ok(fs.existsSync(artifactEmitted.fullPath), 'Report file must exist on disk');

  // Clean up
  try { fs.rmSync(tmpGuest, { recursive: true, force: true }); } catch {}
});

test('MAVE Comprehensive Acceptance Suite: Chat Artifact Cards & Interactive Export', () => {
  const renderer = new ChatArtifactsRenderer();

  const artifact = {
    type: 'document',
    fileName: 'market_analysis_2026.md',
    guestPath: 'workspace/artifacts/market_analysis_2026.md',
    sizeBytes: 8192,
    title: 'Q3 Financial Analysis',
  };

  const html = renderer.renderCard(artifact);

  assert.ok(html.includes('mave-artifact-card'), 'Must render card container');
  assert.ok(html.includes('Q3 Financial Analysis'), 'Must display artifact title');
  assert.ok(html.includes('8 KB'), 'Must display formatted file size');
  assert.ok(html.includes('data-action="export-artifact"'), 'Must have Save to Host button');
  assert.ok(html.includes('data-action="view-virtual-pc"'), 'Must have View button');
  assert.ok(html.includes('Virtual PC'), 'Must have Virtual PC isolation badge');
});

test('MAVE Comprehensive Acceptance Suite: Minimalist Onboarding Steps, Gmail Auth & Step 3 Host/Companion Choice', () => {
  assert.equal(ONBOARDING_STEPS.length, 10, 'Minimalist onboarding defines all core, auth, role, host connect, model/features, personalize, voice, and setup states');

  const stepIds = ONBOARDING_STEPS.map(s => s.id);
  const expectedSteps = [
    'intro_think',
    'intro_private',
    'intro_keep',
    'account',
    'device_role',
    'connect_host',
    'device_models',
    'personalize',
    'voice',
    'installing',
  ];

  assert.deepEqual(stepIds, expectedSteps, 'Step IDs must match minimalist Ponder-style onboarding flow with Step 3 Host/Companion choice');

  const wizSrc = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/onboarding_wizard.js'), 'utf8');
  assert.equal(wizSrc.includes('signInAnonymously'), false, 'Onboarding must not allow anonymous/ghost login');
  assert.ok(wizSrc.includes("firebase:google-oauth") && wizSrc.includes('@gmail'), 'Onboarding requires Gmail/Google login');
  assert.ok(wizSrc.includes("local:hardware") && wizSrc.includes("local:start"), 'Main Computer setup scans hardware and installs selected local model');
  assert.ok(wizSrc.includes('selectedModels') && wizSrc.includes('autoModelRouting') && wizSrc.includes('tok/s'), 'Onboarding supports multi-model selection, task-based auto-switching, GPU VRAM, and tok/s estimates');
  assert.ok(wizSrc.includes('local:search-compatible') && wizSrc.includes('onb-router-info-card'), 'Onboarding supports curated compatible LLM search and always-on informative smart router card');
  assert.equal(wizSrc.includes('data-setting-toggle="autoModelRouting"'), false, 'Smart Router must not have a disable toggle switch');
  assert.equal(wizSrc.includes('case \'device_skills\':'), false, 'Step 3 skills/knowledge screen must be removed per user request');
  assert.equal(wizSrc.includes('local:pick-file'), false, 'Onboarding must not allow arbitrary external LLM uploads');

  const catalog = require('../src/main/local/catalog');
  const { FEATURE_FOOTPRINTS } = require('../src/renderer/onboarding_wizard');
  assert.equal(Object.keys(FEATURE_FOOTPRINTS).length, 6, 'Onboarding surfaces all 6 MAVE NAS, Multi-OS, Multi-Agent, and Remote platform packs');
  assert.ok(FEATURE_FOOTPRINTS.personalNas && FEATURE_FOOTPRINTS.multiOsHost && FEATURE_FOOTPRINTS.multiAgentDeploy && FEATURE_FOOTPRINTS.remoteAnywhere, 'Platform packs cover NAS, Multi-OS, Multi-Agent & Remote Anywhere');
  assert.equal(typeof catalog.searchCompatibleModels, 'function', 'Catalog exposes curated searchCompatibleModels');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs/COMPATIBLE_LOCAL_LLMS.md')), 'Curated Compatible LLMs documentation exists');
  const certifiedHits = catalog.searchCompatibleModels('coder', { dedicated: true, gpu: 'NVIDIA GeForce RTX 5060', vramGB: 8, ramGB: 48, freeDiskGB: 40 });
  assert.ok(certifiedHits.some((m) => m.id === 'qwen25-coder-7b' && m.downloadLink.includes('https://huggingface.co/') && m.gpuFit === 'gpu_full'), 'Curated search returns verified models with download links and GPU fit');
  const recGpu = catalog.recommend({ dedicated: true, gpu: 'NVIDIA GeForce RTX 5060', vramGB: 8, ramGB: 48, freeDiskGB: 40 });
  const opt8b = recGpu.options.find((o) => o.id === 'qwen3-vl-8b');
  assert.equal(opt8b.gpuFit, 'gpu_full');
  assert.ok(opt8b.tokensPerSecMin > 0 && opt8b.tokensPerMinMax > 0, 'Catalog computes realistic token throughput estimates');
  assert.ok(typeof opt8b.capabilities === 'string' && opt8b.capabilities.length > 10, 'Catalog explains what user can do with each model');
});

test('OnboardingWizard skips login and lands directly on setup screen when user is already signed in', async () => {
  const signedInApi = {
    invoke: async (ch) => {
      if (ch === 'settings:get') return { onboarded: false, deviceRole: 'host' };
      if (ch === 'firebase:get-user') return { uid: 'u-gmail-1', email: 'owner@gmail.com', displayName: 'Owner', isAnonymous: false };
      return null;
    },
  };
  const wizSignedIn = new OnboardingWizard(null, { api: signedInApi });
  await wizSignedIn.init();
  assert.ok(wizSignedIn.stepId === 'calibrating' || wizSignedIn.stepId === 'device_role', 'Signed-in user who has not finished setup must land straight on calibrating / setup screen');
  wizSignedIn._go('account');
  assert.ok(wizSignedIn.stepId === 'calibrating' || wizSignedIn.stepId === 'device_role', 'Navigating to account while already signed in must stay/redirect to setup screen');
  wizSignedIn._go('intro_think');
  assert.ok(wizSignedIn.stepId === 'calibrating' || wizSignedIn.stepId === 'device_role', 'Navigating to intro while already signed in must redirect to setup screen');

  // Session restored from settings.authUser even if firebase:get-user is slow/null
  const settingsFallbackApi = {
    invoke: async (ch) => {
      if (ch === 'settings:get') return {
        onboarded: false,
        deviceRole: 'host',
        authUser: { uid: 'u-persisted-1', email: 'persisted@gmail.com', displayName: 'Persisted User', isAnonymous: false },
      };
      if (ch === 'firebase:get-user') return null;
      return null;
    },
  };
  const wizSettingsFallback = new OnboardingWizard(null, { api: settingsFallbackApi });
  await wizSettingsFallback.init();
  assert.ok(wizSettingsFallback.stepId === 'calibrating' || wizSettingsFallback.stepId === 'device_role', 'Must land on calibrating/setup screen when authUser is mirrored in settings');
  assert.equal(wizSettingsFallback.state.email, 'persisted@gmail.com');

  const signedOutApi = {
    invoke: async (ch) => {
      if (ch === 'settings:get') return { onboarded: false };
      if (ch === 'firebase:get-user') return { uid: 'anon-1', isAnonymous: true };
      return null;
    },
  };
  const wizSignedOut = new OnboardingWizard(null, { api: signedOutApi });
  await wizSignedOut.init();
  assert.equal(wizSignedOut.stepId, 'intro_think', 'Unauthenticated or anonymous session must start at intro/Gmail sign-in flow');
});

test('catalog.searchOnlineModels & registerOnlineModel resolve Hugging Face GGUF weights and compute download files', async () => {
  const catalog = require('../src/main/local/catalog');
  const mockFetch = async (url) => {
    if (url.includes('/api/models?search=')) {
      return {
        ok: true,
        json: async () => [
          { id: 'bartowski/Llama-3.2-3B-Instruct-GGUF', downloads: 95000, likes: 420, tags: ['gguf', 'text-generation'] },
        ],
      };
    }
    if (url.includes('/tree/main')) {
      return {
        ok: true,
        json: async () => [
          { type: 'file', path: 'mmproj-ignore.gguf', size: 100 * 1024 * 1024 },
          { type: 'file', path: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', size: 2019328000, lfs: { oid: 'deadbeef'.repeat(8) } },
          { type: 'file', path: 'Llama-3.2-3B-Instruct-Q8_0.gguf', size: 3420000000, lfs: { oid: 'cafebabe'.repeat(8) } },
        ],
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const res = await catalog.searchOnlineModels('llama 3.2', { dedicated: true, gpu: 'NVIDIA GeForce RTX 5060', vramGB: 8, ramGB: 48, freeDiskGB: 25 }, mockFetch);
  assert.equal(res.ok, true);
  assert.equal(res.results.length, 1);
  const hit = res.results[0];
  assert.equal(hit.fileName, 'Llama-3.2-3B-Instruct-Q4_K_M.gguf');
  assert.equal(hit.gpuFit, 'gpu_full');
  assert.ok(hit.tokensPerSecMin >= 55 && hit.available === true);

  const saved = catalog.registerOnlineModel(hit);
  try {
    const files = catalog.filesFor(saved.id, 'x64');
    assert.equal(files.length, 2, 'Registered online GGUF includes runtime + remote GGUF file');
    assert.equal(files[1].name, 'Llama-3.2-3B-Instruct-Q4_K_M.gguf');
    assert.ok(catalog.downloadBytes(saved.id, 'x64') > 2000000000);
  } finally {
    catalog.removeCustomModel(saved.id);
  }
});

test('catalog evaluates device capacity with vs without AirLLM and blocks unrunnable/uninstallable models', () => {
  const catalog = require('../src/main/local/catalog');
  // 8 GB RTX 5060, 48 GB RAM, 25 GB free disk:
  // - Qwen3 32B AirLLM needs 3.5 GB VRAM + 20 GB disk => blocked WITHOUT AirLLM, UNLOCKED WITH AirLLM!
  // - Llama 3 70B AirLLM needs 42 GB disk => blocked BOTH with and without AirLLM because 25 GB < 42 GB!
  const hw25 = { dedicated: true, gpu: 'NVIDIA GeForce RTX 5060', vramGB: 8, ramGB: 48, freeDiskGB: 25 };
  const cap = catalog.evaluateDeviceCapacity(hw25);
  assert.ok(cap.withoutAirllm.maxModelSize && cap.withAirllm.maxModelSize);
  assert.ok(cap.withAirllm.modelIds.includes('airllm-Qwen-Qwen3-32B'), '32B AirLLM fits when 25 GB free disk');
  assert.equal(cap.withoutAirllm.modelIds.includes('airllm-Qwen-Qwen3-32B'), false, '32B AirLLM does not fit without AirLLM on 8GB GPU rule');
  assert.equal(cap.withAirllm.modelIds.includes('airllm-meta-llama-Meta-Llama-3-70B-Instruct'), false, '70B must be blocked even with AirLLM when only 25 GB free disk');

  const withoutAir = catalog.searchCompatibleModels('32b', hw25, { airllmEnabled: false });
  assert.equal(withoutAir[0].available, false);
  const withAir = catalog.searchCompatibleModels('32b', hw25, { airllmEnabled: true });
  assert.equal(withAir[0].available, true);

  // Onboarding wizard prunes AirLLM-only selection if user turns AirLLM off
  const wiz = new OnboardingWizard(null, {});
  wiz.hwScan = { hardware: hw25, options: [], capacitySummary: cap };
  wiz.compatibleCatalog = withAir;
  wiz.state.airllmEnabled = true;
  wiz.state.selectedModels = ['airllm-Qwen-Qwen3-32B'];
  wiz.state.airllmEnabled = false;
  wiz._pruneUnavailableSelectedModels();
  assert.deepEqual(wiz.state.selectedModels, [], 'Disabling AirLLM must automatically deselect AirLLM-only models');
});
