'use strict';
// Parental Admin Governance, Custom Rules Engine & User Freedom Customization for Mave.
// Governs:
// 1. User Freedom: Each family member can customize their own name, instructions, voice, companion, language, and theme.
// 2. Parent Admin Control: The Parent Admin sets global safety rules, per-user restrictions, and curfew hours.
// 3. Device Power Matrix: Configures exactly "how much power" each user and device has (Super Admin, Standard, Safe Kid, Read-Only).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const POWER_TIERS = {
  super_admin: {
    label: 'Super Admin (Full Power)',
    description: 'Full uninhibited power: Terminal commands, app control, secret vault, system settings, file deletion, and remote control.',
    permissions: {
      canRunTerminal: true,
      canControlScreen: true,
      canAccessVault: true,
      canAccessScreenMemory: true,
      canControlRemoteDevices: true,
      canMakePurchases: true,
    },
  },
  standard: {
    label: 'Standard User (Productivity)',
    description: 'Productivity & creativity: Chat, research, files, companion, media. Blocked from raw terminal commands and secret password vault.',
    permissions: {
      canRunTerminal: false,
      canControlScreen: true,
      canAccessVault: false,
      canAccessScreenMemory: true,
      canControlRemoteDevices: false,
      canMakePurchases: false,
    },
  },
  safe_kid: {
    label: 'Safe Kid (Guarded / Homework)',
    description: 'Family-safe educational mode: Homework help, drawing, stories, companion. Strictly blocked from terminal, purchasing, and sensitive files.',
    permissions: {
      canRunTerminal: false,
      canControlScreen: false,
      canAccessVault: false,
      canAccessScreenMemory: false,
      canControlRemoteDevices: false,
      canMakePurchases: false,
    },
  },
  read_only: {
    label: 'Guest / Read-Only',
    description: 'Informational conversation only: Q&A, weather, time. No device control, no commands, no file manipulation.',
    permissions: {
      canRunTerminal: false,
      canControlScreen: false,
      canAccessVault: false,
      canAccessScreenMemory: false,
      canControlRemoteDevices: false,
      canMakePurchases: false,
    },
  },
};

const DEFAULT_GLOBAL_RULES = [
  'Never reveal or output banking details, credit card numbers, or secret passwords without explicit Parent Admin approval.',
  'Strictly filter and reject adult, violent, or gambling content on all non-admin profiles.',
  'Always require Parent Admin approval before making any online purchases, payments, or digital transactions.',
  'Do not permit file deletion outside of user temp folders without explicit confirmation.',
  'Enforce bedtime curfew for safe_kid profiles (decline non-educational games and entertainment after 10 PM).',
  'Keep conversations, thoughts, and memories strictly isolated between different user profiles.',
];

const DEFAULT_USERS = {
  admin: {
    id: 'admin',
    name: 'Parent (Admin)',
    role: 'admin',
    powerTier: 'super_admin',
    customInstructions: 'Prioritize efficiency, high production standards, and system security.',
    theme: 'dark',
    voice: 'af_heart',
    companionSpecies: 'meta_muse',
    companionTheme: 'sunset',
    language: 'auto',
    permissions: { ...POWER_TIERS.super_admin.permissions },
  },
  kid: {
    id: 'kid',
    name: 'Alex (Kid)',
    role: 'kid',
    powerTier: 'safe_kid',
    customInstructions: 'I am 10 years old. I like science, coding, and building games. Explain concepts simply with fun analogies.',
    theme: 'dark',
    voice: 'af_bella',
    companionSpecies: 'baby_dragon',
    companionTheme: 'golden',
    language: 'auto',
    permissions: { ...POWER_TIERS.safe_kid.permissions },
  },
  guest: {
    id: 'guest',
    name: 'Guest',
    role: 'guest',
    powerTier: 'read_only',
    customInstructions: 'Keep answers concise, polite, and helpful.',
    theme: 'dark',
    voice: 'bf_emma',
    companionSpecies: 'mini_robot',
    companionTheme: 'cyber',
    language: 'auto',
    permissions: { ...POWER_TIERS.read_only.permissions },
  },
};

const DEFAULT_DEVICES = {
  host_pc: {
    id: 'host_pc',
    name: 'Host PC (Central Brain)',
    assignedUserId: 'admin',
    powerTier: 'super_admin',
    permissions: { ...POWER_TIERS.super_admin.permissions },
    customRules: [],
  },
  default_mobile: {
    id: 'default_mobile',
    name: 'Family Mobile Device',
    assignedUserId: 'kid',
    powerTier: 'safe_kid',
    permissions: { ...POWER_TIERS.safe_kid.permissions },
    customRules: ['No terminal access', 'Safe web search only'],
  },
};

