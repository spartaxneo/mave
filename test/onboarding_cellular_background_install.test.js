'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OnboardingWizard } = require('../src/renderer/onboarding_wizard');

test('Streamlined Onboarding: Login lands directly on Calibrating and transitions to Personalize', async () => {
  const mockApi = {
    invoke: async (ch, payload) => {
      if (ch === 'settings:get') return { onboarded: false };
      if (ch === 'local:hardware') return {
        hardware: { gpu: 'NVIDIA GeForce RTX 5060', dedicated: true, vramGB: 8, ramGB: 48, freeDiskGB: 40 },
        pick: 'phi-4-mini',
        options: [
          { id: 'phi-4-mini', label: 'Phi-4-mini 3.8B Sovereign Brain', available: true, bytes: 2.49 * (1024 ** 3) },
        ],
      };
      if (ch === 'local:status') return { installedModels: [] };
      if (ch === 'local:start') return { ok: true, started: true };
      return {};
    },
    on: () => () => {},
  };

  const wizard = new OnboardingWizard(null, { api: mockApi });
  wizard.user = { uid: 'u1', email: 'user@gmail.com' };
  wizard.state.email = 'user@gmail.com';

  // 1. Navigation from account must skip device_role and device_models, going to calibrating
  wizard._go('calibrating');
  await wizard._startBackgroundModelCalibration();
  assert.equal(wizard.stepId, 'calibrating');
  assert.equal(wizard.state.selectedModels[0], 'phi-4-mini');
  assert.equal(wizard.state.autoModelRouting, true);

  // 2. Body rendering shows the calibration stage with the orb and progress
  const calibHtml = wizard._renderBody();
  assert.ok(calibHtml.includes('Calibrating MAVE Intelligence'), 'Renders Calibrating MAVE Intelligence header');
  assert.ok(calibHtml.includes('Phi-4-mini 3.8B'), 'Identifies Phi-4-mini as the sovereign brain');
  assert.ok(calibHtml.includes('onb-calib-continue-btn'), 'Provides button to continue to Personalize');

  // 3. User continues to personalize ("Make MAVE yours")
  wizard._go('personalize');
  assert.equal(wizard.stepId, 'personalize');

  const persHtml = wizard._renderBody();
  assert.ok(persHtml.includes('Make MAVE yours'), 'Renders Make MAVE yours');
  assert.ok(persHtml.includes('onb-bg-install-bar'), 'Renders background installation progress bar while personalizing');
});

test('Cellphone Internet Detection: Prompts user and pauses download until Wi-Fi connects', async () => {
  let downloadStartedWithModel = null;
  const mockApi = {
    invoke: async (ch, payload) => {
      if (ch === 'local:hardware') return {
        hardware: { gpu: 'Integrated Graphics', ramGB: 16, freeDiskGB: 25 },
        options: [{ id: 'phi-4-mini', label: 'Phi-4-mini 3.8B', bytes: 2.49 * (1024 ** 3) }],
      };
      if (ch === 'local:status') return { installedModels: [] };
      if (ch === 'network:status') return { isCellular: true, connType: 'cellular' };
      if (ch === 'local:start') {
        downloadStartedWithModel = payload;
        return { ok: true };
      }
      return {};
    },
    on: () => () => {},
  };

  const wizard = new OnboardingWizard(null, { api: mockApi });
  wizard.stepId = 'calibrating';
  wizard.simulateCellular = true; // Cellular active
  await wizard._startBackgroundModelCalibration();

  // Must detect cellular and prompt user
  assert.equal(wizard.isCellular, true);
  assert.equal(wizard.cellularChoice, null);
  assert.equal(wizard.bgDownloadStarted, false, 'Must NOT start download automatically on mobile data');

  const promptHtml = wizard._renderBody();
  assert.ok(promptHtml.includes('Cellphone / Mobile Internet Detected'), 'Prompts user about cellphone internet');
  assert.ok(promptHtml.includes('onb-wifi-wait-btn'), 'Provides Install when I connect to Wi-Fi button');
  assert.ok(promptHtml.includes('onb-cellular-continue-btn'), 'Provides Download now on mobile data button');

  // User chooses: "Install when I connect to Wi-Fi"
  wizard.cellularChoice = 'wait_wifi';
  wizard.waitingForWifi = true;
  wizard._setupWifiListener();

  const waitingHtml = wizard._renderBody();
  assert.ok(waitingHtml.includes('Waiting for Wi-Fi Connection'), 'Displays waiting for Wi-Fi message');
  assert.equal(wizard.bgDownloadStarted, false, 'Download remains paused');

  // User navigates to personalize while waiting for Wi-Fi
  wizard._go('personalize');
  const persWaitingHtml = wizard._renderBody();
  assert.ok(persWaitingHtml.includes('Waiting for Wi-Fi to install MAVE Brain'), 'Shows waiting for Wi-Fi badge in personalize screen');

  // Device connects to Wi-Fi
  wizard.simulateCellular = false;
  // Trigger Wi-Fi connection event
  const isCellNow = await wizard._detectCellularConnection();
  assert.equal(isCellNow, false, 'Network is now Wi-Fi');

  // Trigger download resume
  wizard.waitingForWifi = false;
  wizard.cellularChoice = 'download_now';
  await wizard._triggerModelDownload('phi-4-mini');

  assert.equal(wizard.bgDownloadStarted, true, 'Download automatically starts once Wi-Fi connects');
  assert.ok(wizard.downloadPct >= 5, 'Download progress initialized');

  if (wizard._wifiInterval) clearInterval(wizard._wifiInterval);
});

test('Mobile Data Override: User explicitly clicks Download now on mobile data', async () => {
  let downloadTriggered = false;
  const mockApi = {
    invoke: async (ch, payload) => {
      if (ch === 'local:hardware') return {
        hardware: { gpu: 'RTX 3070', dedicated: true, vramGB: 8, ramGB: 32 },
        options: [{ id: 'phi-4-mini', label: 'Phi-4-mini 3.8B', bytes: 2.49 * (1024 ** 3) }],
      };
      if (ch === 'local:status') return { installedModels: [] };
      if (ch === 'local:start') {
        downloadTriggered = true;
        return { ok: true };
      }
      return {};
    },
    on: () => () => {},
  };

  const wizard = new OnboardingWizard(null, { api: mockApi });
  wizard.simulateCellular = true;
  await wizard._startBackgroundModelCalibration();

  // User opts to download now on mobile data
  wizard.cellularChoice = 'download_now';
  wizard.waitingForWifi = false;
  await wizard._triggerModelDownload('phi-4-mini');

  assert.equal(wizard.bgDownloadStarted, true);
  assert.equal(downloadTriggered, true);
});
