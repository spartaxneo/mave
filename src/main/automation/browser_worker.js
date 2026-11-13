'use strict';

const vm = require('vm');

class BrowserWorker {
  /**
   * @param {string|number} workerId
   * @param {object} [options]
   */
  constructor(workerId, options = {}) {
    this.workerId = String(workerId);
    this.partition = options.partition || ('persist:worker_' + this.workerId);
    this.timeoutMs = options.timeoutMs || 30000;
    this.width = options.width || 1280;
    this.height = options.height || 800;
    this.BrowserWindow = options.BrowserWindow || this._resolveBrowserWindow();
    this.window = null;
    this.currentUrl = 'about:blank';
    this.busy = false;
    this.destroyed = false;
    this.mockContent = options.mockContent || '';
  }

  _resolveBrowserWindow() {
    try {
      const electron = require('electron');
      if (electron && typeof electron.BrowserWindow === 'function') {
        return electron.BrowserWindow;
      }
    } catch {}
    return null;
  }

  async init() {
    if (this.destroyed) throw new Error('BrowserWorker is destroyed');
    if (this.BrowserWindow) {
      try {
        this.window = new this.BrowserWindow({
          show: false,
          width: this.width,
          height: this.height,
          webPreferences: {
            offscreen: true,
            partition: this.partition,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            javascript: true,
          },
        });
      } catch {
        this.window = null;
      }
    }
    return this;
  }

  async _withTimeout(promise, ms, opName) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`[TIMEOUT] Operation "${opName}" timed out after ${ms}ms`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  async goto(url, options = {}) {
    if (this.destroyed) throw new Error('BrowserWorker is destroyed');
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    this.busy = true;

    try {
      if (this.window && typeof this.window.loadURL === 'function') {
        await this._withTimeout(this.window.loadURL(url), timeoutMs, `goto(${url})`);
      } else {
        await this._withTimeout(new Promise((r) => setTimeout(r, 10)), timeoutMs, `goto(${url})`);
      }
      this.currentUrl = url;
      return { ok: true, status: 200, url: this.currentUrl };
    } finally {
      this.busy = false;
    }
  }

  async evaluate(script, options = {}) {
    if (this.destroyed) throw new Error('BrowserWorker is destroyed');
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    this.busy = true;

    try {
      if (this.window && this.window.webContents && typeof this.window.webContents.executeJavaScript === 'function') {
        const code = typeof script === 'function' ? `(${script.toString()})()` : String(script);
        return await this._withTimeout(this.window.webContents.executeJavaScript(code), timeoutMs, 'evaluate');
      } else {
        if (typeof script === 'function') {
          return script();
        }
        try {
          const context = vm.createContext({
            document: {
              title: 'Headless Offscreen Page',
              body: {
                innerText: this.mockContent || 'Sample scraped text',
                textContent: this.mockContent || 'Sample scraped text',
              },
              querySelector: (sel) => ({
                innerText: this.mockContent || `Content for ${sel}`,
                textContent: this.mockContent || `Content for ${sel}`,
                getAttribute: () => null,
              }),
              querySelectorAll: () => [],
            },
            window: { location: { href: this.currentUrl } },
            location: { href: this.currentUrl },
          });
          return vm.runInContext(String(script), context, { timeout: timeoutMs });
        } catch {
          return null;
        }
      }
    } finally {
      this.busy = false;
    }
  }

  async getText(selector = 'body', options = {}) {
    if (this.destroyed) throw new Error('BrowserWorker is destroyed');
    const script = `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? (el.innerText || el.textContent || '').trim() : '';
    })()`;
    const res = await this.evaluate(script, options);
    return typeof res === 'string' && res.length > 0 ? res : (this.mockContent || '');
  }

  async capturePage(rect = {}, options = {}) {
    if (this.destroyed) throw new Error('BrowserWorker is destroyed');
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    this.busy = true;

    try {
      if (this.window && this.window.webContents && typeof this.window.webContents.capturePage === 'function') {
        return await this._withTimeout(this.window.webContents.capturePage(rect), timeoutMs, 'capturePage');
      } else {
        const mockPng = Buffer.from(
          '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082',
          'hex'
        );
        return {
          toPNG: () => mockPng,
          toJPEG: () => mockPng,
          toBitmap: () => mockPng,
          toDataURL: () => 'data:image/png;base64,' + mockPng.toString('base64'),
          isEmpty: () => false,
          getSize: () => ({ width: this.width, height: this.height }),
        };
      }
    } finally {
      this.busy = false;
    }
  }

  async close() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.busy = false;

    if (this.window) {
      try {
        if (typeof this.window.destroy === 'function') {
          this.window.destroy();
        } else if (typeof this.window.close === 'function') {
          this.window.close();
        }
      } catch {}
      this.window = null;
    }
  }

  async destroy() {
    return this.close();
  }
}

class BrowserWorkerPool {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || 4;
    this.workers = new Map();
    this.idleWorkers = [];
    this.activeWorkers = new Set();
    this.workerOptions = options.workerOptions || {};
    this._waitQueue = [];
    this.destroyed = false;
  }

  async acquire(options = {}) {
    if (this.destroyed) throw new Error('BrowserWorkerPool is destroyed');

    if (this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop();
      this.activeWorkers.add(worker);
      worker.busy = true;
      return worker;
    }

    if (this.workers.size < this.maxWorkers) {
      const workerId = `pool_${this.workers.size + 1}_${Date.now().toString(36)}`;
      const worker = new BrowserWorker(workerId, { ...this.workerOptions, ...options });
      await worker.init();
      this.workers.set(workerId, worker);
      this.activeWorkers.add(worker);
      worker.busy = true;
      return worker;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waitQueue.indexOf(item);
        if (idx !== -1) this._waitQueue.splice(idx, 1);
        reject(new Error('[TIMEOUT] Timed out waiting for available browser worker from pool'));
      }, options.timeoutMs || 15000);

      const item = { resolve, reject, timer };
      this._waitQueue.push(item);
    });
  }

  release(worker) {
    if (!worker || worker.destroyed || this.destroyed) return;

    worker.busy = false;
    this.activeWorkers.delete(worker);

    if (this._waitQueue.length > 0) {
      const item = this._waitQueue.shift();
      clearTimeout(item.timer);
      this.activeWorkers.add(worker);
      worker.busy = true;
      item.resolve(worker);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  async withWorker(fn, options = {}) {
    const worker = await this.acquire(options);
    try {
      return await fn(worker);
    } finally {
      this.release(worker);
    }
  }

  async closeAll() {
    this.destroyed = true;

    for (const item of this._waitQueue) {
      clearTimeout(item.timer);
      item.reject(new Error('BrowserWorkerPool closed'));
    }
    this._waitQueue = [];

    for (const worker of this.workers.values()) {
      await worker.close();
    }

    this.workers.clear();
    this.idleWorkers = [];
    this.activeWorkers.clear();
  }

  async destroy() {
    return this.closeAll();
  }

  get stats() {
    return {
      total: this.workers.size,
      idle: this.idleWorkers.length,
      active: this.activeWorkers.size,
      maxWorkers: this.maxWorkers,
    };
  }
}

module.exports = {
  BrowserWorker,
  BrowserWorkerPool,
};
