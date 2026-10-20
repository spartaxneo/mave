'use strict';
// Cloudflare Tunnel Manager for Mave.
// Enables $0 zero-cost public internet hosting for any user host PC.
// Works seamlessly through CGNAT, NAT, firewalls, and routers without port forwarding.
// Supports:
// 1. Zero-Setup Quick Tunnels (instant https://*.trycloudflare.com URL)
// 2. Custom Cloudflare Named Tunnels (permanent custom domains via token)
// 3. Automatic binary detection and lifecycle management

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');

class CloudflareTunnelManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.settings = options.settings || null;
    this.windows = options.windows || null;
    this.port = options.port || 4040;

    this.process = null;
    this.active = false;
    this.publicUrl = null;
    this.mode = 'quick'; // 'quick' | 'token'
    this.startedAt = null;
    this.lastError = null;

    this.binaryPath = this._resolveBinaryPath();

    // Clean up process on exit
    const cleanup = () => this.stopTunnel();
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  _resolveBinaryPath() {
    // 1. Check local vendor folder
    const vendorWin = path.join(process.cwd(), 'vendor', 'cloudflared', 'cloudflared.exe');
    if (fs.existsSync(vendorWin)) return vendorWin;

    const vendorUnix = path.join(process.cwd(), 'vendor', 'cloudflared', 'cloudflared');
    if (fs.existsSync(vendorUnix)) return vendorUnix;

    // 2. Check standard system locations
    return 'cloudflared';
  }

  getStatus() {
    const uptime = this.startedAt && this.active ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    return {
      active: this.active,
      url: this.publicUrl,
      mode: this.mode,
      uptime,
      error: this.lastError,
      hasBinary: fs.existsSync(this.binaryPath) || this.binaryPath === 'cloudflared',
    };
  }

  /**
   * Starts the Cloudflare Tunnel.
   * Resolves with { ok: true, url: string } once the public URL is assigned.
   */
  async startTunnel({ port = this.port, token = '', mode = 'quick' } = {}) {
    if (this.active && this.publicUrl) {
      return { ok: true, url: this.publicUrl, mode: this.mode, existing: true };
    }

    this.stopTunnel();
    this.lastError = null;
    this.mode = token ? 'token' : mode;

    const bin = this._resolveBinaryPath();
    const args = token
      ? ['tunnel', 'run', '--token', token.trim()]
      : ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'];

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.lastError = 'Timed out waiting for Cloudflare Tunnel to assign public URL.';
          this.logger.warn(this.lastError);
          resolve({ ok: false, error: this.lastError, fallbackUrl: `http://localhost:${port}` });
        }
      }, 30000);

      try {
        this.process = spawn(bin, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        this.startedAt = Date.now();

        const handleData = (chunk) => {
          const str = chunk.toString();
          this.logger.debug?.(`[cloudflared] ${str}`);
          if (/ERR|error/i.test(str)) {
            this.lastError = str.trim();
          }

          // Match https://*.trycloudflare.com in logs
          const urlMatch = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/.exec(str);
          if (urlMatch && !this.publicUrl) {
            this.publicUrl = urlMatch[0];
            this.active = true;
            this.logger.info(`[Cloudflare] Tunnel live: ${this.publicUrl}`);

            if (this.settings && typeof this.settings.update === 'function') {
              this.settings.update({ cloudflareTunnelUrl: this.publicUrl, cloudflareTunnelActive: true });
            }

            this.emit('online', { url: this.publicUrl, mode: this.mode });
            this._broadcastStatus();

            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ ok: true, url: this.publicUrl, mode: this.mode });
            }
          }
        };

        this.process.stdout.on('data', handleData);
        this.process.stderr.on('data', handleData);

        this.process.on('error', (err) => {
          this.lastError = `Failed to start cloudflared: ${err.message}`;
          this.active = false;
          this.publicUrl = null;
          this.logger.error(this.lastError);
          this.emit('error', err);
          this._broadcastStatus();

          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ ok: false, error: this.lastError });
          }
        });

        this.process.on('exit', (code, signal) => {
          this.active = false;
          this.publicUrl = null;
          this.process = null;
          this.logger.info(`[Cloudflare] Tunnel process exited with code ${code} / ${signal}`);
          this.emit('offline', { code });
          this._broadcastStatus();

          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ ok: false, error: this.lastError || `cloudflared exited with code ${code}` });
          }
        });

        // If custom token mode, it won't print trycloudflare.com
        if (token) {
          setTimeout(() => {
            if (!resolved && this.process) {
              resolved = true;
              clearTimeout(timeout);
              this.active = true;
              this.publicUrl = `https://[Your-Custom-Cloudflare-Domain]`;
              resolve({ ok: true, url: this.publicUrl, mode: 'token' });
            }
          }, 3500);
        }
      } catch (err) {
        clearTimeout(timeout);
        this.lastError = err.message;
        resolve({ ok: false, error: err.message });
      }
    });
  }

  stopTunnel() {
    if (this.process) {
      try {
        this.process.kill('SIGINT');
      } catch {}
      this.process = null;
    }
    this.active = false;
    this.publicUrl = null;
    this.startedAt = null;

    if (this.settings && typeof this.settings.update === 'function') {
      this.settings.update({ cloudflareTunnelActive: false });
    }

    this._broadcastStatus();
    return { ok: true };
  }

  _broadcastStatus() {
    if (this.windows && typeof this.windows.broadcast === 'function') {
      this.windows.broadcast('tunnel:update', this.getStatus());
    }
  }
}

let instance = null;
function getCloudflareTunnelManager(options = {}) {
  if (!instance) {
    instance = new CloudflareTunnelManager(options);
  }
  return instance;
}

module.exports = {
  CloudflareTunnelManager,
  getCloudflareTunnelManager,
};
