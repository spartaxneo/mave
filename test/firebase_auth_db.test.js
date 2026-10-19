'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  FirebaseService,
  firebaseService,
  DEFAULT_FIREBASE_CONFIG,
  encodeFirestoreFields,
  decodeFirestoreFields,
} = require('../src/main/firebase');
const { MobileWebServer } = require('../src/main/remote/web');

test('FirebaseService: default configuration is complete and valid', () => {
  const config = firebaseService.getConfig();
  assert.equal(typeof config.apiKey, 'string');
  assert.ok(config.apiKey.length > 20);
  assert.equal(config.projectId, 'studio-6464285995-59fdf');
  assert.equal(config.appId, '1:283058635167:web:323f98745e7d1c06ca3daa');
  assert.equal(config.authDomain, 'studio-6464285995-59fdf.firebaseapp.com');
  assert.equal(config.storageBucket, 'studio-6464285995-59fdf.firebasestorage.app');
  assert.equal(config.messagingSenderId, '283058635167');
});

test('Firestore Converter: bidirectional encode and decode preserves complex types', () => {
  const sample = {
    name: 'Mave Core',
    version: 1,
    rating: 4.95,
    isHost: true,
    tags: ['ai', 'voice', 'mesh'],
    metadata: {
      platform: 'windows',
      cores: 8,
      active: true,
    },
    nullable: null,
  };

  const encoded = encodeFirestoreFields(sample);
  assert.equal(encoded.name.stringValue, 'Mave Core');
  assert.equal(encoded.version.integerValue, '1');
  assert.equal(encoded.rating.doubleValue, 4.95);
  assert.equal(encoded.isHost.booleanValue, true);
  assert.ok(Array.isArray(encoded.tags.arrayValue.values));
  assert.equal(encoded.tags.arrayValue.values[0].stringValue, 'ai');
  assert.equal(encoded.metadata.mapValue.fields.platform.stringValue, 'windows');
  assert.equal(encoded.nullable.nullValue, null);

  const decoded = decodeFirestoreFields(encoded);
  assert.deepEqual(decoded, sample);
});

