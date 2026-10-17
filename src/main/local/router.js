'use strict';
// Autonomous Local Model Complexity Router for Bigfoot.
// Strategy A: Pre-Task Complexity Routing (Classifies incoming tasks into Fast/Light vs Heavy/Deep models).
// Strategy B: Runtime Escalation (Escalates tasks to a heavier local model if the light model encounters roadblocks or loops).

const catalog = require('./catalog');
const hardware = require('./hardware');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Explicit requests for AirLLM engine or layer-streaming
const EXPLICIT_AIRLLM_PATTERNS = [
  { pattern: /\b(airllm|layer[- ]streaming|stream[- ]layers?|layer[- ]wise|disk[- ]stream(?:ing)?)\b/i, weight: 6, reason: 'explicit airllm layer-streaming request' },
];

const BRAIN_PATTERNS = [
  { pattern: /\b(architect|system architecture|distributed system|microservice architecture|database schema design|event-driven)\b/i, weight: 5, reason: 'frontier system architecture' },
  { pattern: /\b(theorem|proof|differential equation|linear algebra|eigenvalue|eigenvector|fourier transform|np-complete|p vs np|algorithm proof|formal proof)\b/i, weight: 5, reason: 'advanced theoretical math/proofs' },
  { pattern: /\b(complex refactor|memory leak analysis|deadlock detection|race condition|disassembly|reverse engineering|cryptographic proof|vulnerability)\b/i, weight: 5, reason: 'deep code/systems analysis' },
  { pattern: /\b(think deeply|reason deeply|sol tier|gpt sol|frontier reasoning|step-by-step rigorous proof|frontier model)\b/i, weight: 6, reason: 'explicit sol-tier frontier reasoning request' },
];

const HEAVY_PATTERNS = [
  ...EXPLICIT_AIRLLM_PATTERNS,
  ...BRAIN_PATTERNS,
  { pattern: /\b(write|create|implement|refactor|debug|fix|architect)\s+(?:a\s+)?(?:code|function|script|program|class|component|app|server|module|api|database|query)\b/i, weight: 4, reason: 'software engineering task' },
  { pattern: /\b(powershell|bash|python|javascript|typescript|csharp|rust|golang|html|css|sql|dockerfile)\b/i, weight: 3, reason: 'programming language mentioned' },
  { pattern: /\b(stack trace|syntax error|nullpointer|exception|segmentation fault|typeerror|failed build|bug in)\b/i, weight: 4, reason: 'debugging / error analysis' },
  { pattern: /\b(step[- ]by[- ]step|plan|architecture|multi[- ]step|algorithm|regex|data structure|optimize)\b/i, weight: 3, reason: 'multi-step algorithmic reasoning' },
  { pattern: /\b(integral|derivative|differential|calculus|matrix multiplication|eigenvalue|theorem|proof)\b/i, weight: 3, reason: 'advanced mathematics' },
  { pattern: /\b(analyze this codebase|compare and contrast|explain why this happens in detail)\b/i, weight: 2, reason: 'deep conceptual explanation' },
  { pattern: /\b(deep research|comprehensive research|research and learn|synthesize knowledge)\b/i, weight: 4, reason: 'deep knowledge synthesis' },
];

