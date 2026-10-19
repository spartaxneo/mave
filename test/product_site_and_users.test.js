'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { UserManager, ROLES, ROLE_PERMISSIONS } = require('../src/main/users');
const { getProductSiteHtml } = require('../src/main/remote/product_site');
const { MobileWebServer } = require('../src/main/remote/web');

test('UserManager: lifecycle, user addition, roles, and restrictions', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-users-test-'));
  const userMgr = new UserManager({ storageDir: tempDir });

  // 1. Initial host info & default root owner
  const host = userMgr.getHostInfo();
  assert.ok(host.hostId);
  assert.equal(host.serverEnabled, true);
  assert.equal(host.totalUsers, 1);

  const users = userMgr.listUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].role, ROLES.OWNER);
  assert.equal(users[0].isLocalRoot, true);

  // 2. Add new user
  const added = await userMgr.addUser({
    email: 'sarah@design.ai',
    displayName: 'Sarah Designer',
    role: ROLES.MEMBER,
  });
  assert.ok(added.ok);
  assert.equal(added.user.email, 'sarah@design.ai');
  assert.equal(added.user.role, ROLES.MEMBER);

  // 3. Prevent duplicate email
  await assert.rejects(
    async () => {
      await userMgr.addUser({ email: 'sarah@design.ai' });
    },
    /already exists/
  );

  // 4. Update role
  const updated = userMgr.updateUserRole(added.user.id, ROLES.ADMIN);
  assert.ok(updated.ok);
  assert.equal(updated.user.role, ROLES.ADMIN);

  // 5. Cannot demote or remove root owner
  assert.throws(
    () => userMgr.updateUserRole('user-owner-root', ROLES.MEMBER),
    /Cannot change role of primary Host Owner/
  );
  assert.throws(
    () => userMgr.removeUser('user-owner-root'),
    /Cannot remove primary Host Owner/
  );

  // 6. Remove member
  const removed = userMgr.removeUser(added.user.id);
  assert.ok(removed.ok);
  assert.equal(userMgr.listUsers().length, 1);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('UserManager: invite tokens and join verification', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-invite-test-'));
  const userMgr = new UserManager({ storageDir: tempDir });

  // 1. Create invite
  const invRes = userMgr.createInviteLink({ role: ROLES.MEMBER, maxUses: 2 });
  assert.ok(invRes.ok);
  assert.ok(invRes.token.startsWith('mv-inv-'));

  // 2. Verify valid invite
  const check = userMgr.verifyInvite(invRes.token);
  assert.ok(check.ok);
  assert.equal(check.invite.role, ROLES.MEMBER);

  // 3. Accept invite
  const joinRes = await userMgr.acceptInvite(invRes.token, {
    email: 'alex@satellite.node',
    displayName: 'Alex Mobile',
    deviceName: 'iPhone 15 Pro',
  });
  assert.ok(joinRes.ok);
  assert.equal(joinRes.user.email, 'alex@satellite.node');
  assert.ok(joinRes.apiKey.startsWith('sk-mave-'));
  assert.ok(joinRes.memberToken.startsWith('mv-sess-'));

  // 4. Verify API key
  const verified = userMgr.verifyApiKey(joinRes.apiKey);
  assert.ok(verified);
  assert.equal(verified.user.email, 'alex@satellite.node');

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('UserManager: OpenAI-compatible secret API key generation and revocation', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mave-apikey-test-'));
  const userMgr = new UserManager({ storageDir: tempDir });

  // 1. Create key for root
  const keyRes = userMgr.createApiKey({ userId: 'user-owner-root', label: 'Cursor IDE' });
  assert.ok(keyRes.ok);
  assert.ok(keyRes.key.startsWith('sk-mave-'));

  // 2. List keys
  const keys = userMgr.listApiKeys('user-owner-root');
  assert.equal(keys.length, 1);
  assert.equal(keys[0].label, 'Cursor IDE');
  assert.ok(keys[0].keyMasked.includes('…'));

  // 3. Verify key with Bearer prefix
  const auth = userMgr.verifyApiKey(`Bearer ${keyRes.key}`);
  assert.ok(auth);
  assert.equal(auth.apiKey.label, 'Cursor IDE');

  // 4. Revoke key
  const rev = userMgr.revokeApiKey(keyRes.key);
  assert.ok(rev.ok);
  assert.equal(userMgr.verifyApiKey(keyRes.key), null);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('Product Site Generator: renders complete commercial portal and OpenAI account hub', () => {
  const html = getProductSiteHtml({
    hostUrl: 'http://192.168.1.100:4040',
    httpsUrl: 'https://192.168.1.100:4043',
    hostInfo: { hostname: 'Studio-Rig', totalUsers: 3, serverEnabled: true },
    currentUser: { id: 'usr-1', email: 'owner@mave.local', displayName: 'Rig Owner' },
    users: [
      { id: 'usr-1', displayName: 'Rig Owner', email: 'owner@mave.local', role: 'owner' },
      { id: 'usr-2', displayName: 'Dev Laptop', email: 'dev@mave.local', role: 'member' },
    ],
  });

  assert.ok(html.includes('Mave AI — Sovereign Local AI Server'));
  assert.ok(html.includes('avatar-showcase') || html.includes('dot-mascot-hero'));
  assert.ok(html.includes('Dynamic Island') || html.includes('dynamic-island-preview'));
  assert.ok(html.includes('Windows 10 / 11'));
  assert.ok(html.includes('macOS'));
  assert.ok(html.includes('Linux'));
  assert.ok(html.includes('irm https://getmave.ai/install.ps1 | iex'));
  assert.ok(html.includes('OpenAI') || html.includes('account-modal'));
  assert.ok(html.includes('Members') || html.includes('tab-btn-members'));
  assert.ok(html.includes('API Keys') || html.includes('sk-mave-'));
});

test('MobileWebServer: handles product site, CLI installers, download API, and OpenAI endpoints', async () => {
  const testPort = 4455;
  const web = new MobileWebServer({ port: testPort });

  await web.start();

  function makeReq(options, postData = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text: data, json });
        });
      });
      req.on('error', reject);
      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    });
  }

  try {
    // 1. GET /product
    const prodRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/product',
      method: 'GET',
    });
    assert.equal(prodRes.status, 200);
    assert.ok(prodRes.text.includes('<!DOCTYPE html>'));
    assert.ok(prodRes.text.includes('Mave AI'));

    // 2. GET /install.ps1
    const psRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/install.ps1',
      method: 'GET',
    });
    assert.equal(psRes.status, 200);
    assert.ok(psRes.text.includes('MAVE SOVEREIGN LOCAL AI SERVER'));
    assert.ok(psRes.text.includes('node_config.json'));

    // 3. GET /install.sh
    const shRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/install.sh',
      method: 'GET',
    });
    assert.equal(shRes.status, 200);
    assert.ok(shRes.text.includes('#!/usr/bin/env bash'));
    assert.ok(shRes.text.includes('MAVE SOVEREIGN LOCAL AI SERVER'));

    // 4. GET /api/download/win
    const dlRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/download/win',
      method: 'GET',
    });
    assert.equal(dlRes.status, 200);
    assert.ok(dlRes.json.ok);
    assert.equal(dlRes.json.filename, 'Mave-Setup-1.0.0.exe');

    // 5. GET /v1/models (OpenAI Compatible)
    const modelsRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/v1/models',
      method: 'GET',
    });
    assert.equal(modelsRes.status, 200);
    assert.equal(modelsRes.json.object, 'list');
    assert.ok(modelsRes.json.data.some((m) => m.id === 'mave-core'));

    // 6. POST /v1/chat/completions (OpenAI Compatible)
    const chatRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        model: 'mave-core',
        messages: [{ role: 'user', content: 'Who are you?' }],
      }
    );
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.json.object, 'chat.completion');
    assert.ok(chatRes.json.choices.length > 0);
    assert.ok(chatRes.json.choices[0].message.content);
    assert.ok(chatRes.json.usage.total_tokens > 0);

    // 7. GET /api/users
    const usersRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/users',
      method: 'GET',
    });
    assert.equal(usersRes.status, 200);
    assert.ok(usersRes.json.ok);
    assert.ok(Array.isArray(usersRes.json.users));

    // 8. POST /api/users/invite
    const invRes = await makeReq(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/users/invite',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { role: 'member', expiresInDays: 3 }
    );
    assert.equal(invRes.status, 200);
    assert.ok(invRes.json.token);
    assert.ok(invRes.json.inviteUrl.includes('/join?token='));

    // 9. GET /api/host/info
    const hostRes = await makeReq({
      hostname: '127.0.0.1',
      port: testPort,
      path: '/api/host/info',
      method: 'GET',
    });
    assert.equal(hostRes.status, 200);
    assert.ok(hostRes.json.ok);
    assert.ok(hostRes.json.hostInfo);
  } finally {
    await web.stop();
  }
});
