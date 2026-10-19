'use strict';

/**
 * ComfyUI Generative Studio Plugin
 * 
 * Inspired by Comfy-Org/ComfyUI:
 * Integrates ComfyUI's node-based visual workflow engine into Mave.
 * Enables zero-shot image synthesis (Flux, SDXL, SD 1.5), ControlNet steering,
 * multi-frame video diffusion (Wan 2.1, AnimateDiff), and AI Super-Resolution upscaling.
 */

const path = require('path');
const fs = require('fs');
const { getComfyClient } = require('../../comfyui/comfy_client');
const { getWorkflowBuilder } = require('../../comfyui/workflow_builder');

module.exports = [
  {
    name: 'comfyui_status',
    description: 'Check local ComfyUI server connectivity, active GPU devices, VRAM usage, and loaded diffusion models.',
    input_schema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Optional ComfyUI host address (default: 127.0.0.1).'
        },
        port: {
          type: 'number',
          description: 'Optional ComfyUI port number (default: 8188).'
        }
      },
      additionalProperties: false
    },
    async run(input, ctx) {
      const client = getComfyClient();
      if (input.host) client.host = input.host;
      if (input.port) client.port = input.port;

      ctx.log?.('info', `Checking ComfyUI server status at ${client.baseUrl}...`);
      const status = await client.checkStatus();
      const models = await client.getAvailableModels();

      if (status.online) {
        const deviceLines = (status.devices || []).map(d =>
          `  • **${d.name}** (${d.type}): Free VRAM: **${d.vramFreeGB} GB** / Total: **${d.vramTotalGB} GB**`
        ).join('\n') || '  • CPU execution mode';

        const ckptSample = models.checkpoints.slice(0, 5).join(', ') || 'No checkpoints detected';

        return `⚡ **COMFYUI STUDIO STATUS: ONLINE**
• **Server Endpoint**: \`${status.baseUrl}\`
• **Environment**: ${status.os} (Python ${status.pythonVersion})
• **GPU Acceleration**:
${deviceLines}
• **Available Checkpoints**: ${ckptSample}
• **Samplers Ready**: ${models.samplers.slice(0, 4).join(', ')}`;
      } else {
        return `⚠️ **COMFYUI STUDIO STATUS: OFFLINE**
• **Target Endpoint**: \`${status.baseUrl}\`
• **Status**: ${status.error}
• **Ready for Headless Execution**:
  1. Start ComfyUI locally:
     \`\`\`powershell
     ${status.launchCommand}
     \`\`\`
  2. Mave can also export standalone workflow JSON files that can be dragged directly into the ComfyUI canvas!`;
      }
    }
  },

  {
    name: 'comfyui_generate_image',
    description: 'Generate high-fidelity images using local ComfyUI (SDXL, Flux, or SD 1.5). Executes online via ComfyUI REST API or exports an offline workflow file with fallback visual.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed visual description of the image to generate.'
        },
        negative_prompt: {
          type: 'string',
          description: 'Unwanted visual elements (e.g. blurry, low quality, artifacts).'
        },
        checkpoint: {
          type: 'string',
          description: 'Name of the checkpoint model (e.g. sd_xl_base_1.0.safetensors, flux1-schnell.safetensors).'
        },
        width: {
          type: 'number',
          description: 'Image width in pixels (e.g. 1024, 768, 512).'
        },
        height: {
          type: 'number',
          description: 'Image height in pixels (e.g. 1024, 768, 512).'
        },
        steps: {
          type: 'number',
          description: 'Diffusion sampling steps (default: 25).'
        },
        cfg: {
          type: 'number',
          description: 'Classifier-free guidance scale (default: 7.0).'
        }
      },
      required: ['prompt'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const builder = getWorkflowBuilder();
      const client = getComfyClient();

      const { workflow } = builder.buildText2Img({
        prompt: input.prompt,
        negativePrompt: input.negative_prompt,
        checkpoint: input.checkpoint || 'sd_xl_base_1.0.safetensors',
        width: input.width || 1024,
        height: input.height || 1024,
        steps: input.steps || 25,
        cfg: input.cfg || 7.0
      });

      ctx.log?.('info', `Checking ComfyUI connection for prompt "${input.prompt.slice(0, 40)}"...`);
      const status = await client.checkStatus();

      if (status.online) {
        ctx.log?.('info', `ComfyUI online. Queuing generation pipeline...`);
        try {
          const res = await client.executeWorkflow({ workflow });
          const firstAsset = res.assets[0];
          return `🎨 **COMFYUI GENERATION COMPLETE**:
• **Prompt**: "${input.prompt}"
• **Saved Asset**: \`${firstAsset.filePath}\` (${Math.round(firstAsset.bytes / 1024)} KB)
• **Time Elapsed**: ${res.elapsedMs}ms
• **Prompt ID**: \`${res.promptId}\`
• **View Asset**: [Open Image](file:///${firstAsset.filePath.replace(/\\/g, '/')})`;
        } catch (err) {
          ctx.log?.('warn', `ComfyUI execution error: ${err.message}. Using offline export.`);
        }
      }

      // Offline / fallback behavior
      const fb = client.generateOfflineFallback({
        prompt: input.prompt,
        workflowGraph: workflow,
        workflowType: 'text2img'
      });

      return `🎨 **COMFYUI WORKFLOW COMPILED (OFFLINE READY)**:
• **Prompt**: "${input.prompt}"
• **Workflow File**: \`${fb.workflowPath}\`
• **Preview Card**: \`${fb.previewPath}\`

💡 **Next Step**:
Open ComfyUI at \`http://127.0.0.1:8188\` and drag \`${fb.workflowFilename}\` onto the canvas to render at full GPU speed!
Launch Command: \`${fb.launchTip}\``;
    }
  },

  {
    name: 'comfyui_build_workflow',
    description: 'Construct a validated ComfyUI node graph workflow JSON for Text2Img, Img2Img, ControlNet, Upscaling, or Video.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_type: {
          type: 'string',
          enum: ['text2img', 'img2img', 'controlnet', 'upscale', 'video'],
          description: 'Type of generative workflow pipeline to build.'
        },
        prompt: {
          type: 'string',
          description: 'Positive prompt or description.'
        },
        negative_prompt: {
          type: 'string',
          description: 'Negative prompt.'
        },
        checkpoint: {
          type: 'string',
          description: 'Checkpoint filename.'
        },
        input_image: {
          type: 'string',
          description: 'Input image path for img2img, controlnet, or upscale.'
        },
        save_path: {
          type: 'string',
          description: 'Optional file destination to save the .json workflow.'
        }
      },
      required: ['workflow_type'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const builder = getWorkflowBuilder();
      let built;

      switch (input.workflow_type) {
        case 'img2img':
          built = builder.buildImg2Img({
            inputImagePath: input.input_image || 'input.png',
            prompt: input.prompt,
            negativePrompt: input.negative_prompt,
            checkpoint: input.checkpoint
          });
          break;
        case 'controlnet':
          built = builder.buildControlNet({
            hintImagePath: input.input_image || 'hint.png',
            prompt: input.prompt,
            negativePrompt: input.negative_prompt,
            checkpoint: input.checkpoint
          });
          break;
        case 'upscale':
          built = builder.buildUpscale({
            inputImagePath: input.input_image || 'source.png',
            upscaleModel: input.checkpoint || '4x-UltraSharp.pth'
          });
          break;
        case 'video':
          built = builder.buildVideo({
            prompt: input.prompt,
            negativePrompt: input.negative_prompt,
            checkpoint: input.checkpoint
          });
          break;
        case 'text2img':
        default:
          built = builder.buildText2Img({
            prompt: input.prompt,
            negativePrompt: input.negative_prompt,
            checkpoint: input.checkpoint
          });
          break;
      }

      const validation = builder.validateGraph(built.workflow);
      let saveNotice = '';

      if (input.save_path) {
        builder.saveToFile(input.save_path, built.workflow);
        saveNotice = `\n• **Saved to**: \`${input.save_path}\``;
      }

      return `🔧 **COMFYUI WORKFLOW DAG GENERATED** (\`${input.workflow_type.toUpperCase()}\`):
• **Total Graph Nodes**: **${validation.nodeCount}**
• **DAG Integrity**: ${validation.valid ? '✅ Validated (0 errors)' : '⚠️ Errors found: ' + validation.errors.join(', ')}${saveNotice}
• **Output Save Node ID**: \`${built.meta.saveNodeId}\`

**Workflow JSON Structure**:
\`\`\`json
${JSON.stringify(built.workflow, null, 2).slice(0, 650)}...
\`\`\``;
    }
  },

  {
    name: 'comfyui_upscale_image',
    description: 'Upscale an existing image 2x or 4x using ComfyUI neural super-resolution models (RealESRGAN, 4x-UltraSharp, NMKD).',
    input_schema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Path to source image.'
        },
        upscale_model: {
          type: 'string',
          description: 'Neural upscaling model (default: 4x-UltraSharp.pth).'
        }
      },
      required: ['image_path'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const builder = getWorkflowBuilder();
      const client = getComfyClient();

      const model = input.upscale_model || '4x-UltraSharp.pth';
      const { workflow } = builder.buildUpscale({
        inputImagePath: input.image_path,
        upscaleModel: model
      });

      const status = await client.checkStatus();
      if (status.online) {
        try {
          const res = await client.executeWorkflow({ workflow });
          const asset = res.assets[0];
          return `✨ **IMAGE UPSCALED SUCCESSFULLY**:
• **Source**: \`${input.image_path}\`
• **Model**: \`${model}\`
• **Upscaled Output**: \`${asset.filePath}\`
• **Time Elapsed**: ${res.elapsedMs}ms`;
        } catch (err) {
          ctx.log?.('warn', `ComfyUI upscale execution failed: ${err.message}`);
        }
      }

      const fb = client.generateOfflineFallback({
        prompt: `Upscaling ${path.basename(input.image_path)} with ${model}`,
        workflowGraph: workflow,
        workflowType: 'upscale'
      });

      return `✨ **UPSCALING WORKFLOW READY (OFFLINE)**:
• **Source**: \`${input.image_path}\`
• **Model**: \`${model}\`
• **Workflow Saved**: \`${fb.workflowPath}\`
• Drag into ComfyUI canvas to run 4x neural super-resolution.`;
    }
  },

  {
    name: 'comfyui_generate_video',
    description: 'Generate high-definition diffusion video sequences using Wan 2.1, AnimateDiff, or SVD node workflows in ComfyUI.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Cinematic visual description of video action.'
        },
        negative_prompt: {
          type: 'string',
          description: 'Negative artifacts.'
        },
        frame_count: {
          type: 'number',
          description: 'Total video frames to render (default: 24).'
        },
        fps: {
          type: 'number',
          description: 'Frames per second (default: 12).'
        },
        checkpoint: {
          type: 'string',
          description: 'Video checkpoint (e.g. wan2.1_t2v_14B_bf16.safetensors).'
        }
      },
      required: ['prompt'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const builder = getWorkflowBuilder();
      const client = getComfyClient();

      const { workflow } = builder.buildVideo({
        prompt: input.prompt,
        negativePrompt: input.negative_prompt,
        frameCount: input.frame_count || 24,
        fps: input.fps || 12,
        checkpoint: input.checkpoint || 'wan2.1_t2v_14B_bf16.safetensors'
      });

      const status = await client.checkStatus();
      if (status.online) {
        try {
          const res = await client.executeWorkflow({ workflow });
          const asset = res.assets[0];
          return `🎬 **COMFYUI VIDEO RENDER COMPLETE**:
• **Prompt**: "${input.prompt}"
• **Saved Video**: \`${asset.filePath}\`
• **Frames**: ${input.frame_count || 24} @ ${input.fps || 12} FPS
• **Elapsed Time**: ${res.elapsedMs}ms`;
        } catch (err) {
          ctx.log?.('warn', `Video execution error: ${err.message}`);
        }
      }

      const fb = client.generateOfflineFallback({
        prompt: input.prompt,
        workflowGraph: workflow,
        workflowType: 'video'
      });

      return `🎬 **COMFYUI VIDEO WORKFLOW READY (OFFLINE)**:
• **Prompt**: "${input.prompt}"
• **Target Model**: \`${input.checkpoint || 'wan2.1_t2v_14B_bf16.safetensors'}\`
• **Frames**: ${input.frame_count || 24} | **FPS**: ${input.fps || 12}
• **Workflow Saved**: \`${fb.workflowPath}\`
• Import into ComfyUI to synthesize with local GPU acceleration.`;
    }
  }
];
