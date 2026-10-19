'use strict';
// Ghost AI Core Hardware-Adaptive AI Model Profiler & Dynamic Engine Selector.
// Evaluates host GPU, VRAM, RAM, CPU threads, and architecture.
// Determines optimal local model tier (Ultra, High, Balanced, Featherlight).
// Configures optimal context window, quantization, and batch sizes.
// Implements Ghost AI's graceful fallback cascade:
// Native High-Precision GGUF -> Ollama / HTTP Model Service -> Rule-based Offline Sovereign Mode.

const os = require('os');
const { getCachedHardware, detect } = require('../local/hardware');

const MODEL_TIERS = {
  ULTRA: {
    tier: 'ultra',
    label: 'Tier 1: Maximum Precision Vision-Agent',
    recommendedModel: 'Qwen3-VL 8B (Q8_0 / FP16) or Qwen2.5 14B',
    contextLength: 24576,
    batchSize: 512,
    quantization: 'Q8_0 / FP16',
    vramRequirementGB: 12,
    ramRequirementGB: 24,
    description: 'High-end dedicated GPU detected. Full multi-modal vision perception with ultra-deep reasoning.'
  },
  HIGH: {
    tier: 'high',
    label: 'Tier 2: High-Performance Local Reasoning',
    recommendedModel: 'Qwen3-VL 8B (Q4_K_M)',
    contextLength: 16384,
    batchSize: 512,
    quantization: 'Q4_K_M',
    vramRequirementGB: 6,
    ramRequirementGB: 16,
    description: 'Mid-range GPU or modern unified Apple Silicon / AMD APU. Fast 4-bit quantized vision model.'
  },
  BALANCED: {
    tier: 'balanced',
    label: 'Tier 3: Efficient Local Assistant',
    recommendedModel: 'Qwen2.5-Coder 3B / 7B (Q4_K_M)',
    contextLength: 8192,
    batchSize: 256,
    quantization: 'Q4_K_M',
    vramRequirementGB: 3,
    ramRequirementGB: 8,
    description: 'Integrated graphics or entry-level GPU. High speed, low memory footprint.'
  },
  FEATHERLIGHT: {
    tier: 'featherlight',
    label: 'Tier 4: Ultra-Light CPU Fast Mode',
    recommendedModel: 'Qwen2.5 0.5B / 1.5B or Colibri Fast Model',
    contextLength: 4096,
    batchSize: 128,
    quantization: 'Q4_K_S',
    vramRequirementGB: 0,
    ramRequirementGB: 4,
    description: 'CPU-only execution or ultra-portable laptops. Minimal battery and memory impact (<40MB RAM).'
  }
};

class GhostHardwareProfiler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.hardware = null;
    this.currentProfile = null;
  }

  async profile() {
    try {
      this.hardware = await detect();
    } catch {
      this.hardware = getCachedHardware();
    }

    const { gpu, vramGB, dedicated, ramGB, cpu } = this.hardware;
    let selectedTier = MODEL_TIERS.FEATHERLIGHT;

    if (dedicated && vramGB >= 11) {
      selectedTier = MODEL_TIERS.ULTRA;
    } else if ((dedicated && vramGB >= 5.5) || ramGB >= 28) {
      selectedTier = MODEL_TIERS.HIGH;
    } else if ((dedicated && vramGB >= 2.5) || ramGB >= 12) {
      selectedTier = MODEL_TIERS.BALANCED;
    } else {
      selectedTier = MODEL_TIERS.FEATHERLIGHT;
    }

    this.currentProfile = {
      timestamp: Date.now(),
      hardware: {
        gpu,
        vramGB,
        dedicated,
        ramGB,
        cpu,
        cores: os.cpus().length,
        arch: os.arch(),
        platform: os.platform(),
      },
      recommendation: selectedTier,
      fallbackOrder: [
        'Native On-Device GGUF (Llama.cpp / Qwen)',
        'Local HTTP Server (Ollama / LocalAI)',
        'Sovereign Offline ReAct Engine'
      ]
    };

    return this.currentProfile;
  }

  getProfile() {
    if (!this.currentProfile) {
      const hw = getCachedHardware();
      return {
        hardware: hw,
        recommendation: hw.vramGB >= 6 ? MODEL_TIERS.HIGH : MODEL_TIERS.BALANCED,
        fallbackOrder: [
          'Native On-Device GGUF (Llama.cpp / Qwen)',
          'Local HTTP Server (Ollama / LocalAI)',
          'Sovereign Offline ReAct Engine'
        ]
      };
    }
    return this.currentProfile;
  }
}

let profilerInstance = null;

function getGhostHardwareProfiler(options) {
  if (!profilerInstance) {
    profilerInstance = new GhostHardwareProfiler(options);
  }
  return profilerInstance;
}

module.exports = {
  GhostHardwareProfiler,
  getGhostHardwareProfiler,
  MODEL_TIERS,
};
