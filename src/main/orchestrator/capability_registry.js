'use strict';

const os = require('os');

const CapabilityTier = {
  VERIFIED_SKILL: 1,
  INSTALLED_TOOL: 2,
  LOCAL_SPECIALIST_MODEL: 3,
  MESH_WORKER_DEVICE: 4,
  FREE_FOSS_TOOL: 5,
  FREE_LOCAL_MODEL: 6,
  FREE_TIER_API: 7,
  AUTHORIZED_PAID_API: 8,
  RESEARCH_AND_BUILD_SKILL: 9,
  GENUINE_LIMITATION: 10,
};

const ModelRole = {
  ORCHESTRATION: 'orchestration',
  CODING: 'coding',
  COMPLEX_REASONING: 'complex_reasoning',
  RESEARCH: 'research',
  VISION: 'vision',
  SPEECH_RECOGNITION: 'stt',
  SPEECH_SYNTHESIS: 'tts',
  MATHEMATICS: 'math',
  IMAGE_GENERATION: 'image_gen',
  DOCUMENT_UNDERSTANDING: 'doc_understanding',
  EMBEDDINGS: 'embeddings',
  RERANKING: 'reranking',
  VERIFICATION: 'verification',
};

const RoutingPreference = {
  STRICT_LOCAL_ONLY: 'strict_local_only',
  FREE_TOOLS_ONLY: 'free_tools_only',
  PREFER_FREE: 'prefer_free',
  BALANCED: 'balanced',
  BEST_QUALITY: 'best_quality',
  FASTEST_RESPONSE: 'fastest_response',
  MAXIMUM_PRIVACY: 'maximum_privacy',
  CUSTOM: 'custom',
};

class CapabilityRegistry {
  constructor(options = {}) {
    this.models = new Map();
    this.tools = new Map();
    this.skills = new Map();
    this.meshWorkers = new Map();
    this.routingPreference = options.defaultPreference || RoutingPreference.PREFER_FREE;
    this.initDefaultModels();
  }

  setRoutingPreference(pref) {
    if (Object.values(RoutingPreference).includes(pref)) {
      this.routingPreference = pref;
    }
  }

  getRoutingPreference() {
    return this.routingPreference;
  }

  registerModel(modelSpec) {
    if (!modelSpec.id) throw new Error('Model specification requires an id.');
    const entry = {
      id: modelSpec.id,
      label: modelSpec.label || modelSpec.id,
      provider: modelSpec.provider || 'local',
      source: modelSpec.source || 'disk',
      architecture: modelSpec.architecture || 'transformer',
      roles: Array.isArray(modelSpec.roles) ? modelSpec.roles : [ModelRole.ORCHESTRATION],
      modality: modelSpec.modality || ['text'],
      toolCalling: Boolean(modelSpec.toolCalling),
      contextWindow: Number(modelSpec.contextWindow) || 8192,
      license: modelSpec.license || 'open-weights',
      vramGB: Number(modelSpec.vramGB) || 0,
      ramGB: Number(modelSpec.ramGB) || 4,
      costPerMillionInputTokens: Number(modelSpec.costPerMillionInputTokens) || 0,
      costPerMillionOutputTokens: Number(modelSpec.costPerMillionOutputTokens) || 0,
      isFree: modelSpec.isFree !== undefined ? Boolean(modelSpec.isFree) : (modelSpec.provider === 'local'),
      isLocal: modelSpec.isLocal !== undefined ? Boolean(modelSpec.isLocal) : (modelSpec.provider === 'local'),
      installed: Boolean(modelSpec.installed),
      successCount: 0,
      failureCount: 0,
      lastVerificationDate: Date.now(),
    };
    this.models.set(entry.id, entry);
    return entry;
  }

