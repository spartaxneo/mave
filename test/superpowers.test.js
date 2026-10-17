'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { validate } = require('../src/main/plugins/registry');

// 1. OS & Hardware Plugin
const osHardware = require('../src/main/plugins/builtin/os_hardware');
test('os_hardware plugin exports valid tools', async () => {
  assert.ok(Array.isArray(osHardware));
  assert.equal(osHardware.length, 5);

  for (const tool of osHardware) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const thermalTool = osHardware.find((t) => t.name === 'manage_hardware_performance');
  const layoutTool = osHardware.find((t) => t.name === 'manage_window_layouts');
  const toastTool = osHardware.find((t) => t.name === 'send_action_center_notification');
  const storageTool = osHardware.find((t) => t.name === 'system_storage_optimizer');
  const repairTool = osHardware.find((t) => t.name === 'repair_system_integrity');

  assert.ok(thermalTool);
  assert.ok(layoutTool);
  assert.ok(toastTool);
  assert.ok(storageTool);
  assert.ok(repairTool);

  const ctx = { confirm: async () => {}, log: () => {} };

  const thermalRes = await thermalTool.run({ action: 'get_thermal_status' }, ctx);
  assert.ok(thermalRes.includes('HARDWARE THERMAL'));

  const hogsRes = await thermalTool.run({ action: 'find_memory_hogs' }, ctx);
  assert.ok(typeof hogsRes === 'string');

  const layoutRes = await layoutTool.run({ preset: 'coding_mode' }, ctx);
  assert.ok(layoutRes.includes('WINDOW LAYOUT PRESET APPLIED'));
});

// 2. Developer Tools Plugin
const devTools = require('../src/main/plugins/builtin/developer_tools');
test('developer_tools plugin exports valid tools', async () => {
  assert.ok(Array.isArray(devTools));
  assert.equal(devTools.length, 5);

  for (const tool of devTools) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const gitTool = devTools.find((t) => t.name === 'audit_git_commit_safety');
  const doctorTool = devTools.find((t) => t.name === 'diagnose_terminal_error');
  const dockerTool = devTools.find((t) => t.name === 'manage_docker_containers');
  const mockTool = devTools.find((t) => t.name === 'spawn_mock_api_server');
  const dotenvTool = devTools.find((t) => t.name === 'sync_dotenv_environments');

  assert.ok(gitTool);
  assert.ok(doctorTool);
  assert.ok(dockerTool);
  assert.ok(mockTool);
  assert.ok(dotenvTool);

  const ctx = { confirm: async () => {}, log: () => {} };

  const doctorRes = await doctorTool.run({
    command_attempted: 'npm start',
    error_output: 'Error: listen EADDRINUSE: address already in use :::3000',
  }, ctx);
  assert.ok(doctorRes.includes('TERMINAL CRASH DOCTOR DIAGNOSIS'));
  assert.ok(doctorRes.includes('Port Collision'));

  const gitRes = await gitTool.run({}, ctx);
  assert.ok(typeof gitRes === 'string');
});