const LIGHT_PATTERNS = [
  { pattern: /\b(click|press|tap|scroll|open the|close the|switch to|maximize|minimize)\b/i, weight: 2, reason: 'direct UI navigation' },
  { pattern: /\b(what(?:'s| is) on (?:the |my )?screen|where is the|read this button|which button)\b/i, weight: 2, reason: 'screen inspection' },
  { pattern: /\b(open (?:chrome|notepad|spotify|calculator|edge|paint|settings)|play music|pause)\b/i, weight: 2, reason: 'app launching' },
  { pattern: /\b(type|write in|fill out)\s+["'][^"']+["']/i, weight: 1, reason: 'simple text entry' },
  { pattern: /\b(draw a|annotate|tidy my drawing|add an arrow|circle the)\b/i, weight: 2, reason: 'visual overlay annotation' },
  { pattern: /\b(hello|hi|hey|thanks|thank you|who are you|what time is it)\b/i, weight: 3, reason: 'everyday conversational greeting' },
  { pattern: /\b(mute|unmute|volume up|volume down|play|pause|media)\b/i, weight: 2, reason: 'media control' },
];

/**
 * Estimate required memory in GB for a model or parameter size string.
 */
function estimateMemoryGB(modelOrSize) {
  if (!modelOrSize) return 4.2;

  if (typeof modelOrSize === 'object') {
    if (modelOrSize.memoryGB != null) return Number(modelOrSize.memoryGB);
    if (modelOrSize.id) {
      const found = catalog.modelById(modelOrSize.id);
      if (found && found.memoryGB != null) return Number(found.memoryGB);
    }
    modelOrSize = modelOrSize.size || modelOrSize.id || modelOrSize.label || '';
  }

  const str = String(modelOrSize).toLowerCase().trim();

  // Check catalog
  const found = catalog.modelById(str);
  if (found && found.memoryGB != null) return Number(found.memoryGB);

  // Exact known size mappings for standard Q4/quantized weights + KV cache
  if (str.includes('671b')) return 80.0;
  if (str.includes('284b')) return 40.0;
  if (str.includes('72b')) return 44.0;
  if (str.includes('70b')) return 42.0;
  if (str.includes('35b')) return 23.0;
  if (str.includes('32b')) return 22.0;
  if (str.includes('30b')) return 21.0;
  if (str.includes('14b')) return 11.0;
  if (str.includes('8b')) return 7.2;
  if (str.includes('7b')) return 6.5;
  if (str.includes('4b')) return 4.2;
  if (str.includes('3b')) return 3.5;
  if (str.includes('2b')) return 2.5;

  const m = str.match(/\b(\d+(?:\.\d+)?)\s*b\b/i);
  if (m) {
    const params = parseFloat(m[1]);
    return Math.max(2, Math.round((params * 0.65 + 1.5) * 10) / 10);
  }

  return 4.2;
}

/**
 * Calculate total usable native memory (VRAM + usable RAM) for running models natively.
 */
function getUsableNativeMemory(hw = null) {
  const targetHw = hw || (typeof hardware.getCachedHardware === 'function' ? hardware.getCachedHardware() : null) || {
    dedicated: false,
    vramGB: 0,
    ramGB: Math.round(os.totalmem() / (1024 ** 3)),
  };

  const vram = targetHw.dedicated ? (Number(targetHw.vramGB) || 0) : 0;
  const ram = Number(targetHw.ramGB) || 0;
  const usableRam = Math.max(0, ram - 3.5) * 0.85;
  return Math.round((vram + usableRam) * 10) / 10;
}

/**
 * Check if the host hardware can run a model natively without layer-streaming.
 */
function canRunNatively(modelOrSize, hw = null) {
  const reqMem = estimateMemoryGB(modelOrSize);
  const usable = getUsableNativeMemory(hw);
  return usable >= reqMem;
}

/**
 * Check if AirLLM layer-streaming should be used.
 * AirLLM is ONLY needed if:
 * 1. User explicitly requested AirLLM or layer-streaming, OR
 * 2. Model memory exceeds native hardware capability (!canRunNatively).
 */
function shouldStreamWithAirLLM(modelOrSize, hw = null, explicitRequest = false) {
  if (explicitRequest) return true;
  return !canRunNatively(modelOrSize, hw);
}

/**
 * Classify task prompt complexity into 3 tiers (or AirLLM when hardware overflow requires it):
 * - 'vision' (The Eyes): UI navigation, mouse, screen inspection, voice, greetings -> Qwen3-VL
 * - 'mid' (The Workhorse): Everyday coding, bash/PowerShell, functions, scripts -> Qwen3.6-35B
 * - 'brain' (The Sol Thinker): Deep architecture, hard math proofs, multi-file refactors -> DeepSeek-V4 Flash
 * - 'airllm': Layer-streaming reserved for models that exceed native hardware VRAM/RAM or explicit request
 */
function classifyComplexity(task, hw = null) {
  const text = String(task || '').trim();
  if (!text) return { tier: 'light', tier3: 'vision', score: 0, suggestedModel: 'qwen3-vl-8b', reasons: ['empty prompt'] };

  let score = 0;
  let brainScore = 0;
  let airllmScore = 0;
  const reasons = [];

  for (const { pattern, weight } of EXPLICIT_AIRLLM_PATTERNS) {
    if (pattern.test(text)) {
      airllmScore += weight;
    }
  }

  for (const { pattern, weight, reason } of BRAIN_PATTERNS) {
    if (pattern.test(text)) {
      brainScore += weight;
    }
  }

  for (const { pattern, weight, reason } of HEAVY_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
      reasons.push(`+${weight} (${reason})`);
    }
  }

  for (const { pattern, weight, reason } of LIGHT_PATTERNS) {
    if (pattern.test(text)) {
      score -= weight;
      reasons.push(`-${weight} (${reason})`);
    }
  }

  // Length factor: long, complex prompts lean towards heavy
  if (text.length > 250) {
    score += 1;
    reasons.push('+1 (prompt length > 250 chars)');
  }
  if (text.length > 500) {
    brainScore += 2;
  }

  const isExplicitAirLLM = airllmScore >= 5 || /\b(airllm|layer[- ]streaming|stream[- ]layers?)\b/i.test(text);

  // Check if specific model sizes are requested
  const mentions70b = /\b(70b|72b|llama[- ]3[- ]70b|qwen[- ]72b)\b/i.test(text);
  const mentions32b = /\b(32b|30b|35b|qwen3[- ]32b)\b/i.test(text);
  const mentions8b = /\b(8b|7b|qwen3-vl-8b|llama[- ]3[- ]8b)\b/i.test(text);
  const mentions4b = /\b(4b|3b|2b|qwen3-vl-4b)\b/i.test(text);
  const mentionsMoE = /\b(deepseek[- ]v3|671b|284b)\b/i.test(text);

  let tier = score >= 3 ? 'heavy' : 'light';
  let tier3 = 'vision';
  let suggestedModel = 'qwen3-vl-8b';

  if (isExplicitAirLLM) {
    tier = 'heavy';
    tier3 = 'airllm';
    if (mentions32b) suggestedModel = 'airllm-Qwen-Qwen3-32B';
    else if (mentionsMoE) suggestedModel = 'airllm-deepseek-ai-DeepSeek-V3';
    else suggestedModel = 'airllm-meta-llama-Meta-Llama-3-70B-Instruct';
    reasons.push('explicit airllm layer-streaming requested');
  } else if (mentions4b || mentions8b) {
    // 4B and 8B models easily run natively in GPU VRAM or system RAM.
    // AirLLM layer-streaming is NEVER used for models that fit natively.
    tier = mentions8b && score >= 3 ? 'heavy' : 'light';
    tier3 = 'vision';
    suggestedModel = mentions4b ? 'qwen3-vl-4b' : 'qwen3-vl-8b';
    reasons.push(`${mentions4b ? '4B' : '8B'} model requested: runs natively at full GPU/CPU speed`);
  } else if (mentions70b) {
    if (canRunNatively('70b', hw)) {
      tier = 'heavy';
      tier3 = 'brain';
      suggestedModel = 'deepseek-v4-flash';
      reasons.push('70B requested: device hardware has sufficient capacity to run natively at full speed');
    } else {
      tier = 'heavy';
      tier3 = 'airllm';
      suggestedModel = 'airllm-meta-llama-Meta-Llama-3-70B-Instruct';
      reasons.push('70B requested: exceeds native hardware VRAM/RAM, streaming layers via AirLLM to prevent OOM');
    }
  } else if (mentions32b) {
    if (canRunNatively('32b', hw)) {
      tier = 'heavy';
      tier3 = 'mid';
      suggestedModel = 'qwen36-35b';
      reasons.push('32B requested: device hardware runs natively at full speed');
    } else {
      tier = 'heavy';
      tier3 = 'airllm';
      suggestedModel = 'airllm-Qwen-Qwen3-32B';
      reasons.push('32B requested: exceeds native memory, streaming layers via AirLLM');
    }
  } else if (mentionsMoE) {
    if (canRunNatively('671b', hw)) {
      tier = 'heavy';
      tier3 = 'brain';
      suggestedModel = 'deepseek-v4-flash';
    } else {
      tier = 'heavy';
      tier3 = 'airllm';
      suggestedModel = 'airllm-deepseek-ai-DeepSeek-V3';
      reasons.push('671B MoE exceeds native VRAM, streaming via AirLLM');
    }
  } else if (brainScore >= 5 || (score >= 7 && text.length > 300)) {
    tier3 = 'brain';
    suggestedModel = 'deepseek-v4-flash';
  } else if (score >= 3) {
    tier3 = 'mid';
    suggestedModel = 'qwen36-35b';
  } else {
    tier3 = 'vision';
    suggestedModel = 'qwen3-vl-8b';
  }

  return { tier, tier3, score, brainScore, airllmScore, suggestedModel, reasons, nativeCapable: canRunNatively(suggestedModel, hw) };
}



/**
 * Get all models that are actually installed and verified complete on disk.
 */
function getInstalledModels(manager = null) {
  if (manager && typeof manager.complete === 'function') {
    return catalog.allModels().filter((m) => manager.complete(m.id));
  }
  try {
    const baseDir = process.env.BIGFOOT_PROFILE_DIR
      ? path.join(process.env.BIGFOOT_PROFILE_DIR, 'local-ai')
      : path.join(os.homedir(), '.bigfoot', 'local-ai');
    return catalog.allModels().filter((m) => {
      if (m.custom) return m.modelPath && fs.existsSync(m.modelPath);
      if (!m.files || !m.files.length) return false;
      return m.files.every((f) => {
        try {
          const p = path.join(baseDir, 'models', m.id, f.name);
          return fs.existsSync(p) && fs.statSync(p).size === f.size;
        } catch { return false; }
      });
    });
  } catch {
    return [];
  }
}

/**
 * Detect available local light and heavy model tiers from installed models or catalog.
 * In live execution with manager/installedOnly, only models verified on disk are used.
 * In catalog inspection or unit tests, all catalog models are considered.
 */
function getModelTiers(options = {}) {
  const opts = options && typeof options.complete === 'function' ? { manager: options } : (options || {});
  const { manager = null, installedOnly = false } = opts;

  const installed = manager ? getInstalledModels(manager) : [];
  let pool = installed.length > 0 ? installed : (installedOnly ? [] : catalog.MODELS);

  if (pool.length === 0) {
    const fallback = catalog.modelById('qwen3-vl-8b') || catalog.allModels()[0];
    return { light: fallback, heavy: fallback, canRoute: false };
  }

  if (pool.length === 1) {
    return { light: pool[0], heavy: pool[0], canRoute: false };
  }

  let light = null;
  let heavy = null;

  for (const m of pool) {
    const mem = Number(m.memoryGB) || 4;
    const isSmall = mem <= 5.5 || /(?:2b|3b|4b|small|tiny)/i.test(`${m.id} ${m.size} ${m.label}`);
    const isLarge = mem > 5.5 || /(?:8b|14b|30b|70b|large|deepseek)/i.test(`${m.id} ${m.size} ${m.label}`);

    if (isSmall && (!light || mem < (light.memoryGB || 99))) {
      light = m;
    }
    if (isLarge && (!heavy || mem > (heavy.memoryGB || 0))) {
      heavy = m;
    }
  }

  if (!light) light = pool[0];
  if (!heavy) heavy = pool[pool.length - 1];

  const airllmModels = typeof catalog.scanAirLLMModels === 'function' ? catalog.scanAirLLMModels() : [];
  const airllm = airllmModels.length > 0 ? airllmModels[0] : null;

  const canRoute = Boolean(light && heavy && light.id !== heavy.id);
  return { light, heavy, airllm, canRoute };
}

/**
 * Strategy A: Determine the optimal local model for a task before execution.
 */
function selectModelForTask(task, currentModelId = '', manager = null, hw = null) {
  const { light, heavy, airllm, canRoute } = getModelTiers({ manager, installedOnly: Boolean(manager) });
  if (!canRoute) {
    const cur = currentModelId || (light && light.id);
    return { targetId: cur, tier: 'default', reason: 'single local model installed', changed: false };
  }

  const classification = classifyComplexity(task, hw);
  const { tier, tier3, score, brainScore, airllmScore, suggestedModel, reasons } = classification;
  let target = tier === 'heavy' ? heavy : light;
  if (tier3 === 'airllm' && airllm) {
    target = airllm;
  }
  return {
    targetId: target.id,
    targetModel: target,
    tier,
    tier3,
    score,
    brainScore,
    airllmScore,
    suggestedModel,
    reasons,
    hardwareAdaptive: true,
    nativeFit: canRunNatively(suggestedModel, hw),
    changed: target.id !== currentModelId,
  };
}

/**
 * Strategy B: Check if execution should escalate from light to heavy tier.
 */
function shouldEscalate({ currentModelId, repeats = 0, nudges = 0, consecutiveErrors = 0 }, manager = null) {
  const { light, heavy, canRoute } = getModelTiers({ manager, installedOnly: Boolean(manager) });
  if (!canRoute || !heavy) return false;

  // Only escalate if currently running on the light model
  const isLight = currentModelId ? currentModelId === light.id : true;
  if (!isLight) return false;

  // Triggers: model repeated actions, failed to act after nudges, or failed 2+ tool calls
  return repeats >= 1 || nudges >= 2 || consecutiveErrors >= 2;
}

/**
 * Infer the desktop companion's visual task mode (Meta Muse modes):
 * - 'coding': software engineering, scripting, debugging, testing, terminals, Antigravity/Codex
 * - 'research': web search, research papers, grants/forms, comparing Claude & ChatGPT, reports
 * - 'thinking': deep reasoning, mathematics, formal proofs, architectural planning, philosophy
 * - 'action': computer navigation, UI clicking, typing, media control, desktop automation
 * - 'sleep': goodnight, sleeping, resting, idling down
 * - 'idle': conversational greetings, casual chat, completed state
 */
function inferTaskMode(task = '', intent = null) {
  const t = String(task || '').toLowerCase();
  if (!t.trim()) return 'idle';

  if (/\b(sleep|goodnight|good night|rest mode|turn off screen|nap|doze|relax)\b/i.test(t)) {
    return 'sleep';
  }

  // Coding / programming / terminal / debugging / scripts / git
  if (/\b(code|coding|script|function|program|class|component|api|powershell|bash|terminal|git|npm|python|javascript|typescript|csharp|rust|golang|bug|debug|refactor|compile|build|test suite|syntax error|stack trace|antigravity|codex|regex|algorithm)\b/i.test(t)) {
    return 'coding';
  }

  // Research / reports / model comparison / grants / forms / deep learning / market
  if (/\b(research|grant|grants|apply|form|fill form|scholar|report|paper|summary|summarize|compare|contrast|claude|chatgpt|grok|article|investigate|market analysis|find out|who am i|learn about me|knowledge)\b/i.test(t)) {
    return 'research';
  }

  // Deep reasoning / mathematics / formal proofs / system architecture
  if (/\b(reason|think deeply|proof|theorem|calculus|equation|differential|linear algebra|architecture|distributed|cryptograph|matrix|system design|philosoph|brain|np-complete|eigenvalue|p vs np)\b/i.test(t)) {
    return 'thinking';
  }

  // Action / UI navigation / automation / execution
  if (intent || /\b(click|press|tap|scroll|drag|open |close |launch|type |write in|navigate|chrome|edge|notepad|calculator|switch to|maximize|minimize|run command|download|sign in|play |mute)\b/i.test(t)) {
    return 'action';
  }

  return 'idle';
}

module.exports = {
  classifyComplexity,
  getModelTiers,
  selectModelForTask,
  shouldEscalate,
  getInstalledModels,
  estimateMemoryGB,
  getUsableNativeMemory,
  canRunNatively,
  shouldStreamWithAirLLM,
  inferTaskMode,
};

