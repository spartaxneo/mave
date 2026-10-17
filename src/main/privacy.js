'use strict';
// Privacy Shield & Temporary Blind Mode Engine for Mave.
// Allows users to say "don't track me for 2 minutes" or "pause screen tracking"
// and automatically blinds screen capture & OCR when handling sensitive data or passwords.

const { EventEmitter } = require('events');

class PrivacyShield extends EventEmitter {
  constructor() {
    super();
    this.blindUntil = 0;
    this.blindReason = '';
    this.timer = null;
  }

  isBlind() {
    if (this.blindUntil && Date.now() < this.blindUntil) {
      return true;
    }
    if (this.blindUntil && Date.now() >= this.blindUntil) {
      this.deactivateBlind();
    }
    return false;
  }

  remainingSeconds() {
    if (!this.isBlind()) return 0;
    return Math.max(0, Math.ceil((this.blindUntil - Date.now()) / 1000));
  }

  activateBlind(minutes = 2, reason = 'user_request') {
    const ms = Math.max(10, Math.min(minutes, 120)) * 60 * 1000;
    this.blindUntil = Date.now() + ms;
    this.blindReason = reason;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.deactivateBlind();
    }, ms);

    this.emit('change', { blind: true, remainingSeconds: this.remainingSeconds(), reason });
    return {
      blind: true,
      durationMinutes: minutes,
      remainingSeconds: this.remainingSeconds(),
      until: new Date(this.blindUntil).toLocaleTimeString(),
    };
  }

  deactivateBlind() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wasBlind = this.blindUntil > 0;
    this.blindUntil = 0;
    this.blindReason = '';
    if (wasBlind) {
      this.emit('change', { blind: false, remainingSeconds: 0, reason: 'resumed' });
    }
    return { blind: false, message: 'Privacy shield deactivated. Vision restored.' };
  }

  /**
   * Parse privacy commands:
   * "don't track me for 2 minutes", "pause vision for 5 mins", "blind mode for 3 minutes", "resume tracking"
   */
  matchIntent(text) {
    const t = String(text || '').trim().toLowerCase();

    // Resume / stop blind mode
    if (/^(?:resume (?:tracking|vision|screen|watching)|stop blind(?: mode)?|turn off privacy shield|you can look now|start tracking again)$/i.test(t)) {
      return { action: 'resume' };
    }

    // Activate blind mode with duration
    const m = /(?:don'?t track(?: me)?|pause (?:tracking|vision|screen)|blind(?: mode)?|stop looking(?: at my screen)?|privacy shield)(?: for (\d+)\s*(?:m|min|mins|minute|minutes)?)?/i.exec(t);
    if (m) {
      const mins = m[1] ? parseInt(m[1], 10) : 2;
      return { action: 'blind', minutes: mins || 2 };
    }

    return null;
  }
}

let instance = null;
function getPrivacyShield() {
  if (!instance) instance = new PrivacyShield();
  return instance;
}

module.exports = { PrivacyShield, getPrivacyShield };
