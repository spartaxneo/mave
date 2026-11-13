'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  Settings,
  SECRET_KEYS,
  ALIAS_MAP,
  encryptSecret,
  decryptSecret,
  encryptFallback,
  decryptFallback,
  hashPassword,
  verifyPasswordHash,
  _setSafeStorage,
} = require('../src/main/settings');

function makeTempSettingsPath(prefix = 'settings-test') {
  const dir = path.join(os.tmpdir(), 'mave-security-tests-' + crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${prefix}.json`);
}

function cleanupTempDir(filePath) {
  try {
    const dir = path.dirname(filePath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}

test('1. Secret Keys and Alias Normalization', async (t) => {
  await t.test('All expected cloud provider variants and aliases are registered in SECRET_KEYS', () => {
    const expected = [
      'anthropicKey', 'anthropicApiKey',
      'openaiKey', 'openaiApiKey',
      'geminiKey', 'geminiApiKey',
      'deepseekKey', 'deepseekApiKey',
      'elevenlabsApiKey', 'elevenlabsKey',
      'openrouterApiKey', 'openrouterKey',
      'perplexityKey', 'perplexityApiKey',
      'notionApiKey', 'notionKey',
      'linearApiKey', 'linearKey',
      'stripeApiKey', 'stripeKey',
      'telegramBotToken', 'telegramToken',
      'slackBotToken', 'slackToken',
      'discordBotToken', 'discordToken',
      'githubToken', 'githubApiKey',
    ];
    for (const key of expected) {
      assert.ok(SECRET_KEYS.includes(key), `SECRET_KEYS must include ${key}`);
    }
  });

  await t.test('Bidirectional alias normalization: setting anthropicApiKey updates and reads anthropicKey', () => {
    const filePath = makeTempSettingsPath('alias-test-1');
    try {
      const settings = new Settings(filePath);
      settings.update({ anthropicApiKey: 'sk-ant-api03-test-token-value' });

      // Both alias and canonical secret() lookups return the key
      assert.equal(settings.secret('anthropicApiKey'), 'sk-ant-api03-test-token-value');
      assert.equal(settings.secret('anthropicKey'), 'sk-ant-api03-test-token-value');
      // Direct secrets map lookup
      assert.equal(settings.secrets.anthropicKey, 'sk-ant-api03-test-token-value');
      assert.equal(settings.secrets.anthropicApiKey, 'sk-ant-api03-test-token-value');
    } finally {
      cleanupTempDir(filePath);
    }
  });

  await t.test('Bidirectional alias normalization: setting anthropicKey updates and reads anthropicApiKey', () => {
    const filePath = makeTempSettingsPath('alias-test-2');
    try {
      const settings = new Settings(filePath);
      settings.update({ anthropicKey: 'sk-ant-canonical-token' });

      assert.equal(settings.secret('anthropicKey'), 'sk-ant-canonical-token');
      assert.equal(settings.secret('anthropicApiKey'), 'sk-ant-canonical-token');
      assert.equal(settings.secrets.anthropicApiKey, 'sk-ant-canonical-token');
    } finally {
      cleanupTempDir(filePath);
    }
  });

  await t.test('Normalization works across OpenAI, Gemini, DeepSeek, and ElevenLabs variants', () => {
    const filePath = makeTempSettingsPath('alias-test-3');
    try {
      const settings = new Settings(filePath);
      settings.update({
        openaiApiKey: 'sk-proj-openai-12345',
        geminiApiKey: 'AIzaSyGeminiApiKeyTest',
        deepseekApiKey: 'sk-deepseek-test-6789',
        elevenlabsKey: '11labs-test-secret',
        openrouterKey: 'sk-or-v1-router-secret',
      });

      assert.equal(settings.secret('openaiKey'), 'sk-proj-openai-12345');
      assert.equal(settings.secret('geminiKey'), 'AIzaSyGeminiApiKeyTest');
      assert.equal(settings.secret('deepseekKey'), 'sk-deepseek-test-6789');
      assert.equal(settings.secret('elevenlabsApiKey'), '11labs-test-secret');
      assert.equal(settings.secret('openrouterApiKey'), 'sk-or-v1-router-secret');
    } finally {
      cleanupTempDir(filePath);
    }
  });
});

test('2. Secret Encryption & Safe Fallback Round-Trip', async (t) => {
  await t.test('Direct encryptSecret and decryptSecret round-trip with arbitrary text and symbols', () => {
    const testSecrets = [
      'sk-ant-api03-production-sample-key-1234567890',
      'Bearer gh_pat_11ABCDEF_long_token_with_special!@#$%^&*()_+',
      'unicode-passphrase-🔒-🛡️-ключ-密码',
      'multiline\nsecret\r\nvalue',
    ];

    for (const original of testSecrets) {
      const encrypted = encryptSecret(original);
      assert.ok(typeof encrypted === 'string');
      assert.notEqual(encrypted, original);
      assert.ok(encrypted.length > 0);

      const decrypted = decryptSecret(encrypted);
      assert.equal(decrypted, original);
    }
  });

  await t.test('AES-256-GCM machine-scoped vault fallback encrypts and decrypts with authentication tag', () => {
    const sample = 'machine-scoped-super-secret-credentials';
    const encrypted = encryptFallback(sample);
    assert.ok(encrypted.startsWith('vault:'));

    const decrypted = decryptFallback(encrypted);
    assert.equal(decrypted, sample);

    // Tampered payload fails authentication tag check
    const tampered = encrypted.slice(0, -3) + 'xyz';
    const failDecrypt = decryptFallback(tampered);
    assert.equal(failDecrypt, '');
  });

  await t.test('Strict DPAPI encryption is used when safeStorage.isEncryptionAvailable() is true', () => {
    let dpapiEncryptCalled = false;
    let dpapiDecryptCalled = false;

    const mockDpapi = {
      isEncryptionAvailable: () => true,
      encryptString: (str) => {
        dpapiEncryptCalled = true;
        return Buffer.from('windows-dpapi-protected:' + str);
      },
      decryptString: (buf) => {
        dpapiDecryptCalled = true;
        const text = buf.toString();
        if (!text.startsWith('windows-dpapi-protected:')) throw new Error('Not protected by DPAPI');
        return text.slice('windows-dpapi-protected:'.length);
      },
    };

    try {
      _setSafeStorage(mockDpapi);
      const secret = 'ultra-secure-dpapi-secret-key-2026';
      const encrypted = encryptSecret(secret);
      assert.ok(dpapiEncryptCalled, 'safeStorage.encryptString must be called when encryption is available');

      const decrypted = decryptSecret(encrypted);
      assert.ok(dpapiDecryptCalled, 'safeStorage.decryptString must be called when decrypting DPAPI ciphertext');
      assert.equal(decrypted, secret);
    } finally {
      _setSafeStorage(null);
    }
  });

  await t.test('Encrypted secrets round-trip through persistent file save and reload', () => {
    const filePath = makeTempSettingsPath('persistence-test');
    try {
      const s1 = new Settings(filePath);
      s1.update({
        anthropicKey: 'sk-ant-persistent-secret-999',
        openaiKey: 'sk-proj-persistent-secret-888',
        licenseKey: 'LIC-SOVEREIGN-ENTERPRISE-2026',
      });

      // Check on-disk content: secrets must be stored encrypted under "secrets", not in plaintext
      const rawDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(rawDisk.anthropicKey, undefined, 'Plaintext anthropicKey must not be at root of JSON');
      assert.equal(rawDisk.openaiKey, undefined, 'Plaintext openaiKey must not be at root of JSON');
      assert.equal(rawDisk.licenseKey, undefined, 'Plaintext licenseKey must not be at root of JSON');
      assert.ok(rawDisk.secrets, 'Encrypted secrets object must exist');
      assert.ok(rawDisk.secrets.anthropicKey, 'Encrypted anthropicKey must exist');
      assert.notEqual(rawDisk.secrets.anthropicKey, 'sk-ant-persistent-secret-999');

      // Reload into fresh Settings instance
      const s2 = new Settings(filePath);
      assert.equal(s2.secret('anthropicKey'), 'sk-ant-persistent-secret-999');
      assert.equal(s2.secret('anthropicApiKey'), 'sk-ant-persistent-secret-999');
      assert.equal(s2.secret('openaiKey'), 'sk-proj-persistent-secret-888');
      assert.equal(s2.secret('licenseKey'), 'LIC-SOVEREIGN-ENTERPRISE-2026');
    } finally {
      cleanupTempDir(filePath);
    }
  });
});

test('3. Remote Web Companion Password Hardening & Verification', async (t) => {
  await t.test('Default credentials verify correctly with constant-time comparison', () => {
    const filePath = makeTempSettingsPath('password-defaults');
    try {
      const settings = new Settings(filePath);

      // Default passwords: read: '8080', operate: '0509', admin: '1508'
      assert.equal(settings.verifyRemotePassword('read', '8080'), true);
      assert.equal(settings.verifyRemotePassword('readPassword', '8080'), true);

      assert.equal(settings.verifyRemotePassword('operate', '0509'), true);
      assert.equal(settings.verifyRemotePassword('operatePassword', '0509'), true);

      assert.equal(settings.verifyRemotePassword('admin', '1508'), true);
      assert.equal(settings.verifyRemotePassword('adminPassword', '1508'), true);
    } finally {
      cleanupTempDir(filePath);
    }
  });

  await t.test('Invalid passwords and invalid roles are rejected', () => {
    const filePath = makeTempSettingsPath('password-invalid');
    try {
      const settings = new Settings(filePath);

      // Wrong passwords
      assert.equal(settings.verifyRemotePassword('admin', 'wrong_pin'), false);
      assert.equal(settings.verifyRemotePassword('admin', '1509'), false);
      assert.equal(settings.verifyRemotePassword('operate', '0000'), false);
      assert.equal(settings.verifyRemotePassword('read', '9999'), false);

      // Empty or invalid input
      assert.equal(settings.verifyRemotePassword('admin', ''), false);
      assert.equal(settings.verifyRemotePassword('admin', null), false);
      assert.equal(settings.verifyRemotePassword('admin', undefined), false);

      // Invalid roles
      assert.equal(settings.verifyRemotePassword('superadmin', '1508'), false);
      assert.equal(settings.verifyRemotePassword('root', '1508'), false);
      assert.equal(settings.verifyRemotePassword('', '1508'), false);
    } finally {
      cleanupTempDir(filePath);
    }
  });

  await t.test('Updating remote passwords computes new scrypt salt-hashes and invalidates old ones', () => {
    const filePath = makeTempSettingsPath('password-update');
    try {
      const settings = new Settings(filePath);

      settings.update({
        adminPassword: 'SecureAdmin#Pass@2026',
        operatePassword: 'NewOperatorPass!42',
        readPassword: 'NewReaderPass!77',
      });

      // New passwords pass
      assert.equal(settings.verifyRemotePassword('admin', 'SecureAdmin#Pass@2026'), true);
      assert.equal(settings.verifyRemotePassword('operate', 'NewOperatorPass!42'), true);
      assert.equal(settings.verifyRemotePassword('read', 'NewReaderPass!77'), true);

      // Old default passwords now fail
      assert.equal(settings.verifyRemotePassword('admin', '1508'), false);
      assert.equal(settings.verifyRemotePassword('operate', '0509'), false);
      assert.equal(settings.verifyRemotePassword('read', '8080'), false);

      // Plaintext passwords are not in values object
      assert.equal(settings.values.adminPassword, undefined);
      assert.equal(settings.values.operatePassword, undefined);
      assert.equal(settings.values.readPassword, undefined);
    } finally {
      cleanupTempDir(filePath);
    }
  });

  await t.test('Standalone hashPassword and verifyPasswordHash utility behaves correctly with scrypt & pbkdf2', () => {
    const pwd = 'TestPassword123!';
    const hash = hashPassword(pwd);
    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(verifyPasswordHash(pwd, hash), true);
    assert.equal(verifyPasswordHash('WrongPassword!', hash), false);
    assert.equal(verifyPasswordHash('', hash), false);
    assert.equal(verifyPasswordHash(pwd, 'invalid-hash-format'), false);
  });
});

test('4. publicView() Never Exposes Secret Text or Passwords', () => {
  const filePath = makeTempSettingsPath('public-view-test');
  try {
    const settings = new Settings(filePath);
    settings.update({
      anthropicApiKey: 'sk-ant-test-secret-value-12345',
      openaiKey: 'sk-proj-openai-secret-67890',
      geminiKey: 'gemini-secret-test-key-abcde',
      adminPassword: 'UltraSecretAdminPassword!999',
    });

    const view = settings.publicView();

    // 1. Secret texts are NOT present on the view
    assert.equal(view.anthropicKey, undefined);
    assert.equal(view.anthropicApiKey, undefined);
    assert.equal(view.openaiKey, undefined);
    assert.equal(view.openaiApiKey, undefined);
    assert.equal(view.geminiKey, undefined);
    assert.equal(view.geminiApiKey, undefined);

    // 2. Passwords are NOT present on the view
    assert.equal(view.readPassword, undefined);
    assert.equal(view.operatePassword, undefined);
    assert.equal(view.adminPassword, undefined);

    // 3. Boolean flags are properly set
    assert.equal(view.hasAnthropicKey, true);
    assert.equal(view.hasAnthropicApiKey, true);
    assert.equal(view.hasOpenaiKey, true);
    assert.equal(view.hasOpenaiApiKey, true);
    assert.equal(view.hasGeminiKey, true);
    assert.equal(view.hasGeminiApiKey, true);
    assert.equal(view.hasDeepseekKey, false);

    // 4. `has` sub-object contains boolean flags
    assert.equal(view.has.anthropicKey, true);
    assert.equal(view.has.anthropicApiKey, true);
    assert.equal(view.has.openaiKey, true);
    assert.equal(view.has.deepseekKey, false);

    // 5. Full JSON serialization test: no sensitive text anywhere
    const jsonStr = JSON.stringify(view);
    assert.equal(jsonStr.includes('sk-ant-test-secret-value-12345'), false);
    assert.equal(jsonStr.includes('sk-proj-openai-secret-67890'), false);
    assert.equal(jsonStr.includes('gemini-secret-test-key-abcde'), false);
    assert.equal(jsonStr.includes('UltraSecretAdminPassword!999'), false);
  } finally {
    cleanupTempDir(filePath);
  }
});

test('5. Plaintext Migration & Sanitization of Legacy Settings', () => {
  const filePath = makeTempSettingsPath('migration-test');
  try {
    // Construct a legacy JSON settings file with unencrypted secrets at root
    const legacyJson = {
      theme: 'dark',
      assistantName: 'Mave',
      anthropicKey: 'sk-ant-legacy-root-secret-value',
      openaiApiKey: 'sk-openai-legacy-root-secret-value',
      readPassword: 'legacy-plaintext-read-pass',
      adminPassword: 'legacy-plaintext-admin-pass',
      licenseKey: 'LIC-LEGACY-SOVEREIGN-444',
      // secrets object missing or empty
    };

    fs.writeFileSync(filePath, JSON.stringify(legacyJson, null, 2));

    // Load Settings from legacy file
    const settings = new Settings(filePath);

    // 1. Secrets migrated into this.secrets
    assert.equal(settings.secret('anthropicKey'), 'sk-ant-legacy-root-secret-value');
    assert.equal(settings.secret('anthropicApiKey'), 'sk-ant-legacy-root-secret-value');
    assert.equal(settings.secret('openaiKey'), 'sk-openai-legacy-root-secret-value');
    assert.equal(settings.secret('openaiApiKey'), 'sk-openai-legacy-root-secret-value');
    assert.equal(settings.secret('licenseKey'), 'LIC-LEGACY-SOVEREIGN-444');

    // 2. Passwords migrated and verifiable
    assert.equal(settings.verifyRemotePassword('read', 'legacy-plaintext-read-pass'), true);
    assert.equal(settings.verifyRemotePassword('admin', 'legacy-plaintext-admin-pass'), true);

    // 3. Plaintext keys scrubbed from values
    assert.equal(settings.values.anthropicKey, undefined);
    assert.equal(settings.values.openaiApiKey, undefined);
    assert.equal(settings.values.readPassword, undefined);
    assert.equal(settings.values.adminPassword, undefined);
    assert.equal(settings.values.licenseKey, undefined);

    // 4. File on disk immediately sanitized and re-encrypted
    const rawAfterMigration = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(rawAfterMigration.anthropicKey, undefined);
    assert.equal(rawAfterMigration.openaiApiKey, undefined);
    assert.equal(rawAfterMigration.readPassword, undefined);
    assert.equal(rawAfterMigration.adminPassword, undefined);
    assert.equal(rawAfterMigration.licenseKey, undefined);

    assert.ok(rawAfterMigration.secrets, 'secrets object created in file');
    assert.ok(rawAfterMigration.secrets.anthropicKey, 'anthropicKey encrypted in file');
    assert.notEqual(rawAfterMigration.secrets.anthropicKey, 'sk-ant-legacy-root-secret-value');

    // Ensure raw file contents contain no plaintext secret tokens
    const fileContent = fs.readFileSync(filePath, 'utf8');
    assert.equal(fileContent.includes('sk-ant-legacy-root-secret-value'), false);
    assert.equal(fileContent.includes('sk-openai-legacy-root-secret-value'), false);
    assert.equal(fileContent.includes('legacy-plaintext-read-pass'), false);
    assert.equal(fileContent.includes('legacy-plaintext-admin-pass'), false);
  } finally {
    cleanupTempDir(filePath);
  }
});
