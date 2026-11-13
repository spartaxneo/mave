'use strict';

const EventEmitter = require('events');

class ScreenAwarenessService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled = Boolean(options.enabled);
    this.target = options.target || null;
    this.excludedApps = new Set(['1password', 'keepass', 'bitwarden', 'lastpass']);
    this.activeWindowTitle = '';
    this.lastFrameHash = null;
    this.isObserving = false;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.emit('screen-awareness-changed', { enabled: this.enabled });
    if (!this.enabled) {
      this.isObserving = false;
    }
  }

  setTarget(target) {
    this.target = target;
  }

  addExcludedApp(appName) {
    if (appName) this.excludedApps.add(appName.toLowerCase().trim());
  }

  removeExcludedApp(appName) {
    if (appName) this.excludedApps.delete(appName.toLowerCase().trim());
  }

  isAppExcluded(windowTitle) {
    if (!windowTitle) return false;
    const lower = windowTitle.toLowerCase();
    for (const app of this.excludedApps) {
      if (lower.includes(app)) return true;
    }
    return false;
  }

  /**
   * Capture and analyze screen context only when permitted and when changes occur.
   * Uses accessibility tree / UI elements first before calling heavy vision inference.
   */
  async captureContext(options = {}) {
    if (!this.enabled) {
      return { allowed: false, reason: 'Screen awareness is disabled by user setting.' };
    }

    const currentTitle = options.windowTitle || this.activeWindowTitle || 'Desktop';
    if (this.isAppExcluded(currentTitle)) {
      return {
        allowed: false,
        reason: `Window "${currentTitle}" is in excluded privacy list. Capture blocked.`,
        privacyBlocked: true,
      };
    }

    // Frame-change detection simulation
    const frameContent = options.simulatedFrame || `Window: ${currentTitle} (UI State: Active)`;
    const frameHash = Buffer.from(frameContent).toString('base64');
    const hasChanged = frameHash !== this.lastFrameHash;
    this.lastFrameHash = frameHash;

    const observation = {
      timestamp: Date.now(),
      windowTitle: currentTitle,
      hasChanged,
      uiElements: options.uiElements || [{ id: 'main_window', type: 'window', name: currentTitle }],
      summary: `Active application: "${currentTitle}".`,
      isDirectlyObserved: true,
    };

    this.emit('observation', observation);
    return { allowed: true, observation };
  }
}

let defaultScreenService = null;

function getScreenAwarenessService(options = {}) {
  if (!defaultScreenService) {
    defaultScreenService = new ScreenAwarenessService(options);
  }
  return defaultScreenService;
}

module.exports = {
  ScreenAwarenessService,
  getScreenAwarenessService,
};
