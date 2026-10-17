'use strict';
// Local AI downloads: official Qwen3-VL GGUFs (Hugging Face, pinned commits) and the llama.cpp
// runtime (pinned release). Every file is verified against its SHA-256.

const HF = 'https://huggingface.co';
const RUNTIME_TAG = 'b11276';
const GH = `https://github.com/ggml-org/llama.cpp/releases/download/${RUNTIME_TAG}`;

const GB = 1024 ** 3;

function hf(repo, rev, name, size, sha256) {
  return { name, size, sha256, url: `${HF}/${repo}/resolve/${rev}/${name}` };
}

// memoryGB: needed to run with a full context and a screenshot. 4B is the smallest offered: 2B was
// too weak at choosing tools (it described what it would do instead of doing it).
const RETIRED = ['qwen3-vl-2b'];
const MODELS = [
  {
    id: 'qwen3-vl-4b', size: '4B', label: 'Qwen3-VL 4B', memoryGB: 4.2,
    repo: 'Qwen/Qwen3-VL-4B-Instruct-GGUF',
    files: [
      hf('Qwen/Qwen3-VL-4B-Instruct-GGUF', '1cd86afb9a95c410a6038ab3b40d8b578c892266', 'Qwen3VL-4B-Instruct-Q4_K_M.gguf', 2497281664, '66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a'),
      hf('Qwen/Qwen3-VL-4B-Instruct-GGUF', '1cd86afb9a95c410a6038ab3b40d8b578c892266', 'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf', 453974304, '30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d'),
    ],
  },
  {
    id: 'qwen3-vl-8b', size: '8B', label: 'Qwen3-VL 8B', memoryGB: 7.2,
    repo: 'Qwen/Qwen3-VL-8B-Instruct-GGUF',
    files: [
      hf('Qwen/Qwen3-VL-8B-Instruct-GGUF', 'f982a07559d4a2f6c8744d840bf6fccab30eea96', 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', 5027784800, '67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2'),
      hf('Qwen/Qwen3-VL-8B-Instruct-GGUF', 'f982a07559d4a2f6c8744d840bf6fccab30eea96', 'mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf', 752289728, 'c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd'),
    ],
  },
  {
    id: 'qwen3-vl-30b', size: '30B', label: 'Qwen3-VL 30B', memoryGB: 21,
    repo: 'Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF',
    files: [
      hf('Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF', 'f54435e6cc31258f04b0969105c3f6badb197931', 'Qwen3VL-30B-A3B-Instruct-Q4_K_M.gguf', 18556687168, '87bb374d849f80ebdfabb304189fac9e0bd35a0f74506e6a59c51b206cbe863b'),
      hf('Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF', 'f54435e6cc31258f04b0969105c3f6badb197931', 'mmproj-Qwen3VL-30B-A3B-Instruct-Q8_0.gguf', 712148928, '82a9966edfdbc1b18a27fd90af96d50cbf111a51484f6290e946dccf461c8150'),
    ],
  },
];

// The Vulkan build covers NVIDIA, AMD and Intel GPUs and includes CPU backends.
const RUNTIMES = {
  x64: { name: `llama-${RUNTIME_TAG}-bin-win-vulkan-x64.zip`, size: 33095885, sha256: '33072ec329923a168dcef9a9e76d8578a9bcedda47dff70410e2de5b1ae112cd' },
  arm64: { name: `llama-${RUNTIME_TAG}-bin-win-cpu-arm64.zip`, size: 12052486, sha256: '431bcdc65d588256eb47d9de5bd00db07bede5b1f2c4680969317bf32474bf11' },
};

// Offline speech recognition, bundled with the installer (scripts/fetch-speech.js): whisper.cpp with
// the English base model. On an 8 GB laptop without a graphics card it transcribed a test sentence
// word-perfectly in ~1.9 s with the model loaded, where the Windows recognizer got half the words wrong.
const WHISPER_TAG = 'b5130';
const SPEECH = [
  { name: 'whisper-bin-x64.zip', size: 8573270, sha256: 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c', url: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_TAG}/whisper-bin-x64.zip`, speechRuntime: true },
  { ...hf('ggerganov/whisper.cpp', '5359861c739e955e79d9a303bcbc70fb988958b1', 'ggml-base.en-q8_0.bin', 81781811, 'a4d4a0768075e13cfd7e19df3ae2dbc4a68d37d36a7dad45e8410c9a34f8c87e'), speech: true },
];

// Handwritten math reader shipped inside the app: Pix2Text MFR 1.5 (MIT), about 1 s per line on a CPU.
const MATH_REV = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc';
const MATH = [
  hf('breezedeus/pix2text-mfr-1.5', MATH_REV, 'encoder_model.onnx', 87510770, '080a3f660f08bc9ebcacdd96e34be6b6400f8c7e62d7cd0dd8251badc37f610b'),
  hf('breezedeus/pix2text-mfr-1.5', MATH_REV, 'decoder_model.onnx', 32026253, '917deb98e91a0453c5f234f58a0f32f9fb037de8527c7eb4ed394daf9e692f2a'),
  hf('breezedeus/pix2text-mfr-1.5', MATH_REV, 'tokenizer.json', 113168, '4ffbeb2143e6a38324bb6111b7a8109530d38a076a8439aa5777535f0a32758a'),
];

// Bigfoot's voice, shipped inside the app: Kokoro 82M (Apache 2.0) in its uint8 form, run with ONNX
// Runtime: twice as fast on a CPU as the smaller 8-bit file, and faster than it speaks on a laptop
// without a graphics card. Five of its voices: its makers' best three female and two male English ones.
const VOICE_REV = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const VOICE_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = [
  { ...hf(VOICE_REPO, VOICE_REV, 'onnx/model_uint8.onnx', 177464632, '6607a397d77b8514065420b7c1e7320117f7aabfdb45ce15f0050c5b0fe75aea'), file: 'kokoro.onnx' },
  { ...hf(VOICE_REPO, VOICE_REV, 'tokenizer.json', 3497, '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34'), file: 'tokenizer.json' },
  ...[
    ['af_heart', 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'],
    ['af_bella', 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b'],
    ['bf_emma', '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73'],
    ['am_michael', '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1'],
    ['am_fenrir', 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43'],
  ].map(([id, sha]) => ({ ...hf(VOICE_REPO, VOICE_REV, `voices/${id}.bin`, 522240, sha), file: `${id}.bin` })),
];

function runtimeFor(arch = process.arch) {
  const r = RUNTIMES[arch === 'arm64' ? 'arm64' : 'x64'];
  return { ...r, url: `${GH}/${r.name}`, tag: RUNTIME_TAG, runtime: true };
}

const fs = require('fs');
const path = require('path');
const os = require('os');

function customModelsPath() {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return path.join(app.getPath('userData'), 'custom-models.json');
  } catch { /* not in electron */ }
  const mavePath = path.join(os.homedir(), '.mave', 'custom-models.json');
  if (fs.existsSync(mavePath)) return mavePath;
  const bfPath = path.join(os.homedir(), '.bigfoot', 'custom-models.json');
  if (fs.existsSync(bfPath)) return bfPath;
  return mavePath;
}

let customModelsCache = null;

function loadCustomModels() {
  try {
    const p = customModelsPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(data)) {
        customModelsCache = data;
        return data;
      }
    }
  } catch { /* empty */ }
  return customModelsCache ? [...customModelsCache] : [];
}

function saveCustomModel(model) {
  const models = loadCustomModels().filter((m) => m.id !== model.id);
  models.push(model);
  customModelsCache = models;
  const p = customModelsPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(models, null, 2), 'utf8');
  } catch { /* empty */ }
  return model;
}

