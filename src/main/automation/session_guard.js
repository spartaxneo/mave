'use strict';

const EventEmitter = require('events');
const { execSync } = require('child_process');

class SessionGuard extends EventEmitter {
  constructor(options = {}) {
    super();
    this.locked = false;
    this.state = 'active'; // 'active' | 'locked' | 'disconnected'
    this.mockLocked = null;
    this.mockState = null;
    this.lastCheck = 0;
    this.cacheTtlMs = options.cacheTtlMs || 500;

    this._initElectronListener();
  }

  _initElectronListener() {
    try {
      const electron = require('electron');
      const pm = electron?.powerMonitor;
      if (pm && typeof pm.on === 'function') {
        pm.on('lock-screen', () => {
          this._setState('locked', true);
        });
        pm.on('unlock-screen', () => {
          this._setState('active', false);
        });
      }
    } catch {
      // Stubbed or plain Node environment
    }
  }

  setMockLocked(locked) {
    const prevLocked = this.isSessionLocked();
    this.mockLocked = typeof locked === 'boolean' ? locked : null;
    if (this.mockLocked === true) {
      this.mockState = 'locked';
    } else if (this.mockLocked === false) {
      this.mockState = 'active';
    } else {
      this.mockState = null;
    }
    const newLocked = this.isSessionLocked();
    if (newLocked !== prevLocked) {
      this.emit('change', { locked: newLocked, state: this.mockState || this.state });
      this.emit(newLocked ? 'lock' : 'unlock');
    }
  }

  setMockState(state) {
    const prevState = this.checkSessionState().state;
    this.mockState = state ? String(state).toLowerCase() : null;
    if (this.mockState === 'locked') {
      this.mockLocked = true;
    } else if (this.mockState === 'active') {
      this.mockLocked = false;
    } else if (this.mockState) {
      this.mockLocked = false;
    } else {
      this.mockLocked = null;
    }
    const cur = this.checkSessionState();
    if (cur.state !== prevState) {
      this.emit('change', cur);
      if (cur.locked) this.emit('lock');
      else this.emit('unlock');
    }
  }

  resetMock() {
    const prevLocked = this.isSessionLocked();
    this.mockLocked = null;
    this.mockState = null;
    const newLocked = this.isSessionLocked();
    if (newLocked !== prevLocked) {
      this.emit('change', { locked: newLocked, state: this.state });
      this.emit(newLocked ? 'lock' : 'unlock');
    }
  }

  isSessionLocked() {
    if (this.mockLocked !== null) return this.mockLocked;
    if (this.mockState !== null) return this.mockState === 'locked';

    if (Date.now() - this.lastCheck < this.cacheTtlMs) {
      return this.locked;
    }

    const res = this.checkSessionState();
    return res.locked;
  }

  _setState(state, locked) {
    const changed = this.state !== state || this.locked !== locked;
    this.state = state;
    this.locked = locked;
    this.lastCheck = Date.now();
    if (changed) {
      this.emit('change', { state, locked, timestamp: this.lastCheck });
      this.emit(locked ? 'lock' : 'unlock');
    }
    return { state, locked, timestamp: this.lastCheck };
  }

  checkSessionState() {
    if (this.mockState !== null || this.mockLocked !== null) {
      const locked = this.mockLocked !== null ? this.mockLocked : this.mockState === 'locked';
      const state = this.mockState || (locked ? 'locked' : 'active');
      return { locked, state, timestamp: Date.now(), mock: true };
    }

    if (process.platform !== 'win32') {
      return this._setState('active', false);
    }

    // Windows detection
    try {
      const logonOut = execSync('tasklist /FI "IMAGENAME eq logonui.exe" /NH', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      if (logonOut && logonOut.toLowerCase().includes('logonui.exe')) {
        return this._setState('locked', true);
      }
    } catch {
      // Continue to query session check
    }

    try {
      const qwinstaOut = execSync('qwinsta', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const currentSessionLine = qwinstaOut.split('\n').find((l) => l.trim().startsWith('>'));
      if (currentSessionLine) {
        if (/\bdisc\b|\bdisconnected\b/i.test(currentSessionLine)) {
          return this._setState('disconnected', false);
        }
      }
    } catch {}

    return this._setState('active', false);
  }
}

const sessionGuard = new SessionGuard();

module.exports = {
  SessionGuard,
  sessionGuard,
  isSessionLocked: () => sessionGuard.isSessionLocked(),
  checkSessionState: () => sessionGuard.checkSessionState(),
};
