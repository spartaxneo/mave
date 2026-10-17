'use strict';
// Telegram Bot Bridge for Bigfoot.
// Allows controlling your Windows desktop from Telegram on your phone (iOS / Android):
// voice/text commands, receiving replies, taking screenshots, and monitoring hardware.
// Built with native Node.js fetch (zero external npm packages required).

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getTelegramConfigPath() {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return path.join(app.getPath('userData'), 'telegram-config.json');
  } catch {}
  return path.join(process.env.BIGFOOT_PROFILE_DIR || path.join(os.homedir(), 'AppData', 'Roaming', 'Bigfoot'), 'telegram-config.json');
}

function loadTelegramConfig() {
  try {
    const p = getTelegramConfigPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {}
  return {};
}

function saveTelegramConfig({ token, authorizedChatId } = {}) {
  try {
    const p = getTelegramConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const current = loadTelegramConfig();
    const updated = {
      ...current,
      ...(token !== undefined ? { token } : {}),
      ...(authorizedChatId !== undefined ? { authorizedChatId } : {}),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('Failed to save telegram config:', err.message);
  }
}

class TelegramBridge {
  constructor({ token = null, authorizedChatId = null, controller = null, logger = null } = {}) {
    const saved = loadTelegramConfig();
    this.token = token || process.env.TELEGRAM_BOT_TOKEN || saved.token || '';
    this.authorizedChatId = authorizedChatId || saved.authorizedChatId || null;
    this.controller = controller;
    this.logger = logger;
    this.running = false;
    this.offset = 0;
    this.abortController = null;
  }

  get apiBase() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  async verifyToken() {
    try {
      const res = await fetch(`${this.apiBase}/getMe`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'Invalid token');
      return data.result;
    } catch (err) {
      throw new Error(`Telegram bot verification failed: ${err.message}`);
    }
  }

  async sendMessage(chatId, text) {
    try {
      await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      if (this.logger) this.logger.error('Failed to send Telegram message', err.message);
    }
  }

  async sendScreenshot(chatId) {
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
      if (!sources.length || !sources[0].thumbnail) {
        return this.sendMessage(chatId, 'Could not capture screenshot.');
      }

      const png = sources[0].thumbnail.toPNG();
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('photo', new Blob([png], { type: 'image/png' }), 'screen.png');
      form.append('caption', '🖥 Current Desktop View');

      await fetch(`${this.apiBase}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      await this.sendMessage(chatId, `Failed to capture/send screenshot: ${err.message}`);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.pollLoop();
  }

  stop() {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async pollLoop() {
    while (this.running) {
      try {
        const url = `${this.apiBase}/getUpdates?offset=${this.offset}&timeout=25`;
        const res = await fetch(url, { signal: this.abortController.signal });
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            if (update.message && update.message.text) {
              await this.handleMessage(update.message);
            }
          }
        }
      } catch (err) {
        if (!this.running) break;
        // Wait 3 seconds on network error before retrying
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Security check: pairing / authentication
    if (this.authorizedChatId && String(chatId) !== String(this.authorizedChatId)) {
      await this.sendMessage(chatId, '⛔ Access denied: this Mave desktop is paired to another user.');
      return;
    }

    // Auto-pair on first /start if no authorizedChatId set
    if (!this.authorizedChatId) {
      this.authorizedChatId = chatId;
      saveTelegramConfig({ authorizedChatId: chatId });
      await this.sendMessage(chatId, `🎉 Paired successfully! Your Telegram account (ID: ${chatId}) is now authorized to command Mave.`);
    }

    if (text === '/start') {
      await this.sendMessage(chatId, `🤖 Mave is connected to your PC!\n\nCommands:\n• /screen - View live desktop screenshot\n• /status - Hardware & telemetry report\n• /lock - Lock Windows workstation\n\nOr send any question or task for Mave to execute on your PC!`);
      return;
    }

    if (text === '/screen') {
      await this.sendScreenshot(chatId);
      return;
    }

    if (text === '/status') {
      try {
        const diag = require('../plugins/builtin/system');
        const report = await diag[0].run({}, { log: () => {} });
        await this.sendMessage(chatId, report);
      } catch (err) {
        await this.sendMessage(chatId, `Status check failed: ${err.message}`);
      }
      return;
    }

    if (text === '/lock') {
      execFile('rundll32.exe', ['user32.dll,LockWorkStation']);
      await this.sendMessage(chatId, '🔒 Windows workstation locked.');
      return;
    }

    // Dispatch normal task to Bigfoot controller
    await this.sendMessage(chatId, '⏳ On it...');
    try {
      if (this.controller && this.controller.runTask) {
        const result = await this.controller.runTask(text, 'remote-telegram');
        const reply = result.text || (result.ok ? 'Done.' : `Error: ${result.error}`);
        await this.sendMessage(chatId, reply);
      } else {
        await this.sendMessage(chatId, `Received: "${text}". Controller active.`);
      }
    } catch (err) {
      await this.sendMessage(chatId, `Task failed: ${err.message}`);
    }
  }
}

module.exports = {
  TelegramBridge,
  getTelegramConfigPath,
  loadTelegramConfig,
  saveTelegramConfig,
};
