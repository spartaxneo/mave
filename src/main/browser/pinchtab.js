'use strict';
// PinchTab Browser Automation Bridge Client for Mave.
// Connects to the local PinchTab Go binary (D:\Bigfoot\pinchtab\pinchtab.exe)
// to provide token-efficient accessibility snapshots, real Chrome navigation,
// click, type, and form interactions.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PINCHTAB_BIN = 'D:\\Bigfoot\\pinchtab\\pinchtab.exe';
const PINCHTAB_CONFIG = path.join(os.homedir(), 'AppData', 'Roaming', 'pinchtab', 'config.json');
const DEFAULT_PORT = 9867;

class PinchTabClient {
  constructor(options = {}) {
    this.binPath = options.binPath || PINCHTAB_BIN;
    this.port = options.port || DEFAULT_PORT;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.token = options.token || null;
    this.process = null;
    this.activeTabId = null;
    this.loadToken();
  }

  loadToken() {
    if (fs.existsSync(PINCHTAB_CONFIG)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(PINCHTAB_CONFIG, 'utf8'));
        if (cfg.server && cfg.server.token) {
          this.token = cfg.server.token;
        }
      } catch { /* parse error */ }
    }
  }

  saveConfig() {
    const dir = path.dirname(PINCHTAB_CONFIG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let cfg = {};
    if (fs.existsSync(PINCHTAB_CONFIG)) {
      try { cfg = JSON.parse(fs.readFileSync(PINCHTAB_CONFIG, 'utf8')); } catch { cfg = {}; }
    }

    cfg.server = cfg.server || {};
    cfg.server.port = String(this.port);
    cfg.server.bind = '127.0.0.1';

    if (this.token) cfg.server.token = this.token;

    fs.writeFileSync(PINCHTAB_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
  }

  async isHealthy() {
    try {
      const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
      const res = await fetch(`${this.baseUrl}/health`, { headers, signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        return data.status === 'ok';
      }
      return false;
    } catch {
      return false;
    }
  }

  async start() {
    if (await this.isHealthy()) return true;

    if (!fs.existsSync(this.binPath)) {
      throw new Error(`PinchTab binary not found at ${this.binPath}`);
    }

    this.loadToken();
    this.saveConfig();

    this.process = spawn(this.binPath, ['bridge', '--port', String(this.port)], {
      cwd: path.dirname(this.binPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.process.stdout.on('data', () => {});
    this.process.stderr.on('data', () => {});

    this.process.on('exit', () => {
      this.process = null;
    });

    // Wait up to 10s for server to become healthy
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      this.loadToken();
      if (await this.isHealthy()) {
        return true;
      }
    }

    return false;
  }

  stop() {
    if (this.process) {
      const pid = this.process.pid;
      try {
        if (process.platform === 'win32' && pid) {
          const { execFileSync } = require('child_process');
          execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          this.process.kill('SIGKILL');
        }
      } catch { /* already dead */ }
      this.process = null;
    }
  }

  async request(endpoint, options = {}) {
    await this.start();
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || 30000),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return data;
  }

  /**
   * Navigate to a URL in Chrome.
   */
  async navigate(targetUrl) {
    let cleanUrl = String(targetUrl || '').trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const payload = { url: cleanUrl };
    if (this.activeTabId) payload.tabId = this.activeTabId;

    const data = await this.request('/navigate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (data.tabId) this.activeTabId = data.tabId;
    return data;
  }

  /**
   * Get an accessibility snapshot of the current page.
   * Formats nodes into a concise, token-efficient text outline suitable for LLMs.
   */
  async snapshot() {
    const data = await this.request('/snapshot');
    if (!data || !Array.isArray(data.nodes)) {
      return { raw: data, summary: 'No accessibility tree returned.' };
    }

    // Filter to interactive or meaningful content nodes
    const interactive = ['button', 'link', 'combobox', 'textbox', 'checkbox', 'radio', 'searchbox', 'menuitem', 'tab'];
    const lines = [];

    for (const n of data.nodes) {
      const role = (n.role || '').toLowerCase();
      const name = (n.name || '').trim();
      const text = (n.text || '').trim();
      const isInteract = interactive.includes(role) || Boolean(n.tag === 'a' || n.tag === 'button' || n.tag === 'input');

      if (isInteract) {
        const label = name || text || `[empty ${role}]`;
        lines.push(`[${n.ref}] <${role}> "${label}"${n.tag ? ` (${n.tag})` : ''}`);
      } else if (name && name.length > 2 && (role.includes('heading') || role.includes('area') || role.includes('main'))) {
        lines.push(`[${n.ref}] <${role}> ${name}`);
      }
    }

    return {
      title: data.title || '',
      url: data.url || '',
      count: data.count || lines.length,
      interactiveCount: lines.length,
      outline: lines.slice(0, 80).join('\n'),
      nodes: data.nodes,
    };
  }

  /**
   * Click an element by its ref (e.g. "e13").
   */
  async click(ref, options = {}) {
    return this.request('/action', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'click',
        ref: String(ref).trim(),
        waitNav: options.waitNav !== false,
      }),
    });
  }

  /**
   * Type text into an element by its ref.
   */
  async type(ref, text) {
    return this.request('/action', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'type',
        ref: String(ref).trim(),
        text: String(text || ''),
      }),
    });
  }

  /**
   * Press a key (e.g. "Enter", "Tab", "Escape").
   */
  async press(key) {
    return this.request('/action', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'press',
        key: String(key || 'Enter'),
      }),
    });
  }

  /**
   * Extract readable main text from current page.
   */
  async extractText() {
    const data = await this.request('/text');
    return typeof data === 'string' ? data : (data.text || JSON.stringify(data));
  }
}

const pinchTab = new PinchTabClient();

module.exports = {
  PinchTabClient,
  pinchTab,
};
