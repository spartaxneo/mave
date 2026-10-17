'use strict';
// Secure Local Credential Vault with Scoped Permissions (once, 1_day, always).
// Protects passwords and tokens using AES-256-GCM and scoped authorization.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALGORITHM = 'aes-256-gcm';
const sharedMemoryVault = new Map();

class CredentialVault {
  constructor(options = {}) {
    const defaultDir = process.env.BIGFOOT_PROFILE_DIR || path.join(os.homedir(), '.mave');
    this.vaultFile = options.vaultFile || path.join(defaultDir, 'vault.enc');
    this.keyFile = options.keyFile || path.join(defaultDir, 'vault.key');
    this.memoryVault = sharedMemoryVault; // Process-level shared memory for 'once' scope
    this._initKey();
  }

  _initKey() {
    try {
      const dir = path.dirname(this.keyFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.keyFile)) {
        this.masterKey = Buffer.from(fs.readFileSync(this.keyFile, 'utf8').trim(), 'hex');
      } else {
        this.masterKey = crypto.randomBytes(32);
        fs.writeFileSync(this.keyFile, this.masterKey.toString('hex'), { mode: 0o600 });
      }
    } catch {
      this.masterKey = crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest();
    }
  }

  _encrypt(data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    let enc = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { iv: iv.toString('hex'), authTag, data: enc };
  }

  _decrypt(payload) {
    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    let dec = decipher.update(payload.data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
  }

  _loadPersistent() {
    try {
      if (!fs.existsSync(this.vaultFile)) return {};
      const payload = JSON.parse(fs.readFileSync(this.vaultFile, 'utf8'));
      return this._decrypt(payload);
    } catch {
      return {};
    }
  }

  _savePersistent(items) {
    try {
      const dir = path.dirname(this.vaultFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const enc = this._encrypt(items);
      fs.writeFileSync(this.vaultFile, JSON.stringify(enc), { mode: 0o600 });
    } catch (err) {
      console.error('Failed to save persistent vault:', err.message);
    }
  }

  /**
   * Grant and store credential with explicit permission scope:
   * - 'once': In volatile memory only, erased immediately after single use.
   * - '1_day': Stored persistently, auto-invalidated after 24 hours.
   * - 'always': Stored persistently until manually revoked.
   */
  grantPermission({ service, username, secret, scope = 'once' }) {
    if (!service || !secret) throw new Error('Service name and secret/password are required.');
    const validScopes = ['once', '1_day', 'always'];
    const selectedScope = validScopes.includes(scope) ? scope : 'once';

    const now = Date.now();
    let expiresAt = null;
    if (selectedScope === '1_day') {
      expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
    }

    const entry = {
      service: service.toLowerCase().trim(),
      username: String(username || '').trim(),
      secret: String(secret),
      scope: selectedScope,
      createdAt: now,
      expiresAt,
    };

    if (selectedScope === 'once') {
      this.memoryVault.set(entry.service, entry);
      return { ok: true, service: entry.service, scope: 'once', message: 'Granted for single execution (volatile memory).' };
    }

    const persistent = this._loadPersistent();
    persistent[entry.service] = entry;
    this._savePersistent(persistent);
    return {
      ok: true,
      service: entry.service,
      scope: selectedScope,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'Never (Permanent)',
      message: selectedScope === '1_day' ? 'Granted for 24 hours.' : 'Granted indefinitely until revoked.'
    };
  }

  /**
   * Retrieve credential if permission is valid and active.
   */
  getCredential(service) {
    const key = String(service || '').toLowerCase().trim();
    if (!key) return null;

    // Check 'once' memory vault first
    if (this.memoryVault.has(key)) {
      const entry = this.memoryVault.get(key);
      this.memoryVault.delete(key); // WIPE immediately after single use
      return {
        username: entry.username,
        secret: entry.secret,
        scope: 'once',
        consumed: true
      };
    }

    // Check persistent vault
    const persistent = this._loadPersistent();
    const entry = persistent[key];
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete persistent[key];
      this._savePersistent(persistent);
      return null; // Expired
    }

    return {
      username: entry.username,
      secret: entry.secret,
      scope: entry.scope,
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null
    };
  }

  /**
   * Revoke permission for a service.
   */
  revokePermission(service) {
    const key = String(service || '').toLowerCase().trim();
    this.memoryVault.delete(key);
    const persistent = this._loadPersistent();
    const existed = Boolean(persistent[key]);
    if (existed) {
      delete persistent[key];
      this._savePersistent(persistent);
    }
    return { ok: true, service: key, revoked: existed };
  }

  /**
   * List active granted permissions without revealing passwords.
   */
  listPermissions() {
    const list = [];
    const now = Date.now();

    for (const [key, val] of this.memoryVault.entries()) {
      list.push({ service: key, username: val.username, scope: 'once', status: 'Active (Single Use Pending)' });
    }

    const persistent = this._loadPersistent();
    for (const [key, val] of Object.entries(persistent)) {
      if (val.expiresAt && now > val.expiresAt) continue;
      list.push({
        service: key,
        username: val.username,
        scope: val.scope,
        expiresAt: val.expiresAt ? new Date(val.expiresAt).toISOString() : 'Never',
        status: 'Active'
      });
    }

    return list;
  }
}

module.exports = { CredentialVault };