test('FirebaseService: signUp, signIn, and anonymous auth flow with mock transport', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-fb-test-'));

  const mockResponses = {
    'accounts:signUp': {
      localId: 'test-user-uid-12345',
      idToken: 'mock-id-token-abc',
      refreshToken: 'mock-refresh-token-xyz',
      expiresIn: '3600',
    },
    'accounts:signInWithPassword': {
      localId: 'test-user-uid-12345',
      idToken: 'mock-id-token-def',
      refreshToken: 'mock-refresh-token-xyz',
      expiresIn: '3600',
      displayName: 'From Near Master',
    },
    'accounts:update': {
      localId: 'test-user-uid-12345',
      displayName: 'From Near Master',
    },
    'accounts:sendOobCode': {
      email: 'user@example.com',
    },
  };

  const mockFetch = async (url, opts = {}) => {
    for (const [key, val] of Object.entries(mockResponses)) {
      if (url.includes(key)) {
        return {
          ok: true,
          status: 200,
          json: async () => val,
        };
      }
    }
    // Default mock response for Firestore REST calls
    if (url.includes('/databases/(default)/documents/')) {
      const body = opts.body ? JSON.parse(opts.body) : {};
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: url,
          fields: body.fields || encodeFirestoreFields({ status: 'ACTIVE' }),
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) };
  };

  const svc = new FirebaseService({
    storageDir: tempDir,
    fetchFn: mockFetch,
  });

  // 1. Sign Up
  const signupRes = await svc.signUp({
    email: 'test@example.com',
    password: 'password123',
    displayName: 'From Near Master',
  });
  assert.equal(signupRes.ok, true);
  assert.equal(signupRes.user.uid, 'test-user-uid-12345');
  assert.equal(signupRes.user.email, 'test@example.com');
  assert.equal(signupRes.user.displayName, 'From Near Master');
  assert.equal(svc.isAuthenticated(), true);

  // Verify persistence
  const savedSession = JSON.parse(fs.readFileSync(path.join(tempDir, 'firebase_session.json'), 'utf8'));
  assert.equal(savedSession.uid, 'test-user-uid-12345');

  // 2. Sign Out
  svc.signOut();
  assert.equal(svc.isAuthenticated(), false);
  assert.equal(svc.getCurrentUser(), null);

  // 3. Sign In
  const signinRes = await svc.signIn({
    email: 'test@example.com',
    password: 'password123',
  });
  assert.equal(signinRes.ok, true);
  assert.equal(signinRes.user.idToken, 'mock-id-token-def');

  // 4. Anonymous Guest Sign-in
  const anonRes = await svc.signInAnonymously();
  assert.equal(anonRes.ok, true);
  assert.equal(anonRes.user.isAnonymous, true);
  assert.equal(anonRes.user.role, 'guest');

  // 5. Send Password Reset
  const resetRes = await svc.sendPasswordReset('user@example.com');
  assert.equal(resetRes.ok, true);

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('FirebaseService: Firestore User Database (Profile, Devices, Preferences)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-fb-db-test-'));

  const memoryStore = {};

  const mockDbFetch = async (url, opts = {}) => {
    if (opts.method === 'PATCH' || opts.method === 'POST') {
      const body = opts.body ? JSON.parse(opts.body) : {};
      memoryStore[url] = body.fields || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: url, fields: memoryStore[url] }),
      };
    }
    if (opts.method === 'GET') {
      if (memoryStore[url]) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: url, fields: memoryStore[url] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ documents: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  };

  const svc = new FirebaseService({
    storageDir: tempDir,
    fetchFn: mockDbFetch,
  });

  const uid = 'usr-omega-99';
  svc.currentUser = { uid, idToken: 'valid-test-token' };

  // 1. Update & Get User Profile
  const profilePatch = {
    displayName: 'Lead Architect',
    theme: 'dark',
    palette: 'mint',
    role: 'owner',
    accountStatus: 'ACTIVE',
  };
  const upRes = await svc.updateUserProfile(uid, profilePatch);
  assert.equal(upRes.ok, true);
  assert.equal(upRes.profile.displayName, 'Lead Architect');

  const getProfRes = await svc.getUserProfile(uid);
  assert.equal(getProfRes.ok, true);
  assert.equal(getProfRes.profile.role, 'owner');
  assert.equal(getProfRes.profile.palette, 'mint');

  // 2. Sync Devices Mesh
  const devRes = await svc.syncDevice(uid, {
    deviceId: 'pc-workstation-win11',
    platform: 'windows',
    role: 'host',
    hostname: 'Workstation-Prime',
    ip: '192.168.1.100',
    capabilities: ['directml', 'kokoro', 'hands'],
  });
  assert.equal(devRes.ok, true);
  assert.equal(devRes.device.hostname, 'Workstation-Prime');

  const listDevs = await svc.getDevices(uid);
  assert.equal(listDevs.ok, true);
  assert.ok(Array.isArray(listDevs.devices));

  // 3. Save & Get Preferences
  const prefRes = await svc.savePreferences(uid, {
    avatarPalette: 'lilac',
    avatarStyle: 'minimal',
    mascotAudioReact: true,
  });
  assert.equal(prefRes.ok, true);
  assert.equal(prefRes.preferences.avatarPalette, 'lilac');

  const getPrefRes = await svc.getPreferences(uid);
  assert.equal(getPrefRes.ok, true);
  assert.equal(getPrefRes.preferences.avatarPalette, 'lilac');
  assert.equal(getPrefRes.preferences.avatarStyle, 'minimal');

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('MobileWebServer: Serves Firebase Auth & Cloud Database REST endpoints', async () => {
  const server = new MobileWebServer({
    controller: {},
    logger: { info() {}, error() {}, warn() {} },
    port: 4055,
  });

  await server.start();
  const base = 'http://127.0.0.1:4055';

  try {
    // 1. GET /api/firebase/config
    const configRes = await fetch(`${base}/api/firebase/config`);
    assert.equal(configRes.status, 200);
    const configData = await configRes.json();
    assert.equal(configData.ok, true);
    assert.equal(configData.config.projectId, 'studio-6464285995-59fdf');
    assert.ok(configData.config.apiKey.length > 20);

    // 2. GET /api/firebase/auth/user
    const userRes = await fetch(`${base}/api/firebase/auth/user`);
    assert.equal(userRes.status, 200);
    const userData = await userRes.json();
    assert.equal(userData.ok, true);

    // 3. POST /api/firebase/auth/logout
    const logoutRes = await fetch(`${base}/api/firebase/auth/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);
    const logoutData = await logoutRes.json();
    assert.equal(logoutData.ok, true);

    // 4. GET /api/firebase/db/devices
    const devsRes = await fetch(`${base}/api/firebase/db/devices?uid=local-mock-user`);
    assert.equal(devsRes.status, 200);
    const devsData = await devsRes.json();
    assert.equal(devsData.ok, true);

    // 5. POST /api/firebase/db/preferences
    const prefRes = await fetch(`${base}/api/firebase/db/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'mock-user-1', preferences: { theme: 'dark', palette: 'sky' } }),
    });
    assert.equal(prefRes.status, 200);
    const prefData = await prefRes.json();
    assert.equal(prefData.ok, true);
  } finally {
    await server.stop();
  }
});
