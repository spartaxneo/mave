'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NetworkSentinel } = require('../src/main/security/network_sentinel');
const networkSentinelPlugin = require('../src/main/plugins/builtin/network_sentinel');

test('NetworkSentinel identifies rogue devices on LAN subnet', () => {
  const sentinel = new NetworkSentinel({
    initialDevices: [
      { mac: '00:11:22:33:44:55', name: 'Known PC', vendor: 'Intel' }
    ]
  });

  const scan = sentinel.detectRogueDevices([
    { mac: '00:11:22:33:44:55', ip: '192.168.1.10' },
    { mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.55', vendor: 'Unknown Rogue' }
  ]);

  assert.equal(scan.totalScanned, 2);
  assert.equal(scan.verifiedCount, 1);
  assert.equal(scan.rogueCount, 1);
  assert.equal(scan.rogueDevices[0].mac, 'aa:bb:cc:dd:ee:ff');
  assert.equal(scan.rogueDevices[0].threatLevel, 'HIGH');
});

test('NetworkSentinel flags vulnerable cleartext ports and scores security posture', () => {
  const sentinel = new NetworkSentinel();
  const audit = sentinel.auditPortSecurity([80, 23, 443, 22]);

  assert.equal(audit.isClean, false);
  assert.equal(audit.vulnerabilitiesCount, 2); // 80 and 23
  assert.ok(audit.vulnerabilities.some(v => v.port === 23 && v.riskLevel === 'CRITICAL'));

  const posture = sentinel.calculateSecurityScore({
    rogueCount: 1,
    vulnerabilitiesCount: 2,
    leaksCount: 0
  });

  assert.equal(posture.score, 60); // 100 - 20 (rogue) - 20 (2 vuln ports)
  assert.equal(posture.posture, 'CRITICAL_RISK');
});

test('NetworkSentinel intercepts AWS keys, GitHub tokens, and Luhn credit cards', () => {
  const sentinel = new NetworkSentinel();

  // AWS Key detection
  const awsReport = sentinel.scanForDataLeakage('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
  assert.equal(awsReport.leaked, true);
  assert.equal(awsReport.detections[0].type, 'AWS_ACCESS_KEY');

  // GitHub token detection
  const ghReport = sentinel.scanForDataLeakage('Bearer ghp_111122223333444455556666777788889999');
  assert.equal(ghReport.leaked, true);
  assert.equal(ghReport.detections[0].type, 'GITHUB_PERSONAL_ACCESS_TOKEN');

  // Luhn valid credit card (Test Visa: 4532 0151 1284 3211)
  const ccReport = sentinel.scanForDataLeakage('My card is 4532-0151-1284-3211 please charge');
  assert.equal(ccReport.leaked, true);
  assert.equal(ccReport.detections[0].type, 'PAYMENT_CARD_PAN');

  // Clean text
  const cleanReport = sentinel.scanForDataLeakage('Just discussing normal project updates for tomorrow.');
  assert.equal(cleanReport.leaked, false);
});

test('NetworkSentinel builtin plugin tools run properly', async () => {
  const scanTool = networkSentinelPlugin.find(t => t.name === 'network_scan_subnet');
  const leakTool = networkSentinelPlugin.find(t => t.name === 'security_scan_data_leakage');

  assert.ok(scanTool);
  assert.ok(leakTool);

  const mockCtx = { log: () => {} };
  const scanOutput = await scanTool.run({
    scanned_devices: [{ mac: 'DE:AD:BE:EF:00:01', ip: '192.168.1.99', vendor: 'Malicious' }]
  }, mockCtx);
  assert.ok(scanOutput.includes('NETWORK PERIMETER ALERT'));

  const leakOutput = await leakTool.run({ payload: 'token=ghp_abcdefghijklmnopqrstuvwxyz0123456789' }, mockCtx);
  assert.ok(leakOutput.includes('DATA LEAKAGE INTERCEPTED'));
});
