'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../src/main/security/totp');
const { Settings, DEFAULTS, CHOICES } = require('../src/main/settings');

test('TOTP generates valid RFC 6238 secrets and verifies tokens', () => {
  const secret = totp.generateSecret();
  assert.equal(typeof secret, 'string');
  assert.ok(secret.length >= 16);

  const counter = Math.floor(Date.now() / 1000 / 30);
  const token = totp.computeToken(secret, counter);
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 6);
  assert.match(token, /^\d{6}$/);

  // Verification succeeds with correct token
  assert.equal(totp.verifyToken(secret, token), true);

  // Verification fails with invalid token
  assert.equal(totp.verifyToken(secret, '000000' === token ? '999999' : '000000'), false);
});

test('TOTP otpauth URI generation adheres to standard format', () => {
  const secret = totp.generateSecret();
  const uri = totp.generateOtpAuthUri({ secret, accountName: 'owner@mave.local', issuer: 'Mave AI' });
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes(`secret=${secret}`));
  assert.ok(uri.includes('issuer=Mave%20AI'));
});

test('Settings contains all 22 required settings defaults and choices', () => {
  assert.equal(DEFAULTS.assistantName, 'Mave');
  assert.ok('notificationsEnabled' in DEFAULTS);
  assert.ok('notificationSound' in DEFAULTS);
  assert.ok('notificationVolume' in DEFAULTS);
  assert.ok('dndEnabled' in DEFAULTS);
  assert.ok('enabledPlugins' in DEFAULTS);
  assert.ok('licenseKey' in DEFAULTS);
  assert.ok('historyRetention' in DEFAULTS);
  assert.ok('safetyLevel' in DEFAULTS);
  assert.ok('confirmDestructiveCommands' in DEFAULTS);
  assert.ok('redactSensitiveLogs' in DEFAULTS);
  assert.ok('twoFactorEnabled' in DEFAULTS);
  assert.ok('trustedContactName' in DEFAULTS);

  assert.ok(CHOICES.contrast.includes('high'));
  assert.ok(CHOICES.accentColor.includes('emerald'));
  assert.ok(CHOICES.generalLanguage.includes('en'));
  assert.ok(CHOICES.historyRetention.includes('forever'));
  assert.ok(CHOICES.safetyLevel.includes('balanced'));
});
