'use strict';

/**
 * Universal Dictation Engine
 * 
 * Inspired by Handy (https://github.com/cjpais/Handy):
 * - Direct voice-to-text dictation into ANY active application (VS Code, Word, Chrome, Slack, Discord).
 * - Anti-hallucination post-processing (stutter collapse, filler removal, phonetic custom words).
 * - Reliable paste transaction with clipboard preservation (snapshots and restores clipboard).
 * - Push-to-Talk or Toggle Dictation mode.
 */

const { cleanTranscription } = require('./local/text_cleaner');

let electronClipboard = null;
try {
  const electron = require('electron');
  if (electron && electron.clipboard) {
    electronClipboard = electron.clipboard;
  }
} catch {}

class DictationManager {
  constructor({ controller = null, input = null, logger = null } = {}) {
    this.controller = controller;
    this.input = input || (controller ? controller.input : null);
    this.logger = logger;
    this.dictationMode = false;
    this.pasteMethod = 'reliable_paste'; // 'type', 'ctrl_v', 'reliable_paste'
    this.autoSubmit = false;
    this.preserveClipboard = true;
    this.pasteDelayMs = 150;

    // Default custom dictionary (Handy-inspired developer & assistant vocabulary)
    this.customWords = [
      'Mave', 'Bigfoot', 'ChatGPT', 'OpenAI', 'Anthropic', 'Claude', 'GitHub', 'VS Code',
      'Spotify', 'Chrome', 'PowerShell', 'Terminal', 'YouTube', 'Discord', 'TypeScript',
      'JavaScript', 'Python', 'Rust', 'Docker', 'Kubernetes', 'Tailwind', 'Next.js'
    ];
  }

  /**
   * Toggles between Assistant Task Mode and Universal Dictation Mode.
   */
  toggleMode() {
    this.dictationMode = !this.dictationMode;
    if (this.logger) this.logger.info(`Universal Dictation Mode toggled: ${this.dictationMode ? 'ON' : 'OFF'}`);
    return this.dictationMode;
  }

  setMode(enabled) {
    this.dictationMode = Boolean(enabled);
    return this.dictationMode;
  }

  /**
   * Adds custom words to the phonetic replacement dictionary.
   */
  addCustomWords(words = []) {
    const list = Array.isArray(words) ? words : [words];
    for (const w of list) {
      const clean = String(w || '').trim();
      if (clean && !this.customWords.includes(clean)) {
        this.customWords.push(clean);
      }
    }
    return [...this.customWords];
  }

  /**
   * Removes custom words from the dictionary.
   */
  removeCustomWord(word) {
    const clean = String(word || '').trim().toLowerCase();
    this.customWords = this.customWords.filter(w => w.toLowerCase() !== clean);
    return [...this.customWords];
  }

  getCustomWords() {
    return [...this.customWords];
  }

  /**
   * Dictates text into the active foreground window.
   */
  async dictate(rawText, options = {}) {
    if (!rawText || !String(rawText).trim()) {
      return { ok: false, error: 'Empty text to dictate.' };
    }

    const input = this.input || (this.controller ? this.controller.input : null);
    const method = options.pasteMethod || this.pasteMethod;
    const autoSubmit = options.autoSubmit != null ? options.autoSubmit : this.autoSubmit;
    const preserveClipboard = options.preserveClipboard != null ? options.preserveClipboard : this.preserveClipboard;

    // 1. Clean transcript using Handy's anti-hallucination & phonetic dictionary pipeline
    const cleaned = cleanTranscription(rawText, {
      customWords: this.customWords,
      additionalWords: options.additionalWords || [],
      threshold: options.threshold || 0.35,
      language: options.language || 'en',
      removeFillers: options.removeFillers !== false
    });

    if (!cleaned) {
      return { ok: true, text: '', characters: 0, method };
    }

    // 2. Inject text into the active foreground application
    if (input) {
      const shouldUseType = method === 'type' || cleaned.length < 35;

      if (shouldUseType && typeof input.type === 'function') {
        await input.type(cleaned);
      } else if (typeof input.hotkey === 'function' || typeof input.keys === 'function') {
        let previousClipboardText = null;
        let clipboardRestored = false;

        // Reliable paste with clipboard preservation
        if (preserveClipboard && electronClipboard && typeof electronClipboard.readText === 'function') {
          try {
            previousClipboardText = electronClipboard.readText();
          } catch {}
        }

        if (electronClipboard && typeof electronClipboard.writeText === 'function') {
          try {
            electronClipboard.writeText(cleaned);
          } catch {}
        }

        // Send paste chord
        if (typeof input.hotkey === 'function') {
          await input.hotkey(['Control', 'v']);
        } else if (typeof input.keys === 'function') {
          await input.keys('ctrl+v');
        }

        // Restore previous clipboard after safe window paste settlement
        if (preserveClipboard && previousClipboardText != null && electronClipboard) {
          await new Promise(r => setTimeout(r, this.pasteDelayMs));
          try {
            electronClipboard.writeText(previousClipboardText);
            clipboardRestored = true;
          } catch {}
        }
      } else if (typeof input.type === 'function') {
        await input.type(cleaned);
      }

      // Auto submit with Enter key if configured
      if (autoSubmit) {
        if (typeof input.key === 'function') {
          await input.key('return');
        } else if (typeof input.keys === 'function') {
          await input.keys('return');
        }
      }
    }

    if (this.logger) {
      this.logger.info(`Dictated ${cleaned.length} characters into active window via [${method}].`);
    }

    return {
      ok: true,
      text: cleaned,
      rawText,
      characters: cleaned.length,
      method,
      autoSubmitted: Boolean(autoSubmit)
    };
  }

  /**
   * Status of the dictation engine.
   */
  async getStatus() {
    let activeWindow = 'Unknown';
    const input = this.input || (this.controller ? this.controller.input : null);
    if (input && typeof input.windowTitle === 'function') {
      try {
        activeWindow = await input.windowTitle() || activeWindow;
      } catch {}
    }

    return {
      ok: true,
      dictationMode: this.dictationMode,
      pasteMethod: this.pasteMethod,
      autoSubmit: this.autoSubmit,
      preserveClipboard: this.preserveClipboard,
      activeWindow,
      customWordsCount: this.customWords.length
    };
  }
}

let dictationInstance = null;
function getDictationManager(options = {}) {
  if (!dictationInstance) {
    dictationInstance = new DictationManager(options);
  } else if (options.controller) {
    dictationInstance.controller = options.controller;
    if (options.input) dictationInstance.input = options.input;
  }
  return dictationInstance;
}

module.exports = { DictationManager, getDictationManager };
