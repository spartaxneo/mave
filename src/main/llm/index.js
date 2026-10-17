'use strict';
// Picks the model provider: local Qwen3-VL by default and always offline; Claude/OpenAI optionally, online.

const anthropic = require('./anthropic');
const openai = require('./openai');
const local = require('./local');
const { ProviderError } = require('./errors');
const catalog = require('../local/catalog');

class OllamaProvider extends openai.OpenAIProvider {
  constructor({ model, system, tools, screen }) {
    super({ apiKey: 'ollama', model: model || 'deepseek-r1:8b', system, tools, screen });
    this.id = 'ollama';
    this.label = `Ollama (${model || 'Local'})`;
  }
  async endpoint() {
    return { url: 'http://127.0.0.1:11434/v1', key: 'ollama' };
  }
}

class ColibriProvider extends openai.OpenAIProvider {
  constructor({ model, system, tools, screen }) {
    super({ apiKey: 'colibri', model: model || 'qwen36-35b', system, tools, screen });
    this.id = 'colibri';
    this.label = `Colibri (${model || 'Local MoE'})`;
  }
  async endpoint() {
    return { url: 'http://127.0.0.1:8000/v1', key: 'colibri' };
  }
  async request(signal) {
    const { url, key } = await this.endpoint();
    let modelId = this.model;
    try {
      const res = await fetch(`${url}/models`, { signal });
      if (res.ok) {
        const data = await res.json();
        const available = (data.data || []).map((m) => m.id);
        if (available.length > 0 && !available.includes(modelId)) {
          const match = available.find((id) => id.includes(modelId) || modelId.includes(id)) || available[0];
          modelId = match;
        }
      }
    } catch { /* use modelId as is */ }
    const { requestJson } = require('./errors');
    return requestJson(`${url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages: this.messages, tools: this.tools, tool_choice: 'auto', ...this.requestExtras() }),
    }, this.label, signal, this.timeoutMs);
  }
}

class AirLLMProvider extends openai.OpenAIProvider {
  constructor({ model, system, tools, screen }) {
    super({ apiKey: 'airllm', model: model || 'Qwen/Qwen3-32B', system, tools, screen });
    this.id = 'airllm';
    this.label = `AirLLM (${model || '70B Layer-Stream'})`;
  }
  async endpoint() {
    return { url: 'http://127.0.0.1:8001/v1', key: 'airllm' };
  }
  async request(signal) {
    const { url, key } = await this.endpoint();
    let modelId = this.model;
    try {
      const res = await fetch(`${url}/models`, { signal });
      if (res.ok) {
        const data = await res.json();
        const available = (data.data || []).map((m) => m.id);
        if (available.length > 0 && !available.includes(modelId)) {
          const match = available.find((id) => id.includes(modelId) || modelId.includes(id)) || available[0];
          modelId = match;
        }
      }
    } catch { /* use modelId as is */ }
    const { requestJson } = require('./errors');
    return requestJson(`${url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages: this.messages, tools: this.tools, tool_choice: 'auto', ...this.requestExtras() }),
    }, this.label, signal, this.timeoutMs);
  }
}

const PROVIDERS = {
  local: { label: 'Qwen3-VL', keyName: null, modelSetting: 'localModel', module: local, Provider: local.LocalProvider, cloud: false },
  airllm: { label: 'AirLLM (70B)', keyName: null, modelSetting: 'airllmModel', module: openai, Provider: AirLLMProvider, cloud: false },
  colibri: { label: 'Colibri', keyName: null, modelSetting: 'colibriModel', module: openai, Provider: ColibriProvider, cloud: false },
  ollama: { label: 'Ollama', keyName: null, modelSetting: 'ollamaModel', module: openai, Provider: OllamaProvider, cloud: false },
  anthropic: { label: 'Claude', keyName: 'anthropicKey', modelSetting: 'model', module: anthropic, Provider: anthropic.AnthropicProvider, cloud: true },
  openai: { label: 'OpenAI', keyName: 'openaiKey', modelSetting: 'openaiModel', module: openai, Provider: openai.OpenAIProvider, cloud: true },
};
const CLOUD = ['anthropic', 'openai'];
const ORDER = ['local', 'airllm', 'colibri', 'ollama', ...CLOUD];

const hasKey = (settings, id) => Boolean(PROVIDERS[id].keyName && settings.secret(PROVIDERS[id].keyName));

function resolveProvider(settings, { online = true } = {}) {
  const chosen = settings.get('provider');
  if (chosen === 'colibri') return 'colibri';
  if (chosen === 'ollama') return 'ollama';
  const localReady = Boolean(catalog.modelById(settings.get('localModel')));
  if (CLOUD.includes(chosen) && hasKey(settings, chosen) && (online || !localReady)) return chosen;
  if (localReady) return 'local';
  return CLOUD.find((id) => hasKey(settings, id)) || null;
}

function describe(settings, id) {
  if (!id) return 'No model';
  if (id === 'local') {
    const m = catalog.modelById(settings.get('localModel'));
    return m ? m.label : 'Qwen3-VL';
  }
  if (id === 'colibri') {
    return `Colibri · ${settings.get('colibriModel') || 'qwen36-35b'}`;
  }
  if (id === 'ollama') {
    return `Ollama · ${settings.get('ollamaModel') || 'deepseek-r1:8b'}`;
  }
  if (id === 'openai') {
    const ep = settings.get('openaiEndpoint');
    const label = ep && !ep.includes('api.openai.com') ? 'OpenAI-Compatible' : 'OpenAI';
    return `${label} · ${settings.get('openaiModel') || 'gpt-4o'}`;
  }
  return `${PROVIDERS[id].label} · ${settings.get(PROVIDERS[id].modelSetting)}`;
}

function createProvider(settings, { system, tools, screen, runtime, online = true }) {
  const id = resolveProvider(settings, { online });
  if (!id) throw new ProviderError('Set up your local AI in Settings › Models to get started.', 'Set up your local AI');
  const p = PROVIDERS[id];
  if (id === 'local') {
    return new p.Provider({ runtime, model: settings.get('localModel'), label: describe(settings, id), system, tools, screen });
  }
  if (id === 'colibri') {
    return new p.Provider({ model: settings.get('colibriModel') || 'qwen36-35b', system, tools, screen });
  }
  if (id === 'ollama') {
    return new p.Provider({ model: settings.get('ollamaModel') || 'deepseek-r1:8b', system, tools, screen });
  }
  if (id === 'openai') {
    return new p.Provider({
      apiKey: settings.secret(p.keyName),
      model: settings.get(p.modelSetting) || 'gpt-4o',
      endpoint: settings.get('openaiEndpoint') || 'https://api.openai.com/v1',
      effort: settings.get('effort'),
      system,
      tools,
      screen,
    });
  }
  return new p.Provider({
    apiKey: settings.secret(p.keyName),
    model: settings.get(p.modelSetting),
    effort: settings.get('effort'),
    system,
    tools,
    screen,
  });
}

function listModels(id, key, endpoint) {
  if (!PROVIDERS[id] || !PROVIDERS[id].cloud) throw new ProviderError(`Unknown provider ${id}`);
  return PROVIDERS[id].module.listModels(key, endpoint);
}

function testKey(id, key, model, endpoint) {
  if (!PROVIDERS[id] || !PROVIDERS[id].cloud) throw new ProviderError(`Unknown provider ${id}`);
  return PROVIDERS[id].module.testKey(key, model, endpoint);
}

module.exports = { PROVIDERS, ORDER, CLOUD, resolveProvider, describe, createProvider, listModels, testKey, ProviderError };
