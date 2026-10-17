'use strict';
// Dynamic custom model management plugin for Bigfoot.
// Allows users and Bigfoot to register and switch to any custom local GGUF model
// (such as models downloaded from Hugging Face, LM Studio, or Ollama) on the fly.

const fs = require('fs');
const path = require('path');
const os = require('os');
const catalog = require('../../local/catalog');

function resolvePath(p) {
  let target = String(p || '').trim();
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    target = path.join(os.homedir(), target.slice(2));
  }
  return path.resolve(target);
}

module.exports = [
  {
    name: 'register_custom_model',
    description: 'Register any local GGUF model file on this PC into Bigfoot so it can be run using the local AI engine. Works with models from Hugging Face, LM Studio, or Ollama.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'A unique identifier for the model (e.g. "llama-3-8b", "deepseek-r1-7b", "phi-4").',
        },
        label: {
          type: 'string',
          description: 'A friendly display name (e.g. "Llama 3 8B Instruct", "DeepSeek R1 Distill 7B").',
        },
        model_path: {
          type: 'string',
          description: 'The absolute or home-relative path to the .gguf model file on disk.',
        },
        mmproj_path: {
          type: 'string',
          description: 'Optional path to the vision projector .gguf file (only if the model has vision capabilities).',
        },
        memory_gb: {
          type: 'number',
          description: 'Approximate RAM/VRAM in GB required to run the model (default 6).',
        },
        switch_now: {
          type: 'boolean',
          description: 'Whether to switch to this model immediately after registering (default false).',
        },
      },
      required: ['id', 'label', 'model_path'],
    },
    async run(input, ctx) {
      const id = String(input.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (!id) throw new Error('A valid model ID is required.');

      const modelPath = resolvePath(input.model_path);
      if (!fs.existsSync(modelPath)) {
        throw new Error(`The model file was not found at: ${modelPath}`);
      }

      let mmprojPath = null;
      if (input.mmproj_path) {
        mmprojPath = resolvePath(input.mmproj_path);
        if (!fs.existsSync(mmprojPath)) {
          throw new Error(`The vision projector file was not found at: ${mmprojPath}`);
        }
      }

      const stat = fs.statSync(modelPath);
      const sizeGB = Math.round((stat.size / (1024 ** 3)) * 10) / 10;
      const memGB = Number(input.memory_gb) || Math.max(4, Math.round(sizeGB * 1.3));

      const modelDef = {
        id,
        size: `${sizeGB}GB`,
        label: String(input.label || id),
        memoryGB: memGB,
        custom: true,
        modelPath,
        mmprojPath,
        files: [],
      };

      await ctx.confirm('change', {
        title: 'Register custom AI model?',
        message: `Register "${modelDef.label}" (${sizeGB} GB) into Bigfoot's local AI engine`,
        detail: modelPath,
        confirm: 'Register Model',
      });

      catalog.saveCustomModel(modelDef);
      ctx.log('info', `Registered custom model ${id} (${modelDef.label})`);

      if (input.switch_now && ctx.settings) {
        ctx.settings.update({ localModel: id });
        ctx.log('info', `Switched active local model to ${id}`);
        return `Successfully registered "${modelDef.label}" (${sizeGB} GB) from ${modelPath} and switched active model to it.`;
      }

      return `Successfully registered custom model "${modelDef.label}" (${sizeGB} GB). You can switch to it with switch_ai_model or in Settings › Models.`;
    },
  },
  {
    name: 'list_ai_models',
    description: 'List all available built-in and custom-registered AI models, including model size, memory requirements, and active status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      const all = catalog.allModels();
      const current = ctx.settings ? ctx.settings.get('localModel') : '';

      const lines = all.map((m) => {
        const isCurrent = m.id === current ? ' [ACTIVE]' : '';
        const customTag = m.custom ? ' (Custom)' : ' (Built-in)';
        const pathInfo = m.custom ? `\n    Path: ${m.modelPath}` : '';
        return `• ${m.label} (ID: ${m.id})${isCurrent}${customTag}\n    Size: ${m.size} | Est. RAM: ${m.memoryGB} GB${pathInfo}`;
      });

      return `Available Local AI Models (${all.length}):\n\n${lines.join('\n\n')}`;
    },
  },
  {
    name: 'switch_ai_model',
    description: 'Switch the active local AI model to another installed or registered model.',
    input_schema: {
      type: 'object',
      properties: {
        model_id: {
          type: 'string',
          description: 'The ID of the model to activate (e.g. "qwen3-vl-4b", "qwen3-vl-8b", or a custom model ID).',
        },
      },
      required: ['model_id'],
    },
    async run(input, ctx) {
      const targetId = String(input.model_id || '').trim().toLowerCase();
      const m = catalog.modelById(targetId);
      if (!m) {
        const available = catalog.allModels().map((x) => x.id).join(', ');
        throw new Error(`Unknown model "${targetId}". Available models: ${available}`);
      }

      if (ctx.settings) {
        const prev = ctx.settings.get('localModel');
        if (prev === targetId) {
          return `Model "${m.label}" (${targetId}) is already the active model.`;
        }
        ctx.settings.update({ localModel: targetId });
        ctx.log('info', `Switched local model from ${prev} to ${targetId}`);
        return `Switched active local AI model to "${m.label}" (${targetId}). The model will load on the next turn.`;
      }

      return `Selected model ${m.label} (${targetId}).`;
    },
  },
];