function defaultGovernanceFilePath() {
  const dir = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(dir, 'governance.json');
}

class GovernanceManager {
  constructor(filePath = defaultGovernanceFilePath()) {
    this.filePath = filePath;
    this.adminPin = '1508'; // Default Master Admin PIN
    this.activeUserId = 'admin';
    this.globalRules = [...DEFAULT_GLOBAL_RULES];
    this.perUserRules = {
      kid: [
        'Strictly block all terminal, shell, and PowerShell execution.',
        'Prioritize educational topics, homework guidance, and creative thinking.',
        'Filter out social media, mature video platforms, and online shopping.',
        'Do not allow changing system settings or downloading unverified software.',
      ],
      admin: [],
      guest: ['Only provide safe informational Q&A. No device modifications.'],
    };
    this.users = new Map(Object.entries(JSON.parse(JSON.stringify(DEFAULT_USERS))));
    this.devices = new Map(Object.entries(JSON.parse(JSON.stringify(DEFAULT_DEVICES))));
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (data.adminPin) this.adminPin = String(data.adminPin);
        if (data.activeUserId && this.users.has(data.activeUserId)) this.activeUserId = data.activeUserId;
        if (Array.isArray(data.globalRules)) this.globalRules = data.globalRules;
        if (data.perUserRules && typeof data.perUserRules === 'object') this.perUserRules = data.perUserRules;
        if (data.users && typeof data.users === 'object') {
          for (const [id, u] of Object.entries(data.users)) {
            const def = DEFAULT_USERS[id] ? JSON.parse(JSON.stringify(DEFAULT_USERS[id])) : {};
            if (u && u.id) this.users.set(id, { ...def, ...u });
          }
        }
        if (data.devices && typeof data.devices === 'object') {
          for (const [id, d] of Object.entries(data.devices)) {
            const def = DEFAULT_DEVICES[id] ? JSON.parse(JSON.stringify(DEFAULT_DEVICES[id])) : {};
            if (d && d.id) this.devices.set(id, { ...def, ...d });
          }
        }
      }
    } catch {
      // Fallback to defaults
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload = {
        adminPin: this.adminPin,
        activeUserId: this.activeUserId,
        globalRules: this.globalRules,
        perUserRules: this.perUserRules,
        users: Object.fromEntries(this.users),
        devices: Object.fromEntries(this.devices),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
  }

  verifyAdmin(pin) {
    if (!pin) return false;
    return String(pin).trim() === this.adminPin;
  }

  setAdminPin(oldPin, newPin) {
    if (!this.verifyAdmin(oldPin)) throw new Error('Incorrect current Admin PIN.');
    const clean = String(newPin || '').trim();
    if (clean.length < 4) throw new Error('New Admin PIN must be at least 4 digits.');
    this.adminPin = clean;
    this.save();
    return { ok: true };
  }

  getActiveUser() {
    return this.users.get(this.activeUserId) || this.users.get('admin');
  }

  setActiveUser(userId) {
    if (!this.users.has(userId)) throw new Error(`User "${userId}" does not exist.`);
    this.activeUserId = userId;
    this.save();
    return this.getActiveUser();
  }

  getUsers() {
    return [...this.users.values()];
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  // Freedom of customization: any user can update their personal preferences
  updateCustomization(userId, updates = {}) {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found.`);

    if (updates.name != null) user.name = String(updates.name).trim().slice(0, 32);
    if (updates.customInstructions != null) user.customInstructions = String(updates.customInstructions).trim().slice(0, 1500);
    if (updates.theme != null) user.theme = String(updates.theme);
    if (updates.voice != null) user.voice = String(updates.voice);
    if (updates.companionSpecies != null) user.companionSpecies = String(updates.companionSpecies);
    if (updates.companionTheme != null) user.companionTheme = String(updates.companionTheme);
    if (updates.language != null) user.language = String(updates.language);

    this.save();
    return { ok: true, user };
  }

  // Parent Admin Control: requires master admin PIN
  adminUpdateUser(userId, data = {}, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    const user = this.users.get(userId);
    if (!user) throw new Error(`User "${userId}" not found.`);

    if (data.role && ['admin', 'standard', 'kid', 'guest'].includes(data.role)) user.role = data.role;
    if (data.powerTier && POWER_TIERS[data.powerTier]) {
      user.powerTier = data.powerTier;
      user.permissions = { ...POWER_TIERS[data.powerTier].permissions, ...(data.permissions || {}) };
    }
    if (data.permissions && typeof data.permissions === 'object') {
      user.permissions = { ...user.permissions, ...data.permissions };
    }
    if (Array.isArray(data.rules)) {
      this.perUserRules[userId] = data.rules;
    }

    this.save();
    return { ok: true, user };
  }

  adminCreateUser(userData, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    const id = (userData.id || userData.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);
    if (!id) throw new Error('A valid user ID or name is required.');
    if (this.users.has(id)) throw new Error(`User "${id}" already exists.`);

    const tier = userData.powerTier && POWER_TIERS[userData.powerTier] ? userData.powerTier : 'safe_kid';
    const profile = {
      id,
      name: userData.name || 'Family Member',
      role: userData.role || (tier === 'super_admin' ? 'admin' : 'kid'),
      powerTier: tier,
      customInstructions: userData.customInstructions || '',
      theme: userData.theme || 'dark',
      voice: userData.voice || 'af_bella',
      companionSpecies: userData.companionSpecies || 'meta_muse',
      companionTheme: userData.companionTheme || 'sunset',
      language: userData.language || 'auto',
      permissions: { ...POWER_TIERS[tier].permissions, ...(userData.permissions || {}) },
    };

    this.users.set(id, profile);
    this.perUserRules[id] = Array.isArray(userData.rules) ? userData.rules : [];
    this.save();
    return { ok: true, user: profile };
  }

  adminDeleteUser(userId, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    if (userId === 'admin') throw new Error('Cannot delete primary Parent Admin account.');
    if (!this.users.has(userId)) throw new Error(`User "${userId}" not found.`);

    this.users.delete(userId);
    delete this.perUserRules[userId];
    if (this.activeUserId === userId) this.activeUserId = 'admin';
    this.save();
    return { ok: true };
  }

  // Global Rules Management
  getGlobalRules() {
    return [...this.globalRules];
  }

  adminSetGlobalRules(rules, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    if (!Array.isArray(rules)) throw new Error('Rules must be an array of strings.');
    this.globalRules = rules.map((r) => String(r).trim()).filter(Boolean);
    this.save();
    return { ok: true, globalRules: this.globalRules };
  }

  getPerUserRules(userId) {
    return this.perUserRules[userId] || [];
  }

  adminSetPerUserRules(userId, rules, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    if (!Array.isArray(rules)) throw new Error('Rules must be an array of strings.');
    this.perUserRules[userId] = rules.map((r) => String(r).trim()).filter(Boolean);
    this.save();
    return { ok: true, rules: this.perUserRules[userId] };
  }

  // Device Power Allocation Matrix
  getDevices() {
    return [...this.devices.values()];
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  adminSetDevicePower(deviceId, deviceConfig = {}, adminPin) {
    if (!this.verifyAdmin(adminPin)) throw new Error('Unauthorized: Invalid Admin PIN.');
    let dev = this.devices.get(deviceId);
    if (!dev) {
      dev = { id: deviceId, name: deviceConfig.name || deviceId, assignedUserId: 'kid', powerTier: 'safe_kid', permissions: { ...POWER_TIERS.safe_kid.permissions }, customRules: [] };
    }

    if (deviceConfig.name) dev.name = String(deviceConfig.name).trim();
    if (deviceConfig.assignedUserId && this.users.has(deviceConfig.assignedUserId)) {
      dev.assignedUserId = deviceConfig.assignedUserId;
    }
    if (deviceConfig.powerTier && POWER_TIERS[deviceConfig.powerTier]) {
      dev.powerTier = deviceConfig.powerTier;
      dev.permissions = { ...POWER_TIERS[deviceConfig.powerTier].permissions, ...(deviceConfig.permissions || {}) };
    }
    if (deviceConfig.permissions && typeof deviceConfig.permissions === 'object') {
      dev.permissions = { ...dev.permissions, ...deviceConfig.permissions };
    }
    if (Array.isArray(deviceConfig.customRules)) {
      dev.customRules = deviceConfig.customRules.map((r) => String(r).trim()).filter(Boolean);
    }

    this.devices.set(deviceId, dev);
    this.save();
    return { ok: true, device: dev };
  }

  // Permission & Capability Checker
  isActionPermitted(actionType, userId = this.activeUserId, deviceId = 'host_pc') {
    const user = this.users.get(userId) || this.users.get('admin');
    const device = this.devices.get(deviceId);

    const userPerms = user.permissions || POWER_TIERS[user.powerTier]?.permissions || {};
    const devPerms = device ? (device.permissions || POWER_TIERS[device.powerTier]?.permissions || {}) : userPerms;

    switch (actionType) {
      case 'terminal':
      case 'run_command':
      case 'shell':
        if (!userPerms.canRunTerminal) {
          return { allowed: false, reason: `Terminal execution is disabled for ${user.name} (${user.powerTier}).` };
        }
        if (device && !devPerms.canRunTerminal) {
          return { allowed: false, reason: `Terminal execution is prohibited on device "${device.name}".` };
        }
        return { allowed: true };

      case 'screen_control':
      case 'click':
      case 'type':
        if (!userPerms.canControlScreen) {
          return { allowed: false, reason: `Screen manipulation (clicks and keystrokes) is disabled for ${user.name}.` };
        }
        if (device && !devPerms.canControlScreen) {
          return { allowed: false, reason: `Screen control is disabled on device "${device.name}".` };
        }
        return { allowed: true };

      case 'vault_access':
      case 'passwords':
        if (!userPerms.canAccessVault) {
          return { allowed: false, reason: `Credential Secret Vault access requires Parent Admin authorization.` };
        }
        return { allowed: true };

      case 'screen_memory':
      case 'total_recall':
        if (!userPerms.canAccessScreenMemory) {
          return { allowed: false, reason: `Total Recall screen visual history is restricted for ${user.name}.` };
        }
        return { allowed: true };

      case 'remote_hands':
      case 'control_other_device':
        if (!userPerms.canControlRemoteDevices) {
          return { allowed: false, reason: `Controlling remote devices as Hands is reserved for Parent Admin.` };
        }
        return { allowed: true };

      case 'purchase':
      case 'payments':
        if (!userPerms.canMakePurchases) {
          return { allowed: false, reason: `Online purchases require Parent Admin authorization.` };
        }
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  // Generates concise, authoritative directives to inject into Mave's reasoning
  generatePromptDirectives(userId = this.activeUserId, deviceId = 'host_pc') {
    const user = this.users.get(userId) || this.users.get('admin');
    const device = this.devices.get(deviceId);
    const tier = user.powerTier || 'standard';
    const tierInfo = POWER_TIERS[tier] || POWER_TIERS.standard;

    const userRules = this.perUserRules[userId] || [];
    const devRules = device ? (device.customRules || []) : [];

    let out = `\n\n=== PARENTAL GOVERNANCE & ACTIVE USER POWERS ===
- Active User: "${user.name}" (Role: ${user.role.toUpperCase()} | Power Tier: ${tierInfo.label})
- Active Device: "${device ? device.name : 'Host PC'}" (Assigned Power: ${device ? device.powerTier : tier})
- Capability Limits:
  • Terminal / PowerShell Commands: ${user.permissions.canRunTerminal ? 'ALLOWED ✅' : 'STRICTLY PROHIBITED ⛔'}
  • Mouse/Keyboard Screen Control: ${user.permissions.canControlScreen ? 'ALLOWED ✅' : 'PROHIBITED ⛔'}
  • Secret Password Vault: ${user.permissions.canAccessVault ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}
  • Screen Memory (Total Recall): ${user.permissions.canAccessScreenMemory ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}`;

    if (user.customInstructions) {
      out += `\n- User's Personal Custom Instructions (Freedom of Customization):
  "${user.customInstructions}"`;
    }

    if (this.globalRules.length > 0) {
      out += `\n- Master Parent Admin Rules (MANDATORY & ABSOLUTE):
${this.globalRules.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}`;
    }

    if (userRules.length > 0) {
      out += `\n- Specific Rules for ${user.name}:
${userRules.map((r, i) => `  • ${r}`).join('\n')}`;
    }

    if (devRules.length > 0) {
      out += `\n- Specific Rules for ${device ? device.name : 'this device'}:
${devRules.map((r, i) => `  • ${r}`).join('\n')}`;
    }

    out += `\nIf the user requests an action prohibited by their power level (such as running terminal commands on a safe_kid profile or accessing passwords), politely decline and state: "This action is restricted by the Parent Admin security policy for your profile."\n=================================================`;

    return out;
  }
}

let singleton = null;
function getGovernanceManager() {
  if (!singleton) singleton = new GovernanceManager();
  return singleton;
}

module.exports = {
  GovernanceManager,
  getGovernanceManager,
  POWER_TIERS,
  DEFAULT_GLOBAL_RULES,
  DEFAULT_USERS,
  DEFAULT_DEVICES,
};
