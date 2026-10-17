'use strict';
// Manages the AirLLM layer-wise streaming inference service for Mave.
// Allows running 32B, 70B, and frontier LLMs on consumer GPUs (RTX 5060 8GB)
// without VRAM exhaustion via block-by-block disk streaming.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DEFAULT_PYTHON = 'E:\\LTXDesktop-python\\python.exe';
const DEFAULT_PORT = 8001;

class AirLLMService {
  constructor(options = {}) {
    this.pythonExe = options.pythonExe || DEFAULT_PYTHON;
    this.scriptPath = options.scriptPath || path.join(__dirname, 'airllm_server.py');
    this.port = options.port || DEFAULT_PORT;
    this.process = null;
    this.currentModel = null;
    this.starting = false;
    this.logger = options.logger || console;
  }

  getEndpoint() {
    return `http://127.0.0.1:${this.port}/v1`;
  }

  isAvailable() {
    return fs.existsSync(this.pythonExe) && fs.existsSync(this.scriptPath);
  }

  async isHealthy() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, { timeout: 1500 }, (res) => {
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

  async getStatus() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ status: 'offline' });
          }
        });
      });
      req.on('error', () => resolve({ status: 'offline', error: 'Service not running' }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout' }); });
    });
  }

  async start(modelId = 'Qwen/Qwen3-32B') {
    if (await this.isHealthy()) {
      this.currentModel = modelId;
      return true;
    }
    if (this.starting) return false;
    this.starting = true;

    if (!fs.existsSync(this.pythonExe)) {
      this.logger.error && this.logger.error(`[AirLLM] Python not found at ${this.pythonExe}`);
      this.starting = false;
      return false;
    }

    try {
      const args = [this.scriptPath, '--port', String(this.port), '--host', '127.0.0.1'];
      if (modelId) {
        args.push('--model', modelId);
      }

      this.logger.info && this.logger.info(`[AirLLM] Launching AirLLM server: ${this.pythonExe} ${args.join(' ')}`);

      this.process = spawn(this.pythonExe, args, {
        cwd: path.dirname(this.scriptPath),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.process.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text && this.logger.info) this.logger.info(`[AirLLM STDOUT] ${text}`);
      });

      this.process.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text && this.logger.info) this.logger.info(`[AirLLM STDERR] ${text}`);
      });

      this.process.on('exit', (code) => {
        if (this.logger.info) this.logger.info(`[AirLLM] Process exited with code ${code}`);
        this.process = null;
        this.starting = false;
      });

      // Wait up to 30s for the server to spin up and report healthy
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await this.isHealthy()) {
          this.currentModel = modelId;
          this.starting = false;
          if (this.logger.info) this.logger.info(`[AirLLM] Server ready on port ${this.port}`);
          return true;
        }
      }

      this.starting = false;
      return false;
    } catch (err) {
      this.logger.error && this.logger.error(`[AirLLM] Failed to start: ${err.message}`);
      this.starting = false;
      return false;
    }
  }

  stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch { /* empty */ }
      this.process = null;
    }
    this.starting = false;
    this.currentModel = null;
  }
}

const airllmService = new AirLLMService();

module.exports = {
  AirLLMService,
  airllmService,
};