  initDefaultModels() {
    // 1. Local Qwen3-VL 8B (Vision, UI Automation, General Local)
    this.registerModel({
      id: 'qwen3-vl-8b',
      label: 'Qwen3-VL 8B Instruct (Local GPU/Vulkan)',
      provider: 'local',
      roles: [ModelRole.ORCHESTRATION, ModelRole.VISION, ModelRole.CODING],
      modality: ['text', 'image'],
      toolCalling: true,
      contextWindow: 8192,
      vramGB: 6.0,
      ramGB: 8.0,
      isFree: true,
      isLocal: true,
      installed: true,
    });

    // 2. Colibri Qwen 35B / DeepSeek (Heavy local reasoning)
    this.registerModel({
      id: 'qwen36-35b',
      label: 'Qwen 3.6 35B MoE (Colibri Disk-Streaming)',
      provider: 'colibri',
      roles: [ModelRole.COMPLEX_REASONING, ModelRole.CODING, ModelRole.RESEARCH],
      modality: ['text'],
      toolCalling: true,
      contextWindow: 32768,
      vramGB: 4.0,
      ramGB: 24.0,
      isFree: true,
      isLocal: true,
      installed: true,
    });

    // 3. Kokoro TTS (Speech synthesis ONNX)
    this.registerModel({
      id: 'kokoro-82m',
      label: 'Kokoro 82M Speech Synthesizer',
      provider: 'local',
      roles: [ModelRole.SPEECH_SYNTHESIS],
      modality: ['audio'],
      toolCalling: false,
      contextWindow: 512,
      vramGB: 0,
      ramGB: 1.0,
      isFree: true,
      isLocal: true,
      installed: true,
    });

    // 4. Whisper STT (Speech recognition)
    this.registerModel({
      id: 'whisper-base-en',
      label: 'Whisper Base English (Local)',
      provider: 'local',
      roles: [ModelRole.SPEECH_RECOGNITION],
      modality: ['audio'],
      toolCalling: false,
      contextWindow: 1024,
      vramGB: 0,
      ramGB: 1.0,
      isFree: true,
      isLocal: true,
      installed: true,
    });

    // 5. Cloud Anthropic Claude 3.5 Sonnet (Authorized Paid API)
    this.registerModel({
      id: 'claude-3-5-sonnet',
      label: 'Claude 3.5 Sonnet (Anthropic)',
      provider: 'anthropic',
      roles: [ModelRole.CODING, ModelRole.COMPLEX_REASONING, ModelRole.ORCHESTRATION, ModelRole.VERIFICATION],
      modality: ['text', 'image'],
      toolCalling: true,
      contextWindow: 200000,
      costPerMillionInputTokens: 3.0,
      costPerMillionOutputTokens: 15.0,
      isFree: false,
      isLocal: false,
      installed: false,
    });

    // 6. Cloud OpenAI GPT-4o (Authorized Paid API)
    this.registerModel({
      id: 'gpt-4o',
      label: 'GPT-4o (OpenAI)',
      provider: 'openai',
      roles: [ModelRole.CODING, ModelRole.COMPLEX_REASONING, ModelRole.ORCHESTRATION, ModelRole.VISION],
      modality: ['text', 'image'],
      toolCalling: true,
      contextWindow: 128000,
      costPerMillionInputTokens: 2.5,
      costPerMillionOutputTokens: 10.0,
      isFree: false,
      isLocal: false,
      installed: false,
    });
  }

  registerSkill(skill) {
    if (!skill.name) throw new Error('Skill requires a name.');
    this.skills.set(skill.name, {
      ...skill,
      tier: CapabilityTier.VERIFIED_SKILL,
      registeredAt: Date.now(),
    });
  }

  registerTool(tool) {
    if (!tool.name) throw new Error('Tool requires a name.');
    this.tools.set(tool.name, {
      ...tool,
      tier: CapabilityTier.INSTALLED_TOOL,
      registeredAt: Date.now(),
    });
  }