function removeCustomModel(id) {
  const before = loadCustomModels();
  const filtered = before.filter((m) => m.id !== id);
  customModelsCache = filtered;
  if (filtered.length !== before.length) {
    const p = customModelsPath();
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(filtered, null, 2), 'utf8');
    } catch { /* empty */ }
    return true;
  }
  return false;
}

function scanCustomModels(extraDirs = []) {
  const customModels = [];
  const imageModels = [];
  const visitedPaths = new Set();

  const candidates = [
    'E:\\AI-Models',
    'E:\\AI-Models\\open-generative-ai-models',
    'D:\\AI-Models',
    'C:\\AI-Models',
    path.join(os.homedir(), 'models'),
    path.join(os.homedir(), '.ollama', 'models'),
    path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
    path.join(os.homedir(), 'Downloads'),
    ...extraDirs,
  ];

  function scanDir(dir, depth = 0) {
    if (depth > 2 || !dir) return;
    try {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (ent.isFile()) {
          const lower = ent.name.toLowerCase();
          if (lower.endsWith('.gguf') && !lower.startsWith('mmproj-')) {
            if (visitedPaths.has(fullPath)) continue;
            visitedPaths.add(fullPath);
            const stat = fs.statSync(fullPath);
            const sizeGB = Math.round((stat.size / (1024 ** 3)) * 10) / 10;
            const baseId = ent.name.replace(/\.gguf$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            const cleanLabel = ent.name.replace(/\.gguf$/i, '').replace(/[-_]/g, ' ');
            const modelDef = {
              id: `custom-${baseId}`,
              size: `${sizeGB}GB`,
              label: cleanLabel,
              memoryGB: Math.max(4, Math.round(sizeGB * 1.25)),
              custom: true,
              modelPath: fullPath,
              bytes: stat.size,
              available: true,
            };
            customModels.push(modelDef);
            saveCustomModel(modelDef);
          } else if (lower.endsWith('.safetensors')) {
            if (visitedPaths.has(fullPath)) continue;
            visitedPaths.add(fullPath);
            const stat = fs.statSync(fullPath);
            const sizeGB = Math.round((stat.size / (1024 ** 3)) * 10) / 10;
            imageModels.push({
              name: ent.name,
              path: fullPath,
              size: `${sizeGB}GB`,
              bytes: stat.size,
            });
          }
        }
      }
    } catch { /* skip unreadable */ }
  }

  for (const c of candidates) {
    scanDir(c, 0);
  }

  for (const m of loadCustomModels()) {
    if (!customModels.some((x) => x.id === m.id)) {
      customModels.push(m);
    }
  }

  return { customModels, imageModels };
}

