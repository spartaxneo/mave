'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { PrivacyShield, getPrivacyShield } = require('../src/main/privacy');
const { CredentialVault } = require('../src/main/security/vault');
const { ThreadManager } = require('../src/main/threads');
const creativePlugin = require('../src/main/plugins/builtin/creative_media');

test('PrivacyShield detects privacy intents and controls blind mode state', () => {
  const shield = new PrivacyShield();

  // Test intent parsing
  const blindIntent1 = shield.matchIntent("don't track me for 2 minutes");
  assert.ok(blindIntent1);
  assert.equal(blindIntent1.action, 'blind');
  assert.equal(blindIntent1.minutes, 2);

  const blindIntent2 = shield.matchIntent('pause vision for 5 mins');
  assert.ok(blindIntent2);
  assert.equal(blindIntent2.action, 'blind');
  assert.equal(blindIntent2.minutes, 5);

  const resumeIntent = shield.matchIntent('resume tracking');
  assert.ok(resumeIntent);
  assert.equal(resumeIntent.action, 'resume');

  // Test blind activation and deactivation
  assert.equal(shield.isBlind(), false);
  const activated = shield.activateBlind(2, 'test');
  assert.equal(activated.blind, true);
  assert.equal(shield.isBlind(), true);
  assert.ok(shield.remainingSeconds() > 0);

  const deactivated = shield.deactivateBlind();
  assert.equal(deactivated.blind, false);
  assert.equal(shield.isBlind(), false);
  assert.equal(shield.remainingSeconds(), 0);
});

test('CredentialVault securely encrypts and manages scoped credentials', () => {
  const tmpDir = path.join(os.tmpdir(), `mave_vault_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const vaultFile = path.join(tmpDir, 'vault.enc');
  const keyFile = path.join(tmpDir, 'vault.key');

  try {
    const vault = new CredentialVault({ vaultFile, keyFile });

    // 1. Grant permanent permission
    const res1 = vault.grantPermission({
      service: 'github.com',
      username: 'testuser',
      secret: 'ghp_secret_token_12345',
      scope: 'always',
    });
    assert.equal(res1.ok, true);
    assert.equal(res1.service, 'github.com');

    // Verify encrypted file exists and does NOT contain plaintext secret
    assert.ok(fs.existsSync(vaultFile));
    const rawContent = fs.readFileSync(vaultFile, 'utf8');
    assert.ok(!rawContent.includes('ghp_secret_token_12345'), 'Plaintext secret leaked into vault file!');

    // Retrieve credential
    const cred = vault.getCredential('github.com');
    assert.ok(cred);
    assert.equal(cred.username, 'testuser');
    assert.equal(cred.secret, 'ghp_secret_token_12345');

    // 2. Grant single-use 'once' credential
    vault.grantPermission({
      service: 'temporary_vpn',
      username: 'vpnuser',
      secret: 'one_time_pass_999',
      scope: 'once',
    });

    const onceCred = vault.getCredential('temporary_vpn');
    assert.ok(onceCred);
    assert.equal(onceCred.secret, 'one_time_pass_999');
    assert.equal(onceCred.consumed, true);

    // Second retrieval must return null (immediately wiped)
    const wipedCred = vault.getCredential('temporary_vpn');
    assert.equal(wipedCred, null, 'Single-use credential was not wiped after first access!');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ThreadManager isolates conversation dockers per task and per device', () => {
  const tmpFile = path.join(os.tmpdir(), `threads_test_${Date.now()}.json`);
  try {
    const tm = new ThreadManager(tmpFile);

    // Initial thread exists
    const initialList = tm.listThreads();
    assert.ok(initialList.length >= 1);

    // Create custom task dockers
    const devThread = tm.createThread('Code Refactoring', 'desktop');
    const mobileThread = tm.createThread('Grocery List Voice Chat', 'mobile');

    assert.ok(devThread.id);
    assert.ok(mobileThread.id);
    assert.notEqual(devThread.id, mobileThread.id);

    // Add messages to desktop thread
    tm.addMessage(devThread.id, 'user', 'Refactor auth controller');
    tm.addMessage(devThread.id, 'assistant', 'Refactoring completed with unit tests.');

    // Add messages to mobile thread
    tm.addMessage(mobileThread.id, 'user', 'Add apples and milk');
    tm.addMessage(mobileThread.id, 'assistant', 'Added apples and milk to list.');

    // Verify isolation: Desktop thread does NOT contain grocery list
    const fetchedDev = tm.getThread(devThread.id);
    const fetchedMobile = tm.getThread(mobileThread.id);

    assert.equal(fetchedDev.messages.length, 2);
    assert.equal(fetchedMobile.messages.length, 2);
    assert.ok(fetchedDev.messages[0].content.includes('Refactor'));
    assert.ok(!fetchedDev.messages[0].content.includes('apples'));

    assert.ok(fetchedMobile.messages[0].content.includes('apples'));
    assert.ok(!fetchedMobile.messages[0].content.includes('Refactor'));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('video_editor_assistant tool provides practical workflows and AI video generation', async () => {
  const videoTool = creativePlugin.find((t) => t.name === 'video_editor_assistant');
  assert.ok(videoTool);

  const ctx = { log: () => {} };

  // 1. Overview
  const overview = await videoTool.run({ action: 'capabilities_overview' }, ctx);
  assert.ok(overview.includes('Lossless FFmpeg Automation'));
  assert.ok(overview.includes('Desktop Video Editor Control'));
  assert.ok(overview.includes('AI Video Generation'));

  // 2. FFmpeg trim command
  const trimRes = await videoTool.run({
    action: 'ffmpeg_trim_cut',
    input_file: 'input.mp4',
    start_time: '00:00:10',
    duration_or_end: '30',
  }, ctx);
  assert.ok(trimRes.includes('-ss 00:00:10'));
  assert.ok(trimRes.includes('-c copy'));

  // 3. Aspect ratio conversion for TikTok / Reels
  const aspectRes = await videoTool.run({
    action: 'ffmpeg_aspect_ratio',
    input_file: 'video.mp4',
    aspect_ratio: '9:16_tiktok_shorts',
  }, ctx);
  assert.ok(aspectRes.includes('1080:1920'));

  // 4. AI video prompt synthesis
  const aiPromptRes = await videoTool.run({
    action: 'ai_video_prompt',
    concept_or_topic: 'Futuristic electric supercar drifting in neon Tokyo rain',
  }, ctx);
  assert.ok(aiPromptRes.includes('Futuristic electric supercar'));
  assert.ok(aiPromptRes.includes('35mm Arri Alexa 65'));
  assert.ok(aiPromptRes.includes('Negative Prompt'));
});
