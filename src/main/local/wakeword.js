'use strict';
// Local Offline Wake-Word Detection Engine for Mave.
// Monitors microphone input for activation phrases like "Hey Mave", "Mave"
// to initiate hands-free voice control without requiring clicks or manual focus.

const { EventEmitter } = require('events');

class WakeWordListener extends EventEmitter {
  constructor({ defaultPhrase = 'Hey Mave' } = {}) {
    super();
    this.phrase = defaultPhrase;
    this.listening = false;
    this.sensitivity = 0.7;
    this.lastTriggeredAt = 0;
  }

  start(phrase = null) {
    if (phrase) this.phrase = phrase;
    this.listening = true;
    this.emit('state', { listening: true, phrase: this.phrase });
    return { status: 'listening', phrase: this.phrase };
  }

  stop() {
    this.listening = false;
    this.emit('state', { listening: false, phrase: this.phrase });
    return { status: 'stopped', phrase: this.phrase };
  }

  toggle() {
    return this.listening ? this.stop() : this.start();
  }

  status() {
    return {
      listening: this.listening,
      phrase: this.phrase,
      lastTriggeredAt: this.lastTriggeredAt,
    };
  }

  /**
   * Evaluate a transcribed audio segment or test phrase against the wake word.
   */
  evaluateAudioText(text) {
    if (!this.listening) return false;
    const clean = String(text || '').trim().toLowerCase();
    const wakeRe = /\b(?:hey )?mave\b|\b(?:hey )?bigfoot\b/i;
    if (wakeRe.test(clean)) {
      this.lastTriggeredAt = Date.now();
      const match = clean.match(wakeRe)[0];
      this.emit('wake', { phrase: match, fullText: clean, timestamp: this.lastTriggeredAt });
      return true;
    }
    return false;
  }
}

let defaultListener = null;
function getWakeWordListener() {
  if (!defaultListener) defaultListener = new WakeWordListener();
  return defaultListener;
}

module.exports = {
  WakeWordListener,
  getWakeWordListener,
};
