'use strict';
// AirLLM Frontier Inference Tool for Mave.
// Allows Mave to invoke 70B+ large models on a single 8GB GPU card (RTX 5060)
// using layer-wise block streaming inference from lyogavin/airllm.

const { airllmService } = require('../../local/airllm');

module.exports = [
  {
    name: 'airllm_generate',
    description: 'Run deep reasoning or generation through a large 32B or 70B language model using AirLLM layer-streaming on local GPU without VRAM exhaustion.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task, question, or text to send to the 70B model.',
        },
        model: {
          type: 'string',
          description: 'Model identifier (e.g., "Qwen/Qwen3-32B", "meta-llama/Meta-Llama-3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"). Default: "Qwen/Qwen3-32B".',
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens to generate (default: 256).',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const model = input.model || 'Qwen/Qwen3-32B';
      const prompt = input.prompt;
      const maxTokens = Number(input.max_tokens) || 256;

      ctx.log('info', `Checking AirLLM engine for model: ${model}...`);

      const healthy = await airllmService.isHealthy();
      if (!healthy) {
        ctx.log('info', `Starting AirLLM service on port ${airllmService.port}...`);
        const ok = await airllmService.start(model);
        if (!ok) {
          return `⚠️ Could not start AirLLM service. Ensure CUDA Python is configured at ${airllmService.pythonExe}.`;
        }
      }

      ctx.log('info', `Streaming inference through AirLLM (${model})...`);

      try {
        const res = await fetch(`${airllmService.getEndpoint()}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return `❌ AirLLM server returned error ${res.status}: ${errText}`;
        }

        const data = await res.json();
        const reply = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : JSON.stringify(data);

        return `🧠 **AirLLM (${model}) Response**:\n\n${reply}`;
      } catch (err) {
        return `❌ AirLLM inference request failed: ${err.message}`;
      }
    },
  },

  {
    name: 'airllm_status',
    description: 'Check the health, active model, and GPU VRAM stats of the local AirLLM engine.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      const status = await airllmService.getStatus();
      return `✈️ **AirLLM Status**:\n\`\`\`json\n${JSON.stringify(status, null, 2)}\n\`\`\``;
    },
  },
];