function allModels() {
  return [...MODELS, ...loadCustomModels()];
}

function modelById(id) {
  return allModels().find((m) => m.id === id) || null;
}

function filesFor(id, arch) {
  const m = modelById(id);
  if (!m) throw new Error(`Unknown local model ${id}`);
  if (m.custom) return [runtimeFor(arch)];
  return [runtimeFor(arch), ...m.files];
}

function downloadBytes(id, arch) {
  const m = modelById(id);
  if (!m) throw new Error(`Unknown local model ${id}`);
  if (m.custom) return 0;
  return filesFor(id, arch).reduce((n, f) => n + f.size, 0);
}

function scanColibriModels() {
  const colibriDirs = ['D:\\Bigfoot\\colibri-models', 'C:\\Bigfoot\\colibri-models', path.join(os.homedir(), 'colibri-models')];
  const models = [];
  const seen = new Set();
  for (const cDir of colibriDirs) {
    if (!fs.existsSync(cDir)) continue;
    try {
      const entries = fs.readdirSync(cDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const mPath = path.join(cDir, ent.name);
        const hasModel = fs.existsSync(path.join(mPath, 'config.json')) || fs.existsSync(path.join(mPath, '.colibri-download.json'));
        if (hasModel && !seen.has(ent.name)) {
          seen.add(ent.name);
          let label = ent.name;
          let size = 'MoE';
          let note = 'Mixture-of-Experts (Colibri Engine)';
          if (ent.name === 'deepseek-v4-flash') {
            label = 'DeepSeek V4 Flash (284B MoE)';
            size = '284B MoE · 167 GB';
            note = 'Ultra-fast 284B MoE engine via Colibri (github.com/JustVugg/colibri)';
          } else if (ent.name === 'qwen36-35b') {
            label = 'Qwen 3.6 35B (35B MoE)';
            size = '35B MoE · 23 GB';
            note = 'Frontier 35B MoE engine via Colibri (github.com/JustVugg/colibri)';
          }
          models.push({
            id: `colibri-${ent.name}`,
            rawModel: ent.name,
            engine: 'colibri',
            engineRepo: 'https://github.com/JustVugg/colibri',
            label,
            size,
            modelPath: mPath,
            available: true,
            note,
          });
        }
      }
    } catch { /* skip */ }
  }
  return models;
}

function scanOllamaModels() {
  const manifestDirs = [
    'E:\\.ollama\\models\\manifests\\registry.ollama.ai\\library',
    'D:\\.ollama\\models\\manifests\\registry.ollama.ai\\library',
    path.join(os.homedir(), '.ollama', 'models', 'manifests', 'registry.ollama.ai', 'library'),
  ];
  const models = [];
  const seen = new Set();
  for (const mDir of manifestDirs) {
    if (!fs.existsSync(mDir)) continue;
    try {
      const entries = fs.readdirSync(mDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sub = path.join(mDir, ent.name);
        const tags = fs.readdirSync(sub);
        for (const tag of tags) {
          const modelTag = `${ent.name}:${tag}`;
          if (!seen.has(modelTag)) {
            seen.add(modelTag);
            models.push({
              id: `ollama-${ent.name}-${tag}`,
              rawModel: modelTag,
              engine: 'ollama',
              label: `Ollama · ${ent.name}:${tag}`,
              size: tag.includes('8b') ? '8B' : tag,
              modelPath: path.join(sub, tag),
              available: true,
              note: 'Ollama Model Library',
            });
          }
        }
      }
    } catch { /* skip */ }
  }
  return models;
}