// 3. Vision Perception Plugin
const visionPlugin = require('../src/main/plugins/builtin/vision_perception');
test('vision_perception plugin exports valid tools', async () => {
  assert.ok(Array.isArray(visionPlugin));
  assert.ok(visionPlugin.length >= 4);

  for (const tool of visionPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const ergoTool = visionPlugin.find((t) => t.name === 'audit_ergonomics_posture');
  const paletteTool = visionPlugin.find((t) => t.name === 'extract_screen_color_palette');

  const ctx = { confirm: async () => {}, log: () => {} };

  const ergoRes = await ergoTool.run({}, ctx);
  assert.ok(ergoRes.includes('ERGONOMICS'));

  const paletteRes = await paletteTool.run({ theme_name: 'Dark Accent' }, ctx);
  assert.ok(paletteRes.includes('EXTRACTED DESIGN COLOR PALETTE'));
});

// 4. Security Shield Plugin
const securityPlugin = require('../src/main/plugins/builtin/security_shield');
test('security_shield plugin exports valid tools', async () => {
  assert.ok(Array.isArray(securityPlugin));
  assert.ok(securityPlugin.length >= 6);

  for (const tool of securityPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const sanitizeTool = securityPlugin.find((t) => t.name === 'sanitize_clipboard_secrets');
  const urlTool = securityPlugin.find((t) => t.name === 'inspect_url_safety');
  const hashTool = securityPlugin.find((t) => t.name === 'verify_file_integrity');
  const vaultTool = securityPlugin.find((t) => t.name === 'manage_credential_vault');
  const rollbackTool = securityPlugin.find((t) => t.name === 'filesystem_rollback_action');

  assert.ok(sanitizeTool);
  assert.ok(urlTool);
  assert.ok(hashTool);
  assert.ok(vaultTool);
  assert.ok(rollbackTool);

  const ctx = { confirm: async () => {}, log: () => {} };

  const sanitized = await sanitizeTool.run({ text_content: 'apiKey: sk-abcdef123456789012345678' }, ctx);
  assert.ok(sanitized.includes('CLIPBOARD SANITIZER REPORT'));
  assert.ok(sanitized.includes('1'));

  const urlRes = await urlTool.run({ url: 'https://secure.example.com/login' }, ctx);
  assert.ok(urlRes.includes('URL THREAT INSPECTION REPORT'));
  assert.ok(urlRes.includes('Secure TLS'));

  // Test credential vault (scoped: once)
  const grantRes = await vaultTool.run({ action: 'grant_permission', service: 'test-service', secret: 'supersecret', scope: 'once' }, ctx);
  assert.ok(grantRes.includes('CREDENTIAL PERMISSION GRANTED'));

  const getRes = await vaultTool.run({ action: 'get_credential', service: 'test-service' }, ctx);
  assert.ok(getRes.includes('supersecret'));
  assert.ok(getRes.includes('consumed'));

  const tmp = path.join(os.tmpdir(), `test_hash_${Date.now()}.txt`);
  fs.writeFileSync(tmp, 'Bigfoot Security', 'utf8');
  try {
    const hashRes = await hashTool.run({ file_path: tmp }, ctx);
    assert.ok(hashRes.includes('FILE INTEGRITY REPORT'));
    assert.ok(hashRes.includes('SHA-256 Checksum'));

    // Test rollback snapshot
    const snapRes = await rollbackTool.run({ action: 'snapshot', paths: [tmp], command: 'test' }, ctx);
    assert.ok(snapRes.includes('SAFETY SNAPSHOT CREATED'));
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

// 5. Creative Media Plugin
const creativePlugin = require('../src/main/plugins/builtin/creative_media');
test('creative_media plugin exports valid tools', async () => {
  assert.ok(Array.isArray(creativePlugin));
  assert.equal(creativePlugin.length, 5);

  for (const tool of creativePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const srtTool = creativePlugin.find((t) => t.name === 'generate_subtitles_srt');
  const podcastTool = creativePlugin.find((t) => t.name === 'clean_podcast_audio');
  const hudTool = creativePlugin.find((t) => t.name === 'manage_game_hud_tips');
  const videoTool = creativePlugin.find((t) => t.name === 'video_editor_assistant');

  const ctx = { confirm: async () => {}, log: () => {} };

  const tmpSrt = path.join(os.tmpdir(), `test_sub_${Date.now()}.srt`);
  try {
    const srtRes = await srtTool.run({
      output_path: tmpSrt,
      dialogue_entries: ['Welcome to Bigfoot.', 'The sovereign personal AI.'],
    }, ctx);
    assert.ok(srtRes.includes('SUBTITLE FILE GENERATED'));
    assert.ok(fs.existsSync(tmpSrt));
  } finally {
    if (fs.existsSync(tmpSrt)) fs.unlinkSync(tmpSrt);
  }

  const hudRes = await hudTool.run({ game_name: 'Minecraft' }, ctx);
  assert.ok(hudRes.includes('OFFLINE GAME COMPANION HUD'));
  assert.ok(hudRes.includes('Diamonds at Y=-58'));

  const videoRes = await videoTool.run({ action: 'capabilities_overview' }, ctx);
  assert.ok(videoRes.includes('MAVE VIDEO EDITING WORKFLOWS'));
  assert.ok(videoRes.includes('FFmpeg'));
});

// 6. Life & Finance Plugin
const lifePlugin = require('../src/main/plugins/builtin/life_finance');
test('life_finance plugin exports valid tools', async () => {
  assert.ok(Array.isArray(lifePlugin));
  assert.equal(lifePlugin.length, 3);

  for (const tool of lifePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const statementTool = lifePlugin.find((t) => t.name === 'parse_financial_statement');
  const invoiceTool = lifePlugin.find((t) => t.name === 'track_invoices_receipts');
  const reflectTool = lifePlugin.find((t) => t.name === 'prompt_daily_reflection');

  const ctx = { confirm: async () => {}, log: () => {} };

  const tmpCsv = path.join(os.tmpdir(), `test_statement_${Date.now()}.csv`);
  fs.writeFileSync(tmpCsv, 'Date,Description,Amount\n2026-10-01,AWS Cloud,120.50\n2026-10-02,Food Market,45.20\n', 'utf8');
  try {
    const stmtRes = await statementTool.run({ file_path: tmpCsv }, ctx);
    assert.ok(stmtRes.includes('FINANCIAL STATEMENT AUDIT REPORT'));
    assert.ok(stmtRes.includes('$165.70'));
  } finally {
    if (fs.existsSync(tmpCsv)) fs.unlinkSync(tmpCsv);
  }

  const invRes = await invoiceTool.run({ vendor: 'MicroCenter', amount: 399.99, category: 'Hardware' }, ctx);
  assert.ok(invRes.includes('INVOICE ENTRY LOGGED'));
  assert.ok(invRes.includes('MicroCenter'));

  const refRes = await reflectTool.run({ wins: 'Implemented 50 superpowers for Bigfoot' }, ctx);
  assert.ok(refRes.includes('EVENING REFLECTION SAVED'));
});

// 7. Swarm & Mesh Plugin
const swarmPlugin = require('../src/main/plugins/builtin/swarm_mesh');
test('swarm_mesh plugin exports valid tools', async () => {
  assert.ok(Array.isArray(swarmPlugin));
  assert.equal(swarmPlugin.length, 4);

  for (const tool of swarmPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const swarmTool = swarmPlugin.find((t) => t.name === 'consult_advisor_swarm');
  const dropTool = swarmPlugin.find((t) => t.name === 'mesh_file_drop');
  const voiceTool = swarmPlugin.find((t) => t.name === 'process_telegram_voice_action');

  const ctx = { confirm: async () => {}, log: () => {} };

  const swarmRes = await swarmTool.run({ decision_topic: 'Migrate to local offline vector database' }, ctx);
  assert.ok(swarmRes.includes('THE BOARD OF ADVISORS DEBATE'));
  assert.ok(swarmRes.includes('The Architect'));
  assert.ok(swarmRes.includes('The Devil\'s Advocate'));

  const voiceRes = await voiceTool.run({ transcribed_command: 'Lock my workstation and sleep displays' }, ctx);
  assert.ok(voiceRes.includes('REMOTE TELEGRAM VOICE PIPELINE'));
});

// 8. Desktop Pet Companion Plugin ("Codex Pets")
const petPlugin = require('../src/main/plugins/builtin/desktop_pet');
test('desktop_pet plugin exports valid tools and manages Codex pets', async () => {
  assert.ok(Array.isArray(petPlugin));
  assert.equal(petPlugin.length, 5);

  for (const tool of petPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }

  const toggleTool = petPlugin.find((t) => t.name === 'toggle_desktop_pet');
  const speciesTool = petPlugin.find((t) => t.name === 'set_pet_species');
  const hatchTool = petPlugin.find((t) => t.name === 'hatch_custom_pet');
  const interactTool = petPlugin.find((t) => t.name === 'interact_with_pet');
  const statusTool = petPlugin.find((t) => t.name === 'get_pet_status');

  assert.ok(toggleTool);
  assert.ok(speciesTool);
  assert.ok(hatchTool);
  assert.ok(interactTool);
  assert.ok(statusTool);

  const ctx = { confirm: async () => {}, log: () => {} };

  // 1. Toggle pet
  const toggleRes = await toggleTool.run({ visible: true }, ctx);
  assert.ok(toggleRes.includes('DESKTOP PET COMPANION'));

  // 2. Switch species
  const speciesRes = await speciesTool.run({ species: 'cyber_fox', name: 'Ren' }, ctx);
  assert.ok(speciesRes.includes('PET COMPANION SWITCHED'));
  assert.ok(speciesRes.includes('Ren'));

  // 3. Hatch custom companion
  const hatchRes = await hatchTool.run({
    name: 'Sparky',
    species: 'mini_robot',
    personality: 'Hyper-focused coding bot',
    color: '#06B6D4',
  }, ctx);
  assert.ok(hatchRes.includes('NEW DESKTOP PET HATCHED!'));
  assert.ok(hatchRes.includes('Sparky'));

  // 4. Interact (Feed, Pet, Play)
  const feedRes = await interactTool.run({ action: 'feed' }, ctx);
  assert.ok(feedRes.includes('Fed Sparky'));

  const petRes = await interactTool.run({ action: 'pet' }, ctx);
  assert.ok(petRes.includes('You petted Sparky'));

  // 5. Status
  const statusRes = await statusTool.run({}, ctx);
  assert.ok(statusRes.includes('DESKTOP PET STATUS'));
  assert.ok(statusRes.includes('Sparky'));
});

test('Meta Muse companion morphs task modes and supports user customization', async () => {
  const { inferTaskMode } = require('../src/main/local/router');
  const { getPetEngine, DEFAULT_SPECIES } = require('../src/main/pet/pet_engine');

  // 1. Meta Muse is the flagship default species
  assert.ok(DEFAULT_SPECIES.meta_muse);
  assert.equal(DEFAULT_SPECIES.meta_muse.name, 'Muse');
  assert.equal(DEFAULT_SPECIES.meta_muse.emoji, '🔮');

  // 2. Task mode inference accurately classifies task types
  assert.equal(inferTaskMode('Write a python script to refactor the database connector'), 'coding');
  assert.equal(inferTaskMode('npm test the test suite and fix the bug in powershell'), 'coding');
  assert.equal(inferTaskMode('Research and compare Claude vs ChatGPT for grant proposals'), 'research');
  assert.equal(inferTaskMode('Fill out the fellowship grant application form'), 'research');
  assert.equal(inferTaskMode('Prove that P != NP using formal theoretical calculus'), 'thinking');
  assert.equal(inferTaskMode('Reason deeply about distributed microservice architecture'), 'thinking');
  assert.equal(inferTaskMode('Click on Google Chrome and scroll down to the sign in button'), 'action');
  assert.equal(inferTaskMode('Goodnight, sleep and relax now'), 'sleep');
  assert.equal(inferTaskMode('Hello, what time is it?'), 'idle');

  // 3. PetEngine methods (feed, pet, play, setTaskMode)
  const engine = getPetEngine();
  engine.setSpecies('meta_muse', 'Muse');

  const modeRes = engine.setTaskMode('coding', 'Coding mode active');
  assert.equal(modeRes.taskMode, 'coding');
  assert.equal(modeRes.species, 'meta_muse');

  const feedRes = engine.feed();
  assert.ok(feedRes.ok);
  assert.ok(feedRes.message.includes('Fed'));

  const petRes = engine.pet();
  assert.ok(petRes.ok);
  assert.ok(petRes.message.includes('petted'));

  const playRes = engine.play();
  assert.ok(playRes.ok);
  assert.ok(playRes.message.includes('Played'));
});

