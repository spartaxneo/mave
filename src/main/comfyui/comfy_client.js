'use strict';

/**
 * ComfyUI REST & Headless Client
 * 
 * Inspired by Comfy-Org/ComfyUI:
 * Headless integration bridge for queuing prompts, querying hardware & VRAM statistics,
 * polling execution history, and retrieving generated high-resolution images and videos.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getWorkflowBuilder } = require('./workflow_builder');

function getMavePicturesDir() {
  const dir = path.join(os.homedir(), 'Pictures', 'Mave_Generations');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getMaveVideosDir() {
  const dir = path.join(os.homedir(), 'Videos', 'Mave_Generations');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

class ComfyClient {
  constructor({ host = '127.0.0.1', port = 8188, logger = null } = {}) {
    this.host = host;
    this.port = port;
    this.logger = logger;
    this.clientId = `mave_${Math.random().toString(36).slice(2, 9)}`;
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Performs an HTTP request against the ComfyUI API.
   */
  async _request(pathname, method = 'GET', data = null, isBinary = false, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: pathname,
        method,
        timeout: timeoutMs,
        headers: {}
      };

      let bodyStr = null;
      if (data && method !== 'GET') {
        bodyStr = JSON.stringify(data);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (isBinary) {
              return resolve(buffer);
            }
            try {
              const text = buffer.toString('utf8');
              const json = text ? JSON.parse(text) : {};
              resolve(json);
            } catch (err) {
              resolve(buffer.toString('utf8'));
            }
          } else {
            const err = new Error(`ComfyUI HTTP ${res.statusCode}: ${buffer.toString('utf8')}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`ComfyUI request to ${pathname} timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  /**
   * Checks if ComfyUI is running and queries hardware / VRAM status.
   */
  async checkStatus() {
    try {
      const stats = await this._request('/system_stats', 'GET', null, false, 3500);
      const devices = (stats.devices || []).map(d => ({
        name: d.name || 'Unknown Device',
        type: d.type || 'cuda',
        vramTotalGB: Math.round(((d.vram_total || 0) / (1024 ** 3)) * 10) / 10,
        vramFreeGB: Math.round(((d.vram_free || 0) / (1024 ** 3)) * 10) / 10
      }));

      return {
        online: true,
        baseUrl: this.baseUrl,
        os: stats.system?.os || process.platform,
        pythonVersion: stats.system?.python_version || 'unknown',
        devices,
        summary: `ComfyUI Online @ ${this.baseUrl} (${devices.length > 0 ? devices[0].name : 'CPU'})`
      };
    } catch (err) {
      return {
        online: false,
        baseUrl: this.baseUrl,
        error: err.code === 'ECONNREFUSED' ? `ComfyUI not running at ${this.baseUrl}` : err.message,
        launchCommand: `python main.py --listen ${this.host} --port ${this.port}`,
        summary: `ComfyUI Offline (${err.code === 'ECONNREFUSED' ? 'Connection Refused' : err.message})`
      };
    }
  }

  /**
   * Retrieves available checkpoints, samplers, and LoRAs.
   */
  async getAvailableModels() {
    try {
      const info = await this._request('/object_info', 'GET', null, false, 5000);
      const checkpoints = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      const loras = info?.LoraLoader?.input?.required?.lora_name?.[0] || [];
      const samplers = info?.KSampler?.input?.required?.sampler_name?.[0] || [];
      const schedulers = info?.KSampler?.input?.required?.scheduler?.[0] || [];

      return {
        ok: true,
        checkpoints,
        loras,
        samplers,
        schedulers
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        checkpoints: ['sd_xl_base_1.0.safetensors', 'flux1-schnell.safetensors', 'v1-5-pruned-emaonly.safetensors'],
        loras: [],
        samplers: ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde'],
        schedulers: ['normal', 'karras', 'exponential', 'sgm_uniform']
      };
    }
  }

  /**
   * Queues a workflow prompt execution.
   */
  async queuePrompt(workflowGraph) {
    const payload = {
      prompt: workflowGraph,
      client_id: this.clientId
    };
    const res = await this._request('/prompt', 'POST', payload);
    return {
      promptId: res.prompt_id,
      number: res.number,
      nodeErrors: res.node_errors || null
    };
  }

  /**
   * Polls execution history until the prompt completes or times out.
   */
  async pollPromptHistory(promptId, timeoutMs = 60000, pollIntervalMs = 500) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const history = await this._request(`/history/${promptId}`);
        const record = history[promptId];

        if (record) {
          const status = record.status || {};
          if (status.status_str === 'error') {
            const errDetails = status.messages ? JSON.stringify(status.messages) : 'Execution error';
            throw new Error(`ComfyUI generation failed: ${errDetails}`);
          }

          if (record.outputs && Object.keys(record.outputs).length > 0) {
            // Completed!
            const images = [];
            for (const [, outData] of Object.entries(record.outputs)) {
              if (outData.images && Array.isArray(outData.images)) {
                for (const img of outData.images) {
                  images.push({
                    filename: img.filename,
                    subfolder: img.subfolder || '',
                    type: img.type || 'output'
                  });
                }
              }
              if (outData.gifs && Array.isArray(outData.gifs)) {
                for (const gif of outData.gifs) {
                  images.push({
                    filename: gif.filename,
                    subfolder: gif.subfolder || '',
                    type: gif.type || 'output'
                  });
                }
              }
            }
            return {
              completed: true,
              promptId,
              outputs: images,
              elapsedMs: Date.now() - startTime
            };
          }
        }
      } catch (err) {
        if (err.message.includes('ComfyUI generation failed')) {
          throw err;
        }
        // Transient network blip during generation, keep polling
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms for prompt ID ${promptId}`);
  }

  /**
   * Fetches an output image buffer from ComfyUI /view.
   */
  async fetchOutputImage(filename, subfolder = '', type = 'output') {
    const q = new URLSearchParams({ filename, subfolder, type });
    return this._request(`/view?${q.toString()}`, 'GET', null, true);
  }

  /**
   * Executes a workflow end-to-end: queues prompt, polls history, downloads media, and saves locally.
   */
  async executeWorkflow({
    workflow,
    outputDir = null,
    timeoutMs = 60000
  }) {
    const targetDir = outputDir || getMavePicturesDir();
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. Submit prompt to ComfyUI
    const queueRes = await this.queuePrompt(workflow);
    const promptId = queueRes.promptId;

    // 2. Poll for completion
    const historyRes = await this.pollPromptHistory(promptId, timeoutMs);

    // 3. Download generated assets
    const savedAssets = [];
    for (const item of historyRes.outputs) {
      const buffer = await this.fetchOutputImage(item.filename, item.subfolder, item.type);
      const destPath = path.join(targetDir, item.filename);
      fs.writeFileSync(destPath, buffer);
      savedAssets.push({
        filename: item.filename,
        filePath: destPath,
        bytes: buffer.length
      });
    }

    return {
      ok: true,
      promptId,
      assets: savedAssets,
      elapsedMs: historyRes.elapsedMs
    };
  }

  /**
   * Offline fallback generator: when ComfyUI is not currently active, exports the valid DAG
   * workflow JSON to disk so the user can import it, and synthesizes an immediate preview.
   */
  generateOfflineFallback({
    prompt,
    workflowGraph,
    workflowType = 'text2img'
  }) {
    const timestamp = Date.now();
    const picturesDir = getMavePicturesDir();
    const workflowFilename = `Mave_Comfy_${workflowType}_${timestamp}.json`;
    const workflowPath = path.join(picturesDir, workflowFilename);

    // Save the executable workflow JSON
    fs.writeFileSync(workflowPath, JSON.stringify(workflowGraph, null, 2), 'utf8');

    // Create a local procedural fallback preview card
    const previewFilename = `Mave_Comfy_Preview_${timestamp}.svg`;
    const previewPath = path.join(picturesDir, previewFilename);
    const cleanPrompt = String(prompt || 'ComfyUI Workflow').replace(/[<>&"']/g, '');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e1b4b"/>
          <stop offset="100%" stop-color="#311042"/>
        </linearGradient>
        <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#c084fc"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="28" fill="url(#bg)"/>
      <g transform="translate(512, 420)">
        <polygon points="0,-160 140,-80 140,80 0,160 -140,80 -140,-80" fill="none" stroke="url(#neon)" stroke-width="6"/>
        <circle cx="0" cy="0" r="48" fill="#38bdf8" opacity="0.8"/>
        <text x="0" y="8" font-family="sans-serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">DAG</text>
      </g>
      <rect x="64" y="780" width="896" height="180" rx="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)"/>
      <text x="100" y="830" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff">ComfyUI DAG Workflow Ready</text>
      <text x="100" y="865" font-family="sans-serif" font-size="16" fill="#38bdf8">${cleanPrompt.slice(0, 80)}</text>
      <text x="100" y="900" font-family="sans-serif" font-size="14" fill="#94a3b8">Workflow saved: ${workflowFilename}</text>
      <text x="100" y="930" font-family="sans-serif" font-size="14" fill="#e2e8f0">Drag and drop into ComfyUI at http://127.0.0.1:8188</text>
    </svg>`;

    fs.writeFileSync(previewPath, svg, 'utf8');

    return {
      ok: true,
      offline: true,
      workflowPath,
      workflowFilename,
      previewPath,
      previewFilename,
      launchTip: `Start ComfyUI using: python main.py --listen 127.0.0.1 --port 8188`
    };
  }
}

let defaultComfyClient = null;
function getComfyClient() {
  if (!defaultComfyClient) {
    defaultComfyClient = new ComfyClient();
  }
  return defaultComfyClient;
}

module.exports = {
  ComfyClient,
  getComfyClient
};