function scanAirLLMModels() {
  const models = [
    {
      id: 'airllm-Qwen-Qwen3-32B',
      rawModel: 'Qwen/Qwen3-32B',
      engine: 'airllm',
      engineRepo: 'https://github.com/lyogavin/airllm',
      label: 'Qwen3 32B (AirLLM Layer Streaming)',
      size: '32B · ~3.5GB VRAM',
      available: true,
      note: 'Layer-wise streaming inference on RTX 5060 (8GB)',
    },
    {
      id: 'airllm-meta-llama-Meta-Llama-3-70B-Instruct',
      rawModel: 'meta-llama/Meta-Llama-3-70B-Instruct',
      engine: 'airllm',
      engineRepo: 'https://github.com/lyogavin/airllm',
      label: 'Llama 3 70B Instruct (AirLLM 4-bit)',
      size: '70B · ~4GB VRAM',
      available: true,
      note: '70B model running layer-wise in 4-8GB VRAM',
    },
    {
      id: 'airllm-Qwen-Qwen2.5-72B-Instruct',
      rawModel: 'Qwen/Qwen2.5-72B-Instruct',
      engine: 'airllm',
      engineRepo: 'https://github.com/lyogavin/airllm',
      label: 'Qwen 2.5 72B Instruct (AirLLM 4-bit)',
      size: '72B · ~4.2GB VRAM',
      available: true,
      note: '72B powerhouse model running with 4-bit block compression',
    },
    {
      id: 'airllm-deepseek-ai-DeepSeek-V3',
      rawModel: 'deepseek-ai/DeepSeek-V3',
      engine: 'airllm',
      engineRepo: 'https://github.com/lyogavin/airllm',
      label: 'DeepSeek V3 671B (AirLLM MoE Stream)',
      size: '671B MoE · ~12GB',
      available: true,
      note: 'Frontier 671B MoE with layer and expert offloading',
    },
  ];
  return models;
}

/** @param {{ ramGB: number, vramGB: number, dedicated: boolean, freeDiskGB?: number }} hw */
function recommend(hw, extraDirs = []) {
  const ram = Number(hw.ramGB) || 0;
  const vram = hw.dedicated ? Number(hw.vramGB) || 0 : 0;
  const usableRam = Math.max(0, ram - 3) * 0.8; // Windows and other apps need the rest
  const onGpu = (m) => vram >= m.memoryGB;
  const runs = (m) => vram + usableRam >= m.memoryGB; // llama.cpp --fit splits layers between GPU and RAM
  const loads = (m) => vram + Math.max(0, ram - 3.5) >= m.memoryGB;

  let pick;
  if (vram >= 20) pick = 'qwen3-vl-30b';
  else if (vram >= 7) pick = 'qwen3-vl-8b';
  else if (vram >= 4) pick = 'qwen3-vl-4b';
  else pick = 'qwen3-vl-4b'; // on CPU, 8B is too slow to feel responsive
  if (!runs(modelById(pick))) pick = MODELS.slice().reverse().find(runs)?.id || 'qwen3-vl-4b';

  const pickIndex = MODELS.findIndex((m) => m.id === pick);
  const options = MODELS.map((m, i) => {
    const bytes = downloadBytes(m.id);
    const diskOk = hw.freeDiskGB == null || hw.freeDiskGB * GB > bytes * 1.05;
    let note;
    let fits = loads(m);
    if (m.id === pick) note = 'Recommended';
    else if (!fits) note = 'Requires more memory';
    else if (i < pickIndex) note = 'Faster / lighter';
    else if (!runs(m)) note = 'Tight on memory · may be slow';
    else note = onGpu(m) ? 'Higher quality' : 'Higher quality · slower';
    if (!diskOk) { fits = false; note = 'Not enough disk space'; }
    return { id: m.id, size: m.size, label: m.label, bytes, recommended: m.id === pick, available: fits, note };
  });

  const { customModels, imageModels } = scanCustomModels(extraDirs);
  const customOptions = customModels.map((cm) => {
    const fits = loads(cm);
    return {
      id: cm.id,
      size: cm.size,
      label: cm.label,
      bytes: cm.bytes || 0,
      modelPath: cm.modelPath,
      custom: true,
      available: fits,
      note: fits ? 'Installed on disk' : 'Tight on memory',
    };
  });

  const colibriModels = scanColibriModels();
  const ollamaModels = scanOllamaModels();
  const airllmModels = scanAirLLMModels();

  return { pick, options, customOptions, imageModels, colibriModels, ollamaModels, airllmModels };
}

module.exports = { MODELS, RETIRED, RUNTIME_TAG, WHISPER_TAG, SPEECH, MATH, VOICE, runtimeFor, modelById, allModels, loadCustomModels, saveCustomModel, removeCustomModel, scanCustomModels, scanColibriModels, scanOllamaModels, scanAirLLMModels, filesFor, downloadBytes, recommend, GB };
