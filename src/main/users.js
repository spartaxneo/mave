'use strict';
// Multi-User, Workspace & Organization Management Engine for Mave
// Allows the Host PC to act as a Private Local AI Server, add users/team members,
// manage granular roles (Owner, Admin, Member, Guest), generate invite links,
// issue OpenAI-compatible API keys, and sync with Firebase Cloud User Database.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { firebaseService } = require('./firebase');

const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
};

const ROLE_PERMISSIONS = {
  owner: ['admin', 'models_manage', 'server_power', 'hands_control', 'voice', 'chat', 'invite_users', 'view_metrics'],
  admin: ['models_manage', 'hands_control', 'voice', 'chat', 'invite_users', 'view_metrics'],
  member: ['voice', 'chat', 'memory_personal'],
  guest: ['chat'],
};

class UserManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || (process.env.APPDATA ? path.join(process.env.APPDATA, 'mave') : path.join(process.cwd(), '.mave'));
    this.dataFile = path.join(this.storageDir, 'mave_users.json');
    this.logger = options.logger || console;

    this.hostInfo = {
      hostId: `host-${crypto.randomBytes(4).toString('hex')}`,
      hostname: osHostname(),
      createdAt: new Date().toISOString(),
      serverPort: options.port || 4040,
      httpsPort: options.httpsPort || 4043,
      serverEnabled: true,
      publicAccessEnabled: false,
    };

    this.users = new Map();
    this.invites = new Map();
    this.apiKeys = new Map();

    this._ensureStorage();
    this._load();
  }

  _ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      this.logger.warn?.('Could not create storage dir for UserManager:', err.message);
    }
  }

  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        if (raw.hostInfo) this.hostInfo = { ...this.hostInfo, ...raw.hostInfo };

        if (Array.isArray(raw.users)) {
          for (const u of raw.users) this.users.set(u.id, u);
        }

        if (Array.isArray(raw.invites)) {
          for (const inv of raw.invites) this.invites.set(inv.token, inv);
        }

        if (Array.isArray(raw.apiKeys)) {
          for (const k of raw.apiKeys) this.apiKeys.set(k.key, k);
        }
      }
    } catch (err) {
      this.logger.warn?.('Could not read user data file, creating defaults:', err.message);
    }

    // Ensure default host owner exists
    if (this.users.size === 0) {
      const defaultOwner = {
        id: 'user-owner-root',
        email: 'owner@mave.local',
        displayName: 'Host Owner (Root)',
        role: ROLES.OWNER,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        isLocalRoot: true,
        quotaPerDay: -1, // Unlimited
        devices: [],
      };
      this.users.set(defaultOwner.id, defaultOwner);
      this._save();
    }
  }

  _save() {
    try {
      const data = {
        hostInfo: this.hostInfo,
        users: Array.from(this.users.values()),
        invites: Array.from(this.invites.values()),
        apiKeys: Array.from(this.apiKeys.values()),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn?.('Could not save user data file:', err.message);
    }
  }

  getHostInfo() {
    return {
      ...this.hostInfo,
      totalUsers: this.users.size,
      activeUsers: Array.from(this.users.values()).filter((u) => {
        if (!u.lastActiveAt) return false;
        return (Date.now() - new Date(u.lastActiveAt).getTime()) < 3600000; // 1 hour
      }).length,
    };
  }

  updateHostSettings(patch = {}) {
    this.hostInfo = { ...this.hostInfo, ...patch, updatedAt: new Date().toISOString() };
    this._save();
    return this.getHostInfo();
  }

  /**
   * List all users / members in this local server
   */
  listUsers() {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      isLocalRoot: !!u.isLocalRoot,
      deviceCount: (u.devices || []).length,
      quotaPerDay: u.quotaPerDay,
    }));
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  getUserByEmail(email) {
    if (!email) return null;
    const clean = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase().trim() === clean) return u;
    }
    return null;
  }

  /**
   * Add a new member / user to the local server
   */
  async addUser({ email, displayName, role = ROLES.MEMBER, quotaPerDay = 1000 }) {
    if (!email) throw new Error('User email is required');
    const existing = this.getUserByEmail(email);
    if (existing) throw new Error('A user with this email already exists');

    const cleanRole = Object.values(ROLES).includes(role) ? role : ROLES.MEMBER;
    const userId = `usr-${crypto.randomBytes(6).toString('hex')}`;
    const userRecord = {
      id: userId,
      email: email.trim(),
      displayName: displayName?.trim() || email.split('@')[0],
      role: cleanRole,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      quotaPerDay: Number(quotaPerDay) || 1000,
      devices: [],
    };

    this.users.set(userId, userRecord);
    this._save();

    // Sync to Cloud Firestore if authenticated
    try {
      const activeUser = firebaseService.getCurrentUser();
      if (activeUser && activeUser.uid) {
        await firebaseService.updateUserProfile(activeUser.uid, {
          [`teamMembers.${userId}`]: {
            email: userRecord.email,
            displayName: userRecord.displayName,
            role: userRecord.role,
            addedAt: userRecord.createdAt,
          },
        });
      }
    } catch (err) {
      this.logger.warn?.('Could not sync user to Firestore:', err.message);
    }

    return { ok: true, user: userRecord };
  }

  /**
   * Update a user's role
   */
  updateUserRole(userId, newRole) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (user.isLocalRoot && newRole !== ROLES.OWNER) {
      throw new Error('Cannot change role of primary Host Owner');
    }
    if (!Object.values(ROLES).includes(newRole)) throw new Error('Invalid role');

    user.role = newRole;
    user.updatedAt = new Date().toISOString();
    this.users.set(userId, user);
    this._save();

    return { ok: true, user };
  }

  /**
   * Remove a user from the local server
   */
  removeUser(userId) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (user.isLocalRoot) throw new Error('Cannot remove primary Host Owner');

    this.users.delete(userId);

    // Remove any API keys belonging to user
    for (const [key, k] of this.apiKeys.entries()) {
      if (k.userId === userId) this.apiKeys.delete(key);
    }

    this._save();
    return { ok: true, message: `User ${user.email} removed` };
  }

  /**
   * Generate an invite link for sharing
   */
  createInviteLink({ role = ROLES.MEMBER, expiresInDays = 7, maxUses = 5 } = {}) {
    const token = `mv-inv-${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + (expiresInDays * 86400000);

    const inviteRecord = {
      token,
      role: Object.values(ROLES).includes(role) ? role : ROLES.MEMBER,
      expiresAt,
      maxUses,
      usedCount: 0,
      createdAt: new Date().toISOString(),
    };

    this.invites.set(token, inviteRecord);
    this._save();

    return {
      ok: true,
      token,
      invite: inviteRecord,
    };
  }

  verifyInvite(token) {
    if (!token) return { ok: false, error: 'Token is required' };
    const inv = this.invites.get(token);
    if (!inv) return { ok: false, error: 'Invalid or expired invite token' };
    if (Date.now() > inv.expiresAt) {
      this.invites.delete(token);
      this._save();
      return { ok: false, error: 'This invite link has expired' };
    }
    if (inv.maxUses > 0 && inv.usedCount >= inv.maxUses) {
      return { ok: false, error: 'This invite link has reached its maximum uses' };
    }
    return { ok: true, invite: inv };
  }

  /**
   * Accept an invite and register as a member
   */
  async acceptInvite(token, { email, displayName, deviceName = 'Satellite Device' } = {}) {
    const check = this.verifyInvite(token);
    if (!check.ok) throw new Error(check.error);

    const inv = check.invite;
    let user = this.getUserByEmail(email);

    if (!user) {
      const added = await this.addUser({
        email,
        displayName,
        role: inv.role,
      });
      user = added.user;
    } else {
      user.lastActiveAt = new Date().toISOString();
    }

    // Register device
    const deviceId = `dev-${crypto.randomBytes(4).toString('hex')}`;
    const deviceRecord = {
      deviceId,
      name: deviceName,
      enrolledAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    if (!user.devices) user.devices = [];
    user.devices.push(deviceRecord);
    this.users.set(user.id, user);

    inv.usedCount++;
    this.invites.set(token, inv);

    // Generate member session token
    const memberToken = `mv-sess-${crypto.randomBytes(24).toString('hex')}`;
    const apiKey = this.createApiKey({ userId: user.id, label: `${deviceName} Access Key` }).key;

    this._save();

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      memberToken,
      apiKey,
      device: deviceRecord,
    };
  }

  /**
   * Generate an OpenAI-compatible API key (sk-mave-...)
   */
  createApiKey({ userId, label = 'Default API Key' }) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    const key = `sk-mave-${crypto.randomBytes(24).toString('hex')}`;
    const record = {
      key,
      userId,
      userEmail: user.email,
      label,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      active: true,
    };

    this.apiKeys.set(key, record);
    this._save();

    return { ok: true, key, label, createdAt: record.createdAt };
  }

  listApiKeys(userId) {
    const list = [];
    for (const [key, k] of this.apiKeys.entries()) {
      if (k.userId === userId) {
        list.push({
          keyMasked: `${key.slice(0, 11)}…${key.slice(-4)}`,
          key,
          label: k.label,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
          active: k.active,
        });
      }
    }
    return list;
  }

  revokeApiKey(key) {
    if (!this.apiKeys.has(key)) throw new Error('API key not found');
    this.apiKeys.delete(key);
    this._save();
    return { ok: true, message: 'API key revoked' };
  }

  verifyApiKey(candidateKey) {
    if (!candidateKey) return null;
    const cleanKey = candidateKey.replace(/^Bearer\s+/i, '').trim();
    const record = this.apiKeys.get(cleanKey);
    if (!record || !record.active) return null;

    record.lastUsedAt = new Date().toISOString();
    this.apiKeys.set(cleanKey, record);

    const user = this.users.get(record.userId);
    if (user) {
      user.lastActiveAt = new Date().toISOString();
      this.users.set(user.id, user);
    }

    return {
      apiKey: record,
      user: user || { id: record.userId, email: record.userEmail, role: ROLES.MEMBER },
    };
  }
}

function osHostname() {
  try {
    const os = require('os');
    return os.hostname() || 'Mave-Host-PC';
  } catch {
    return 'Mave-Host-PC';
  }
}

const userManager = new UserManager();

module.exports = {
  UserManager,
  userManager,
  ROLES,
  ROLE_PERMISSIONS,
};
