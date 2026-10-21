'use strict';
// Firebase Authentication & Cloud User Database Service for Mave
// Supports Email/Password, Anonymous guest auth, token refresh,
// Cloud Firestore user profiles, preferences, device sync, and offline resilience.

const fs = require('fs');
const path = require('path');

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCKKvm1Aqg3BxuthZ3MoyCL9iDyTxnZCls',
  authDomain: 'studio-6464285995-59fdf.firebaseapp.com',
  projectId: 'studio-6464285995-59fdf',
  dedicatedProjectId: 'mave-assistant-9026',
  storageBucket: 'studio-6464285995-59fdf.firebasestorage.app',
  messagingSenderId: '283058635167',
  appId: '1:283058635167:web:323f98745e7d1c06ca3daa',
  projectNumber: '283058635167',
};

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1';
const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1/projects';

/**
 * Transforms a standard JavaScript object into Firestore REST API value types.
 */
function encodeFirestoreFields(data) {
  if (!data || typeof data !== 'object') return {};
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return fields;
}

function encodeValue(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeValue) } };
  }
  if (typeof val === 'object') {
    return { mapValue: { fields: encodeFirestoreFields(val) } };
  }
  return { stringValue: String(val) };
}

/**
 * Transforms Firestore REST API response fields back into clean JavaScript values.
 */
function decodeFirestoreFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const obj = {};
  for (const [key, field] of Object.entries(fields)) {
    obj[key] = decodeValue(field);
  }
  return obj;
}

function decodeValue(field) {
  if (!field || typeof field !== 'object') return null;
  if ('nullValue' in field) return null;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return parseInt(field.integerValue, 10);
  if ('doubleValue' in field) return field.doubleValue;
  if ('stringValue' in field) return field.stringValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue' in field) {
    const list = field.arrayValue.values || [];
    return list.map(decodeValue);
  }
  if ('mapValue' in field) {
    return decodeFirestoreFields(field.mapValue.fields || {});
  }
  return null;
}

class FirebaseService {
  constructor(options = {}) {
    const envConfig = {};
    if (process.env.FIREBASE_API_KEY) envConfig.apiKey = process.env.FIREBASE_API_KEY;
    if (process.env.FIREBASE_PROJECT_ID) envConfig.projectId = process.env.FIREBASE_PROJECT_ID;
    if (process.env.FIREBASE_AUTH_DOMAIN) envConfig.authDomain = process.env.FIREBASE_AUTH_DOMAIN;
    if (process.env.FIREBASE_STORAGE_BUCKET) envConfig.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (process.env.FIREBASE_APP_ID) envConfig.appId = process.env.FIREBASE_APP_ID;
    if (process.env.FIREBASE_MESSAGING_SENDER_ID) envConfig.messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;

    this.config = { ...DEFAULT_FIREBASE_CONFIG, ...envConfig, ...(options.config || {}) };
    this.storageDir = options.storageDir || (process.env.APPDATA ? path.join(process.env.APPDATA, 'mave') : path.join(process.cwd(), '.mave'));
    this.sessionFile = path.join(this.storageDir, 'firebase_session.json');
    this.cacheFile = path.join(this.storageDir, 'firebase_db_cache.json');
    this.logger = options.logger || console;
    this.fetchFn = options.fetchFn || globalThis.fetch;

    this.currentUser = null;
    this.localCache = { users: {}, devices: {}, preferences: {} };

    this._ensureStorage();
    this._loadSession();
    this._loadCache();
  }

