'use strict';
// Manages the Colibri Mixture-of-Experts inference service for Bigfoot.
// Serves frontier MoE models (qwen36-35b for mid-tier, deepseek-v4-flash for brain/sol tier)
// on loopback port 8000 using standard OpenAI-compatible completions.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const COLIBRI_ROOT = 'D:\\Bigfoot\\colibri';
const COLIBRI_MODELS = 'D:\\Bigfoot\\colibri-models';
const DEFAULT_PORT = 8000;

class ColibriService {
  constructor(options = {}) {
    this.root = options.root || COLIBRI_ROOT;
    this.modelsDir = options.modelsDir || COLIBRI_MODELS;
    this.port = options.port || DEFAULT_PORT;
    this.process = null;
    this.currentModel = null;
    this.starting = false;
  }

  getEndpoint() {
    return `http://127.0.0.1:${this.port}/v1`;
  }

  isInstalled(modelId = 'qwen36-35b') {
    const targetDir = path.join(this.modelsDir, modelId);
    if (!fs.existsSync(targetDir)) return false;
    const manifest = path.join(targetDir, '.colibri-download.json');
    if (fs.existsSync(manifest)) {
      try {
        const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (data.complete === true) return true;
      } catch { /* parse error */ }
    }
    // Also check if any safetensors or config exist
    return fs.existsSync(path.join(targetDir, 'config.json'));
  }

  async isHealthy() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/v1/models`, { timeout: 1500 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  async start(modelId = 'qwen36-35b') {
    if (await this.isHealthy()) {
      this.currentModel = modelId;
      return true;
    }
    if (this.starting) return false;
    this.starting = true;

    const modelPath = path.join(this.modelsDir, modelId);
    if (!fs.existsSync(modelPath)) {
      this.starting = false;
      return false;
    }

    try {
      const launcher = path.join(this.root, 'c', 'coli');
      const pyExe = 'py';
      const pyArgs = ['-3', launcher, 'serve', '--model', modelPath, '--port', String(this.port), '--gpu', 'auto', '--auto-tier'];

      this.process = spawn(pyExe, pyArgs, {
        cwd: this.root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.process.stdout.on('data', (d) => {
        // debug logging if needed
      });

      this.process.stderr.on('data', (d) => {
        // debug logging if needed
      });

      this.process.on('exit', () => {
        this.process = null;
        this.starting = false;
      });

      // Wait up to 30s for server to become healthy
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await this.isHealthy()) {
          this.currentModel = modelId;
          this.starting = false;
          return true;
        }
      }
    } catch {
      this.starting = false;
    }
    this.starting = false;
    return false;
  }

  stop() {
    if (this.process) {
      const pid = this.process.pid;
      try {
        const { execFileSync } = require('child_process');
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          this.process.kill('SIGKILL');
        }
      } catch { /* already dead */ }
      this.process = null;
    }
    // Ensure any detached Colibri engine binaries don't linger in VRAM
    if (process.platform === 'win32') {
      try {
        const { execFileSync } = require('child_process');
        execFileSync('taskkill', ['/im', 'deepseek_v4.exe', '/F'], { stdio: 'ignore' });
      } catch { /* not running */ }
    }
  }
}

const colibriService = new ColibriService();

module.exports = {
  ColibriService,
  colibriService,
  COLIBRI_ROOT,
  COLIBRI_MODELS,
};
