'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getTroubleshooter, Troubleshooter, APP_CATALOG } = require('../src/main/diagnostics/troubleshooter');
const { scoreApp } = require('../src/main/plugins/builtin/apps');

test('APP_CATALOG defines known applications with web and install payloads', () => {
  assert.ok(APP_CATALOG.spotify);
  assert.equal(APP_CATALOG.spotify.name, 'Spotify');
  assert.equal(APP_CATALOG.spotify.webUrl, 'https://open.spotify.com');
  assert.equal(APP_CATALOG.spotify.wingetId, 'Spotify.Spotify');
  assert.ok(APP_CATALOG.discord);
  assert.ok(APP_CATALOG.whatsapp);
  assert.ok(APP_CATALOG.vscode);
});

test('Troubleshooter diagnoses missing Spotify and generates actionable recommendations', () => {
  const troubleshooter = new Troubleshooter();
  const record = troubleshooter.collectError({
    task: 'open spotify',
    error: new Error('Application "spotify" is not installed on this Windows PC.'),
    tool: 'open_app',
    context: { appName: 'Spotify', appInfo: APP_CATALOG.spotify },
  });

  assert.ok(record.id);
  assert.equal(record.diagnosis.category, 'APP_NOT_INSTALLED');
  assert.equal(record.diagnosis.appName, 'Spotify');
  assert.ok(record.diagnosis.explanation.includes('Spotify is not installed'));

  const recs = record.diagnosis.recommendations;
  assert.ok(Array.isArray(recs));
  assert.ok(recs.length >= 2);

  // Check web recommendation
  const webRec = recs.find((r) => r.id === 'open_web');
  assert.ok(webRec);
  assert.equal(webRec.actionType, 'open_url');
  assert.equal(webRec.payload.url, 'https://open.spotify.com');

  // Check winget recommendation
  const wingetRec = recs.find((r) => r.id === 'install_winget');
  assert.ok(wingetRec);
  assert.equal(wingetRec.actionType, 'run_command');
  assert.ok(wingetRec.payload.command.includes('Spotify.Spotify'));

  // Verify it was logged in recent errors
  const recent = troubleshooter.getRecentErrors();
  assert.ok(recent.length > 0);
  assert.equal(recent[0].id, record.id);
});

test('Troubleshooter executes command and URL recommendations safely', async () => {
  const troubleshooter = new Troubleshooter();

  // Test run_command recommendation execution with benign PowerShell command
  const rec = {
    id: 'test_cmd',
    label: 'Test Echo',
    actionType: 'run_command',
    payload: { command: 'Write-Output "MaveSelfHealingReady"' },
  };

  const res = await troubleshooter.executeRecommendation(rec);
  assert.equal(res.ok, true);
  assert.ok(res.output.includes('MaveSelfHealingReady'));
});

test('scoreApp accurately matches app names and aliases', () => {
  assert.equal(scoreApp('chrome', 'Google Chrome'), 100);
  assert.equal(scoreApp('spotify', 'Spotify'), 100);
  assert.ok(scoreApp('spot', 'Spotify') > 50);
});

test('MobileWebServer diagnostics and task status endpoints work', async () => {
  const { MobileWebServer } = require('../src/main/remote/web');
  const mockController = {
    state: 'processing',
    currentThought: 'Searching for Spotify...',
    thoughts: ['Received task: "open spotify"', 'Searching for Spotify...'],
    runTask: async () => ({
      ok: false,
      text: 'Spotify is not installed on this PC.',
      thoughts: ['Checking apps...', 'App not found.'],
      recommendations: [
        { id: 'open_web', label: '🌐 Open Spotify Web', actionType: 'open_url', payload: { url: 'https://open.spotify.com' } },
      ],
    }),
  };

  const web = new MobileWebServer({ controller: mockController, port: 48992 });
  try {
    const url = await web.start();

    // 1. GET /api/task/status
    const statusRes = await fetch(`${url}/api/task/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.state, 'processing');
    assert.equal(statusData.thought, 'Searching for Spotify...');
    assert.equal(statusData.thoughts.length, 2);

    // 2. POST /api/diagnostics/fix (run benign command)
    const fixRes = await fetch(`${url}/api/diagnostics/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recommendation: {
          id: 'test_fix',
          label: 'Test Fix',
          actionType: 'run_command',
          payload: { command: 'Write-Output "RemediationDone"' },
        },
      }),
    });
    assert.equal(fixRes.status, 200);
    const fixData = await fixRes.json();
    assert.equal(fixData.ok, true);
    assert.ok(fixData.output.includes('RemediationDone'));

    // 3. GET /api/diagnostics/errors
    const errorsRes = await fetch(`${url}/api/diagnostics/errors`);
    assert.equal(errorsRes.status, 200);
    const errorsData = await errorsRes.json();
    assert.equal(errorsData.ok, true);
    assert.ok(Array.isArray(errorsData.errors));
  } finally {
    web.stop();
  }
});