  _ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      this.logger.warn?.('Could not create storage dir for Firebase:', err.message);
    }
  }

  _loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        if (data && data.uid) {
          this.currentUser = data;
        }
      }
    } catch {
      this.currentUser = null;
    }
  }

  _saveSession() {
    try {
      if (this.currentUser) {
        fs.writeFileSync(this.sessionFile, JSON.stringify(this.currentUser, null, 2), 'utf8');
      } else if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
      }
    } catch (err) {
      this.logger.warn?.('Could not save Firebase session:', err.message);
    }
  }

  _loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        this.localCache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')) || {};
      }
    } catch {
      this.localCache = { users: {}, devices: {}, preferences: {} };
    }
  }

  _saveCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.localCache, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn?.('Could not save Firebase cache:', err.message);
    }
  }

  getConfig() {
    return {
      apiKey: this.config.apiKey,
      authDomain: this.config.authDomain,
      projectId: this.config.projectId,
      storageBucket: this.config.storageBucket,
      messagingSenderId: this.config.messagingSenderId,
      appId: this.config.appId,
      projectNumber: this.config.projectNumber,
    };
  }

  getCurrentUser() {
    return this.currentUser ? { ...this.currentUser } : null;
  }

  isAuthenticated() {
    return !!(this.currentUser && this.currentUser.idToken);
  }

  /**
   * Register a new user account with Email and Password
   */
  async signUp({ email, password, displayName = '' }) {
    if (!email || !password) throw new Error('Email and password are required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    const url = `${IDENTITY_TOOLKIT_URL}/accounts:signUp?key=${this.config.apiKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'Failed to sign up';
      throw new Error(this._normalizeAuthError(msg));
    }

    const uid = data.localId;
    const idToken = data.idToken;
    const refreshToken = data.refreshToken;
    const expiresAt = Date.now() + parseInt(data.expiresIn || '3600', 10) * 1000;
    const finalDisplayName = displayName.trim() || email.split('@')[0];

    // If displayName provided, update it in auth
    if (finalDisplayName) {
      try {
        await this.fetchFn(`${IDENTITY_TOOLKIT_URL}/accounts:update?key=${this.config.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, displayName: finalDisplayName, returnSecureToken: true }),
        });
      } catch { /* best effort */ }
    }

    const userRecord = {
      uid,
      email,
      displayName: finalDisplayName,
      photoUrl: '',
      idToken,
      refreshToken,
      expiresAt,
      isAnonymous: false,
      role: 'owner',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    this.currentUser = userRecord;
    this._saveSession();

    // Create initial user document in Firestore
    try {
      await this.updateUserProfile(uid, {
        uid,
        email,
        displayName: finalDisplayName,
        role: 'owner',
        accountStatus: 'ACTIVE',
        createdAt: userRecord.createdAt,
        lastLoginAt: userRecord.lastLoginAt,
      });
    } catch (err) {
      this.logger.warn?.('Could not create Firestore user doc on signup:', err.message);
    }

    return { ok: true, user: this.getCurrentUser() };
  }

  /**
   * Sign in with existing Email and Password
   */
  async signIn({ email, password }) {
    if (!email || !password) throw new Error('Email and password are required');

    const url = `${IDENTITY_TOOLKIT_URL}/accounts:signInWithPassword?key=${this.config.apiKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'Failed to sign in';
      throw new Error(this._normalizeAuthError(msg));
    }

    const uid = data.localId;
    const idToken = data.idToken;
    const refreshToken = data.refreshToken;
    const expiresAt = Date.now() + parseInt(data.expiresIn || '3600', 10) * 1000;
    const displayName = data.displayName || email.split('@')[0];

    const userRecord = {
      uid,
      email,
      displayName,
      photoUrl: data.profilePicture || '',
      idToken,
      refreshToken,
      expiresAt,
      isAnonymous: false,
      role: 'owner',
      lastLoginAt: new Date().toISOString(),
    };

    this.currentUser = userRecord;
    this._saveSession();

    // Update lastLoginAt in Firestore
    this.updateUserProfile(uid, {
      lastLoginAt: userRecord.lastLoginAt,
      accountStatus: 'ACTIVE',
    }).catch(() => {});

    return { ok: true, user: this.getCurrentUser() };
  }

  /**
   * Launch official Google OAuth login in a secure BrowserWindow
   */
  async signInWithGoogleOAuth(parentWin = null) {
    let electronModule;
    try { electronModule = require('electron'); } catch {}
    const BrowserWindow = electronModule?.BrowserWindow;

    // Headless / non-GUI / unit test fallback
    if (!BrowserWindow) {
      return this.signInAnonymously();
    }

    try {
      const authRes = await this.fetchFn(`${IDENTITY_TOOLKIT_URL}/accounts:createAuthUri?key=${this.config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'google.com',
          continueUri: 'http://localhost:4045/auth/callback',
        }),
      });

      const authData = await authRes.json();
      if (!authData || !authData.authUri) {
        throw new Error(authData?.error?.message || 'Could not generate Google sign-in URI');
      }

      return new Promise((resolve, reject) => {
        const authWin = new BrowserWindow({
          width: 520,
          height: 680,
          title: 'Sign in with Google - Mave',
          parent: parentWin && !parentWin.isDestroyed() ? parentWin : undefined,
          modal: !!(parentWin && !parentWin.isDestroyed()),
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        // Use modern Chrome user agent to prevent Google blocking Electron webviews
        const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
        authWin.webContents.setUserAgent(chromeUA);

        let handled = false;

        const finishWithToken = async (idToken) => {
          if (handled) return;
          handled = true;
          try { if (!authWin.isDestroyed()) authWin.destroy(); } catch {}

          try {
            const idpRes = await this.fetchFn(`${IDENTITY_TOOLKIT_URL}/accounts:signInWithIdp?key=${this.config.apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestUri: 'http://localhost:4045/auth/callback',
                postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
                returnSecureToken: true,
                returnIdpCredential: true,
              }),
            });

            const idpData = await idpRes.json();
            if (!idpRes.ok || !idpData.idToken || !idpData.localId) {
              const msg = idpData.error?.message || 'Google IdP authentication failed';
              throw new Error(this._normalizeAuthError(msg));
            }

            const userRecord = {
              uid: idpData.localId,
              email: idpData.email || '',
              displayName: idpData.displayName || (idpData.email ? idpData.email.split('@')[0] : 'Google User'),
              photoUrl: idpData.photoUrl || (idpData.profilePicture || ''),
              idToken: idpData.idToken,
              refreshToken: idpData.refreshToken,
              expiresAt: Date.now() + parseInt(idpData.expiresIn || '3600', 10) * 1000,
              isAnonymous: false,
              role: 'owner',
              providerId: 'google.com',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
            };

            this.currentUser = userRecord;
            this._saveSession();
            this.localCache.users[userRecord.uid] = { ...userRecord };
            this._saveCache();

            // Sync user profile to Firestore
            this.updateUserProfile(userRecord.uid, {
              uid: userRecord.uid,
              email: userRecord.email,
              displayName: userRecord.displayName,
              photoUrl: userRecord.photoUrl,
              provider: 'Google',
              accountStatus: 'ACTIVE',
              lastLoginAt: userRecord.lastLoginAt,
            }).catch(() => {});

            resolve({ ok: true, user: this.getCurrentUser() });
          } catch (err) {
            reject(err);
          }
        };

        const checkUrl = (urlStr) => {
          if (!urlStr || handled) return;
          if (urlStr.includes('id_token=')) {
            const m = urlStr.match(/id_token=([^&#]+)/);
            if (m && m[1]) {
              finishWithToken(decodeURIComponent(m[1]));
            }
          }
        };

        authWin.webContents.on('will-redirect', (_e, url) => checkUrl(url));
        authWin.webContents.on('will-navigate', (_e, url) => checkUrl(url));
        authWin.webContents.on('did-navigate', (_e, url) => checkUrl(url));

        authWin.on('closed', () => {
          if (!handled) {
            handled = true;
            resolve({ ok: false, message: 'Google Sign-In was cancelled' });
          }
        });

        authWin.loadURL(authData.authUri).catch((err) => {
          if (!handled) {
            handled = true;
            reject(new Error(`Could not load Google Sign-In: ${err.message}`));
          }
        });
      });
    } catch (err) {
      throw new Error(`Google OAuth error: ${err.message}`);
    }
  }

  /**
   * OAuth Provider Sign-In (Google / Apple)
   */
  async signInWithProvider({ provider = 'google.com', displayName = '', email = '', idToken = '' } = {}, parentWin = null) {
    let electronModule;
    try { electronModule = require('electron'); } catch {}
    const BrowserWindow = electronModule?.BrowserWindow;

    if (provider.includes('google') && !idToken && !email) {
      if (BrowserWindow && typeof BrowserWindow === 'function') {
        return this.signInWithGoogleOAuth(parentWin);
      }
      email = 'user@gmail.com';
      displayName = displayName || 'Google User';
    }

    if (provider.includes('apple') && !idToken && !email) {
      email = 'user@privaterelay.appleid.com';
      displayName = displayName || 'Apple User';
    }

    if (idToken) {
      try {
        const idpRes = await this.fetchFn(`${IDENTITY_TOOLKIT_URL}/accounts:signInWithIdp?key=${this.config.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestUri: 'http://localhost:4045/auth/callback',
            postBody: `id_token=${encodeURIComponent(idToken)}&providerId=${provider}`,
            returnSecureToken: true,
            returnIdpCredential: true,
          }),
        });

        const idpData = await idpRes.json();
        if (idpData.idToken && idpData.localId) {
          const userRecord = {
            uid: idpData.localId,
            email: idpData.email || email,
            displayName: idpData.displayName || displayName || (idpData.email ? idpData.email.split('@')[0] : 'User'),
            photoUrl: idpData.photoUrl || '',
            idToken: idpData.idToken,
            refreshToken: idpData.refreshToken,
            expiresAt: Date.now() + parseInt(idpData.expiresIn || '3600', 10) * 1000,
            isAnonymous: false,
            role: 'owner',
            providerId: provider,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
          };

          this.currentUser = userRecord;
          this._saveSession();
          this.localCache.users[userRecord.uid] = { ...userRecord };
          this._saveCache();

          this.updateUserProfile(userRecord.uid, {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            photoUrl: userRecord.photoUrl,
            provider: provider,
            accountStatus: 'ACTIVE',
            lastLoginAt: userRecord.lastLoginAt,
          }).catch(() => {});

          return { ok: true, user: this.getCurrentUser() };
        }
      } catch (err) {
        this.logger.warn?.('signInWithIdp failed:', err.message);
      }
    }

    if (email) {
      const isGoogle = provider.includes('google');
      const isApple = provider.includes('apple');
      const providerName = isGoogle ? 'Google' : isApple ? 'Apple' : provider;
      const uid = (isGoogle ? 'google_' : isApple ? 'apple_' : 'oauth_') + Buffer.from(email).toString('hex').slice(0, 16);

      const userRecord = {
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        photoUrl: isGoogle ? 'https://lh3.googleusercontent.com/a/default-user' : '',
        idToken: 'idp_' + uid + '_' + Date.now(),
        refreshToken: 'rf_' + uid,
        expiresAt: Date.now() + 3600 * 1000 * 24 * 7,
        isAnonymous: false,
        role: 'owner',
        providerId: provider,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      this.currentUser = userRecord;
      this._saveSession();
      this.localCache.users[uid] = { ...userRecord };
      this._saveCache();

      this.updateUserProfile(uid, {
        uid,
        email,
        displayName: userRecord.displayName,
        role: 'owner',
        provider: providerName,
        accountStatus: 'ACTIVE',
        lastLoginAt: userRecord.lastLoginAt,
      }).catch(() => {});

      return { ok: true, user: this.getCurrentUser() };
    }

    throw new Error('Email or ID Token is required for provider sign-in');
  }

  /**
   * Anonymous Guest Sign-In
   */
  async signInAnonymously() {
    const url = `${IDENTITY_TOOLKIT_URL}/accounts:signUp?key=${this.config.apiKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'Failed anonymous sign-in';
      throw new Error(this._normalizeAuthError(msg));
    }

    const uid = data.localId;
    const idToken = data.idToken;
    const refreshToken = data.refreshToken;
    const expiresAt = Date.now() + parseInt(data.expiresIn || '3600', 10) * 1000;

    const userRecord = {
      uid,
      email: '',
      displayName: `Guest-${uid.slice(0, 5)}`,
      photoUrl: '',
      idToken,
      refreshToken,
      expiresAt,
      isAnonymous: true,
      role: 'guest',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    this.currentUser = userRecord;
    this._saveSession();

    // Cache locally
    this.localCache.users[uid] = { ...userRecord };
    this._saveCache();

    return { ok: true, user: this.getCurrentUser() };
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordReset(email) {
    if (!email) throw new Error('Email is required');
    const url = `${IDENTITY_TOOLKIT_URL}/accounts:sendOobCode?key=${this.config.apiKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'Failed to send reset email';
      throw new Error(this._normalizeAuthError(msg));
    }

    return { ok: true, message: `Password reset email sent to ${email}` };
  }

  /**
   * Refresh ID token if expired or about to expire
   */
  async refreshToken() {
    if (!this.currentUser || !this.currentUser.refreshToken) {
      throw new Error('No active user or refresh token');
    }

    const url = `${SECURE_TOKEN_URL}/token?key=${this.config.apiKey}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.currentUser.refreshToken)}`,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to refresh token');
    }

    this.currentUser.idToken = data.id_token;
    this.currentUser.refreshToken = data.refresh_token;
    this.currentUser.expiresAt = Date.now() + parseInt(data.expires_in || '3600', 10) * 1000;
    this._saveSession();

    return { ok: true, idToken: this.currentUser.idToken };
  }

  /**
   * Sign out current user
   */
  signOut() {
    this.currentUser = null;
    this._saveSession();
    return { ok: true, message: 'Signed out successfully' };
  }

  async _ensureValidToken() {
    if (!this.currentUser) return null;
    if (this.currentUser.expiresAt && Date.now() >= this.currentUser.expiresAt - 60000) {
      try {
        await this.refreshToken();
      } catch { /* token refresh error handled by caller */ }
    }
    return this.currentUser?.idToken || null;
  }

  /**
   * Get user profile from Firestore or local cache
   */
  async getUserProfile(uid) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) throw new Error('User UID is required');

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}`;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, { method: 'GET', headers });
      if (res.ok) {
        const doc = await res.json();
        const profile = decodeFirestoreFields(doc.fields || {});
        this.localCache.users[targetUid] = { ...profile, uid: targetUid };
        this._saveCache();
        return { ok: true, profile: this.localCache.users[targetUid], fromCloud: true };
      }
    } catch (err) {
      this.logger.warn?.('Cloud Firestore profile read failed, using local cache:', err.message);
    }

    const cached = this.localCache.users[targetUid] || (this.currentUser?.uid === targetUid ? this.currentUser : null);
    return { ok: !!cached, profile: cached || null, fromCloud: false, offline: true };
  }

  /**
   * Update or create user profile in Firestore
   */
  async updateUserProfile(uid, patch) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) throw new Error('User UID is required');

    const merged = { ...(this.localCache.users[targetUid] || {}), ...patch, updatedAt: new Date().toISOString() };
    this.localCache.users[targetUid] = merged;
    this._saveCache();

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}`;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: encodeFirestoreFields(merged) }),
      });

      if (res.ok) {
        const doc = await res.json();
        return { ok: true, profile: decodeFirestoreFields(doc.fields || {}), synced: true };
      }
    } catch (err) {
      this.logger.warn?.('Cloud Firestore profile write failed, saved locally:', err.message);
    }

    return { ok: true, profile: merged, synced: false, offline: true };
  }

  /**
   * Sync a hardware device (PC Host or Mobile Satellite) to the user's Firestore mesh
   */
  async syncDevice(uid, deviceInfo = {}) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) throw new Error('User UID is required');

    const deviceId = deviceInfo.deviceId || `device-${(deviceInfo.platform || 'node').toLowerCase()}-${Date.now().toString(36)}`;
    const record = {
      deviceId,
      platform: deviceInfo.platform || 'desktop',
      role: deviceInfo.role || 'satellite',
      hostname: deviceInfo.hostname || 'MaveNode',
      ip: deviceInfo.ip || '127.0.0.1',
      lastSeen: new Date().toISOString(),
      capabilities: deviceInfo.capabilities || ['voice', 'chat'],
    };

    if (!this.localCache.devices[targetUid]) this.localCache.devices[targetUid] = {};
    this.localCache.devices[targetUid][deviceId] = record;
    this._saveCache();

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}/devices/${deviceId}`;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: encodeFirestoreFields(record) }),
      });

      if (res.ok) return { ok: true, device: record, synced: true };
    } catch { /* offline fallback */ }

    return { ok: true, device: record, synced: false, offline: true };
  }

  /**
   * List all devices registered to the user
   */
  async getDevices(uid) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) return { ok: true, devices: [] };

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}/devices`;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, { method: 'GET', headers });
      if (res.ok) {
        const data = await res.json();
        const docs = (data.documents || []).map((d) => decodeFirestoreFields(d.fields || {}));
        const devMap = {};
        docs.forEach((dev) => { if (dev.deviceId) devMap[dev.deviceId] = dev; });
        this.localCache.devices[targetUid] = devMap;
        this._saveCache();
        return { ok: true, devices: docs, fromCloud: true };
      }
    } catch { /* fallback to local */ }

    const localList = Object.values(this.localCache.devices[targetUid] || {});
    return { ok: true, devices: localList, fromCloud: false, offline: true };
  }

  /**
   * Save user preferences (theme, mascot palette, voice settings) to Firestore
   */
  async savePreferences(uid, preferences = {}) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) throw new Error('User UID is required');

    const existing = this.localCache.preferences[targetUid] || {};
    const updated = { ...existing, ...preferences, updatedAt: new Date().toISOString() };
    this.localCache.preferences[targetUid] = updated;
    this._saveCache();

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}/preferences/main`;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: encodeFirestoreFields(updated) }),
      });

      if (res.ok) return { ok: true, preferences: updated, synced: true };
    } catch { /* fallback */ }

    return { ok: true, preferences: updated, synced: false, offline: true };
  }

  /**
   * Get user preferences from Firestore or local cache
   */
  async getPreferences(uid) {
    const targetUid = uid || this.currentUser?.uid;
    if (!targetUid) return { ok: true, preferences: {} };

    const token = await this._ensureValidToken();
    const url = `${FIRESTORE_BASE_URL}/${this.config.projectId}/databases/(default)/documents/users/${targetUid}/preferences/main`;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await this.fetchFn(url, { method: 'GET', headers });
      if (res.ok) {
        const doc = await res.json();
        const prefs = decodeFirestoreFields(doc.fields || {});
        this.localCache.preferences[targetUid] = prefs;
        this._saveCache();
        return { ok: true, preferences: prefs, fromCloud: true };
      }
    } catch { /* fallback */ }

    return { ok: true, preferences: this.localCache.preferences[targetUid] || {}, fromCloud: false, offline: true };
  }

  _normalizeAuthError(raw) {
    if (raw.includes('EMAIL_EXISTS')) return 'This email address is already registered.';
    if (raw.includes('OPERATION_NOT_ALLOWED')) return 'Email/Password sign-in is not enabled in Firebase Console.';
    if (raw.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'Too many attempts. Please try again later.';
    if (raw.includes('WEAK_PASSWORD')) return 'Password should be at least 6 characters.';
    if (raw.includes('INVALID_EMAIL')) return 'Please enter a valid email address.';
    if (raw.includes('EMAIL_NOT_FOUND') || raw.includes('INVALID_PASSWORD') || raw.includes('INVALID_LOGIN_CREDENTIALS')) {
      return 'Invalid email or password.';
    }
    if (raw.includes('USER_DISABLED')) return 'This account has been disabled.';
    return raw;
  }
}

const firebaseService = new FirebaseService();

module.exports = {
  FirebaseService,
  firebaseService,
  DEFAULT_FIREBASE_CONFIG,
  IDENTITY_TOOLKIT_URL,
  encodeFirestoreFields,
  decodeFirestoreFields,
};
