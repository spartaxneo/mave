'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { CloudflareTunnelManager, getCloudflareTunnelManager } = require('../src/main/remote/cloudflare_tunnel');

test('CloudflareTunnelManager: initialization and binary detection', () => {
  const manager = getCloudflareTunnelManager();
  const status = manager.getStatus();

  assert.ok(status, 'Status returned');
  assert.equal(status.active, false, 'Tunnel starts inactive');
  assert.equal(status.uptime, 0, 'Initial uptime is 0');
  assert.equal(status.hasBinary, true, 'Detected cloudflared binary');
});

test('CloudflareTunnelManager: state management and stop lifecycle', () => {
  const manager = new CloudflareTunnelManager();
  assert.equal(manager.active, false);

  const res = manager.stopTunnel();
  assert.equal(res.ok, true);
  assert.equal(manager.active, false);
  assert.equal(manager.publicUrl, null);
});

test('CloudflareTunnelManager: custom token mode configuration', async () => {
  const manager = new CloudflareTunnelManager();
  const testToken = 'eyJhIjoiZXhhbXBsZTAwMSIsInQiOiJleGFtcGxlLXV1aWQiLCJzIjoiZXhhbXBsZSJ9';

  // In test environment, starting with a mock token triggers token mode resolution
  const startPromise = manager.startTunnel({ token: testToken });
  const result = await startPromise;

  assert.ok(result, 'Start returned response');
  assert.equal(manager.mode, 'token');

  manager.stopTunnel();
  assert.equal(manager.active, false);
});