  registerMeshWorker(worker) {
    if (!worker.id) throw new Error('Worker requires an id.');
    this.meshWorkers.set(worker.id, {
      ...worker,
      tier: CapabilityTier.MESH_WORKER_DEVICE,
      registeredAt: Date.now(),
    });
  }

  /**
   * Resolve the best capability and provider according to the 10-tier hierarchy & user preference.
   * @param {object} query
   * @param {string} query.task - Description of task
   * @param {string} [query.requiredRole] - ModelRole
   * @param {string} [query.requiredModality] - 'text' | 'image' | 'audio'
   * @param {boolean} [query.online=true] - Internet connectivity
   * @param {boolean} [query.requiresToolCalling=true]
   */
  resolveBestCapability(query = {}) {
    const role = query.requiredRole || ModelRole.ORCHESTRATION;
    const pref = this.routingPreference;
    const online = query.online !== false;

    // 1. Check if a dedicated verified skill handles this task
    for (const [name, skill] of this.skills.entries()) {
      if (skill.matchPattern && skill.matchPattern.test(query.task)) {
        return {
          resolvedTier: CapabilityTier.VERIFIED_SKILL,
          type: 'skill',
          target: skill,
          reason: `Matched verified skill "${name}"`,
        };
      }
    }

    // 2. Filter candidate models by role, modality, and tool calling
    const candidates = Array.from(this.models.values()).filter((m) => {
      if (!m.roles.includes(role)) return false;
      if (query.requiredModality && !m.modality.includes(query.requiredModality)) return false;
      if (query.requiresToolCalling && !m.toolCalling) return false;
      if (!online && !m.isLocal) return false;
      if (pref === RoutingPreference.STRICT_LOCAL_ONLY && !m.isLocal) return false;
      if (pref === RoutingPreference.FREE_TOOLS_ONLY && !m.isFree) return false;
      return true;
    });

    if (candidates.length === 0) {
      return {
        resolvedTier: CapabilityTier.RESEARCH_AND_BUILD_SKILL,
        type: 'research',
        reason: `No installed model or tool directly covers role "${role}". Research or skill synthesis needed.`,
      };
    }

    // Rank candidates by preference
    candidates.sort((a, b) => {
      // 1. Prefer local / free if preference demands
      if (pref === RoutingPreference.PREFER_FREE || pref === RoutingPreference.MAXIMUM_PRIVACY) {
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      }
      if (pref === RoutingPreference.BEST_QUALITY) {
        // High-context cloud models rank higher if online
        if (a.contextWindow !== b.contextWindow) return b.contextWindow - a.contextWindow;
      }
      // Prefer installed models over uninstalled
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      // Prefer models with higher success history
      const scoreA = a.successCount - a.failureCount * 2;
      const scoreB = b.successCount - b.failureCount * 2;
      return scoreB - scoreA;
    });

    const bestModel = candidates[0];
    const tier = bestModel.isLocal
      ? (bestModel.isFree ? CapabilityTier.LOCAL_SPECIALIST_MODEL : CapabilityTier.FREE_LOCAL_MODEL)
      : (bestModel.isFree ? CapabilityTier.FREE_TIER_API : CapabilityTier.AUTHORIZED_PAID_API);

    return {
      resolvedTier: tier,
      type: 'model',
      target: bestModel,
      reason: `Selected ${bestModel.label} under preference "${pref}" for role "${role}".`,
    };
  }

  recordTaskOutcome(modelId, success = true) {
    const m = this.models.get(modelId);
    if (m) {
      if (success) m.successCount++;
      else m.failureCount++;
      m.lastVerificationDate = Date.now();
    }
  }
}

let defaultCapabilityRegistry = null;

function getCapabilityRegistry() {
  if (!defaultCapabilityRegistry) {
    defaultCapabilityRegistry = new CapabilityRegistry();
  }
  return defaultCapabilityRegistry;
}

module.exports = {
  CapabilityTier,
  ModelRole,
  RoutingPreference,
  CapabilityRegistry,
  getCapabilityRegistry,
};
