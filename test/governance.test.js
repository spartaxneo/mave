'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const {
  GovernanceManager,
  POWER_TIERS,
  DEFAULT_GLOBAL_RULES,
  DEFAULT_USERS,
  DEFAULT_DEVICES,
} = require('../src/main/security/governance');
const parentalGovernancePlugin = require('../src/main/plugins/builtin/parental_governance');

test('GovernanceManager initializes with default power tiers and users', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_1.json`);
  const gov = new GovernanceManager(tmpFile);

  assert.equal(gov.activeUserId, 'admin');
  assert.equal(gov.verifyAdmin('1508'), true);
  assert.equal(gov.verifyAdmin('wrong'), false);

  const users = gov.getUsers();
  assert.ok(users.length >= 3);
  const admin = gov.getUser('admin');
  const kid = gov.getUser('kid');
  const guest = gov.getUser('guest');

  assert.equal(admin.powerTier, 'super_admin');
  assert.equal(kid.powerTier, 'safe_kid');
  assert.equal(guest.powerTier, 'read_only');

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('User Freedom of Customization allows personal settings without admin PIN', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_2.json`);
  const gov = new GovernanceManager(tmpFile);

  const res = gov.updateCustomization('kid', {
    name: 'Alexander The Great',
    customInstructions: 'I love astrophysics and Python programming. Keep explanations rigorous.',
    voice: 'am_adam',
    companionSpecies: 'baby_dragon',
    companionTheme: 'golden',
    language: 'Hindi',
    theme: 'dark',
  });

  assert.equal(res.ok, true);
  const updatedKid = gov.getUser('kid');
  assert.equal(updatedKid.name, 'Alexander The Great');
  assert.equal(updatedKid.customInstructions, 'I love astrophysics and Python programming. Keep explanations rigorous.');
  assert.equal(updatedKid.voice, 'am_adam');
  assert.equal(updatedKid.companionSpecies, 'baby_dragon');
  assert.equal(updatedKid.companionTheme, 'golden');
  assert.equal(updatedKid.language, 'Hindi');

  // Verify persistence
  const reloaded = new GovernanceManager(tmpFile);
  assert.equal(reloaded.getUser('kid').name, 'Alexander The Great');

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('Parent Admin Control requires valid PIN for power tier and rules changes', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_3.json`);
  const gov = new GovernanceManager(tmpFile);

  // Reject unauthorized update
  assert.throws(() => {
    gov.adminUpdateUser('kid', { powerTier: 'super_admin' }, 'wrong_pin');
  }, /Invalid Admin PIN/);

  // Allow authorized update
  const res = gov.adminUpdateUser('kid', { powerTier: 'standard', permissions: { canControlScreen: true } }, '1508');
  assert.equal(res.ok, true);
  assert.equal(gov.getUser('kid').powerTier, 'standard');

  // Admin global rules management
  assert.throws(() => {
    gov.adminSetGlobalRules(['Rule 1'], 'wrong_pin');
  }, /Invalid Admin PIN/);

  const updatedRules = ['Mandatory Rule A', 'Mandatory Rule B'];
  gov.adminSetGlobalRules(updatedRules, '1508');
  assert.deepEqual(gov.getGlobalRules(), updatedRules);

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('Device Power Allocation Matrix assigns power per connected device', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_4.json`);
  const gov = new GovernanceManager(tmpFile);

  const res = gov.adminSetDevicePower('tablet_living_room', {
    name: 'Living Room Tablet',
    assignedUserId: 'guest',
    powerTier: 'read_only',
    customRules: ['No downloads', 'No terminal'],
  }, '1508');

  assert.equal(res.ok, true);
  const dev = gov.getDevice('tablet_living_room');
  assert.equal(dev.name, 'Living Room Tablet');
  assert.equal(dev.powerTier, 'read_only');
  assert.equal(dev.permissions.canRunTerminal, false);

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('isActionPermitted accurately enforces power tier capabilities', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_5.json`);
  const gov = new GovernanceManager(tmpFile);

  // Super Admin permissions
  assert.equal(gov.isActionPermitted('terminal', 'admin', 'host_pc').allowed, true);
  assert.equal(gov.isActionPermitted('screen_control', 'admin', 'host_pc').allowed, true);
  assert.equal(gov.isActionPermitted('vault_access', 'admin', 'host_pc').allowed, true);
  assert.equal(gov.isActionPermitted('purchase', 'admin', 'host_pc').allowed, true);

  // Safe Kid permissions (Terminal & Vault strictly prohibited)
  const kidTerm = gov.isActionPermitted('terminal', 'kid', 'host_pc');
  assert.equal(kidTerm.allowed, false);
  assert.match(kidTerm.reason, /Terminal execution is disabled/);

  const kidVault = gov.isActionPermitted('vault_access', 'kid', 'host_pc');
  assert.equal(kidVault.allowed, false);
  assert.match(kidVault.reason, /Secret Vault/);

  // Read-Only permissions
  const guestClick = gov.isActionPermitted('screen_control', 'guest', 'host_pc');
  assert.equal(guestClick.allowed, false);

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('generatePromptDirectives constructs authoritative prompt injection', () => {
  const tmpFile = path.join(os.tmpdir(), `gov_test_${Date.now()}_6.json`);
  const gov = new GovernanceManager(tmpFile);

  gov.updateCustomization('kid', {
    customInstructions: 'Alex is practicing for math olympiad.',
  });

  const directives = gov.generatePromptDirectives('kid', 'host_pc');
  assert.ok(directives.includes('PARENTAL GOVERNANCE & ACTIVE USER POWERS'));
  assert.ok(directives.includes('Alex (Kid)'));
  assert.ok(directives.includes('Terminal / PowerShell Commands: STRICTLY PROHIBITED ⛔'));
  assert.ok(directives.includes('Alex is practicing for math olympiad.'));
  assert.ok(directives.includes('Master Parent Admin Rules'));

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('parental_governance builtin plugin tools execute correctly', async () => {
  const tools = parentalGovernancePlugin;
  assert.ok(Array.isArray(tools));
  assert.equal(tools.length, 4);

  const getPolicies = tools.find((t) => t.name === 'governance_get_active_policies');
  const customize = tools.find((t) => t.name === 'governance_customize_user_profile');
  const manageRules = tools.find((t) => t.name === 'governance_admin_manage_rules');
  const setPower = tools.find((t) => t.name === 'governance_admin_set_power');

  assert.ok(getPolicies && customize && manageRules && setPower);

  // Test inspection
  const policyText = await getPolicies.run({}, {});
  assert.ok(policyText.includes('PARENTAL GOVERNANCE & ACTIVE POLICIES'));

  // Test user customization
  const custRes = await customize.run({
    user_id: 'admin',
    custom_instructions: 'Senior tech architect instructions.',
    companion_species: 'meta_muse',
  }, {});
  assert.ok(custRes.includes('Profile Customized Successfully'));

  // Test admin rule rejection with wrong PIN
  const unauthRule = await manageRules.run({ admin_pin: '0000', action: 'add_global_rule', rule_text: 'Test rule' }, {});
  assert.ok(unauthRule.includes('Unauthorized'));

  // Test admin rule add with correct PIN
  const authRule = await manageRules.run({ admin_pin: '1508', action: 'add_global_rule', rule_text: 'Bedtime 10 PM' }, {});
  assert.ok(authRule.includes('Global Rule Added'));

  // Test admin power adjustment
  const powerRes = await setPower.run({
    admin_pin: '1508',
    target_type: 'user',
    target_id: 'kid',
    power_tier: 'safe_kid',
    can_run_terminal: false,
  }, {});
  assert.ok(powerRes.includes('User Power Level Updated'));
});
