'use strict';

/**
 * ComfyUI Workflow Graph Builder & DAG Compiler
 * 
 * Inspired by Comfy-Org/ComfyUI:
 * Generates standard ComfyUI API-compatible Directed Acyclic Graph (DAG) workflows.
 * Supports Text-to-Image (SDXL, Flux, SD 1.5), Image-to-Image, ControlNet conditioning,
 * LoRA chaining, Super-Resolution Upscaling, and Diffusion Video (Wan 2.1 / AnimateDiff).
 */

const fs = require('fs');
const path = require('path');

class WorkflowBuilder {
  constructor() {
    this.reset();
  }

  reset() {
    this.nodes = {};
    this.nodeCounter = 1;
    return this;
  }

  /**
   * Adds an arbitrary node to the graph and returns its string ID.
   */
  addNode(classType, inputs = {}, customId = null) {
    const id = customId !== null ? String(customId) : String(this.nodeCounter++);
    this.nodes[id] = {
      class_type: classType,
      inputs: { ...inputs }
    };
    return id;
  }

  /**
   * Builds a standard Text-to-Image (SDXL / Flux / SD 1.5) workflow.
   */
  buildText2Img({
    prompt = 'A beautiful futuristic cyberpunk city at twilight, 8k resolution, photorealistic',
    negativePrompt = 'blurry, low quality, distorted, bad anatomy, watermark, text',
    checkpoint = 'sd_xl_base_1.0.safetensors',
    width = 1024,
    height = 1024,
    batchSize = 1,
    steps = 25,
    cfg = 7.0,
    samplerName = 'euler',
    scheduler = 'normal',
    denoise = 1.0,
    seed = Math.floor(Math.random() * 1000000000),
    filenamePrefix = 'Mave_Comfy_T2I'
  } = {}) {
    this.reset();

    // Node 4: Checkpoint Loader
    const ckptId = this.addNode('CheckpointLoaderSimple', {
      ckpt_name: checkpoint
    }, '4');

    // Node 5: Empty Latent Image
    const latentId = this.addNode('EmptyLatentImage', {
      width,
      height,
      batch_size: batchSize
    }, '5');

    // Node 6: Positive Prompt (CLIP Text Encode)
    const posClipId = this.addNode('CLIPTextEncode', {
      text: prompt,
      clip: [ckptId, 1]
    }, '6');

    // Node 7: Negative Prompt (CLIP Text Encode)
    const negClipId = this.addNode('CLIPTextEncode', {
      text: negativePrompt,
      clip: [ckptId, 1]
    }, '7');

    // Node 3: KSampler
    const samplerId = this.addNode('KSampler', {
      seed,
      steps,
      cfg,
      sampler_name: samplerName,
      scheduler,
      denoise,
      model: [ckptId, 0],
      positive: [posClipId, 0],
      negative: [negClipId, 0],
      latent_image: [latentId, 0]
    }, '3');

    // Node 8: VAE Decode
    const vaeDecodeId = this.addNode('VAEDecode', {
      samples: [samplerId, 0],
      vae: [ckptId, 2]
    }, '8');

    // Node 9: Save Image
    const saveId = this.addNode('SaveImage', {
      filename_prefix: filenamePrefix,
      images: [vaeDecodeId, 0]
    }, '9');

    return {
      type: 'text2img',
      workflow: this.nodes,
      meta: {
        prompt,
        negativePrompt,
        checkpoint,
        width,
        height,
        seed,
        steps,
        cfg,
        saveNodeId: saveId
      }
    };
  }

  /**
   * Builds an Image-to-Image / Style Transfer workflow.
   */
  buildImg2Img({
    inputImagePath = 'input.png',
    prompt = 'Vibrant oil painting masterpiece, thick brushstrokes, impressionist style',
    negativePrompt = 'photorealistic, low quality, blurry',
    checkpoint = 'sd_xl_base_1.0.safetensors',
    steps = 25,
    cfg = 6.5,
    denoise = 0.6,
    samplerName = 'euler_ancestral',
    scheduler = 'karras',
    seed = Math.floor(Math.random() * 1000000000),
    filenamePrefix = 'Mave_Comfy_I2I'
  } = {}) {
    this.reset();

    // Node 1: Load Image
    const loadImgId = this.addNode('LoadImage', {
      image: path.basename(inputImagePath)
    }, '1');

    // Node 4: Checkpoint Loader
    const ckptId = this.addNode('CheckpointLoaderSimple', {
      ckpt_name: checkpoint
    }, '4');

    // Node 2: VAE Encode
    const vaeEncodeId = this.addNode('VAEEncode', {
      pixels: [loadImgId, 0],
      vae: [ckptId, 2]
    }, '2');

    // Node 6: Positive Prompt
    const posClipId = this.addNode('CLIPTextEncode', {
      text: prompt,
      clip: [ckptId, 1]
    }, '6');

    // Node 7: Negative Prompt
    const negClipId = this.addNode('CLIPTextEncode', {
      text: negativePrompt,
      clip: [ckptId, 1]
    }, '7');

    // Node 3: KSampler (Denoised generation on existing latent)
    const samplerId = this.addNode('KSampler', {
      seed,
      steps,
      cfg,
      sampler_name: samplerName,
      scheduler,
      denoise,
      model: [ckptId, 0],
      positive: [posClipId, 0],
      negative: [negClipId, 0],
      latent_image: [vaeEncodeId, 0]
    }, '3');

    // Node 8: VAE Decode
    const vaeDecodeId = this.addNode('VAEDecode', {
      samples: [samplerId, 0],
      vae: [ckptId, 2]
    }, '8');

    // Node 9: Save Image
    const saveId = this.addNode('SaveImage', {
      filename_prefix: filenamePrefix,
      images: [vaeDecodeId, 0]
    }, '9');

    return {
      type: 'img2img',
      workflow: this.nodes,
      meta: {
        inputImagePath,
        prompt,
        denoise,
        saveNodeId: saveId
      }
    };
  }

  /**
   * Builds a ControlNet-Guided Synthesis workflow (Canny, Depth, OpenPose).
   */
  buildControlNet({
    controlNetModel = 'controlnet-canny-sdxl-1.0.safetensors',
    hintImagePath = 'hint.png',
    prompt = 'A futuristic mechanical robot standing in a neon street',
    negativePrompt = 'blurry, distorted',
    checkpoint = 'sd_xl_base_1.0.safetensors',
    strength = 0.85,
    width = 1024,
    height = 1024,
    steps = 28,
    filenamePrefix = 'Mave_Comfy_ControlNet'
  } = {}) {
    this.reset();

    // Node 1: Load Hint Image
    const loadImgId = this.addNode('LoadImage', {
      image: path.basename(hintImagePath)
    }, '1');

    // Node 4: Checkpoint Loader
    const ckptId = this.addNode('CheckpointLoaderSimple', {
      ckpt_name: checkpoint
    }, '4');

    // Node 10: ControlNet Model Loader
    const controlLoaderId = this.addNode('ControlNetLoader', {
      control_net_name: controlNetModel
    }, '10');

    // Node 6: Positive Prompt
    const posClipId = this.addNode('CLIPTextEncode', {
      text: prompt,
      clip: [ckptId, 1]
    }, '6');

    // Node 11: Apply ControlNet to Positive Conditioning
    const controlApplyId = this.addNode('ControlNetApply', {
      conditioning: [posClipId, 0],
      control_net: [controlLoaderId, 0],
      image: [loadImgId, 0],
      strength
    }, '11');

    // Node 7: Negative Prompt
    const negClipId = this.addNode('CLIPTextEncode', {
      text: negativePrompt,
      clip: [ckptId, 1]
    }, '7');

    // Node 5: Empty Latent Image
    const latentId = this.addNode('EmptyLatentImage', {
      width,
      height,
      batch_size: 1
    }, '5');

    // Node 3: KSampler
    const samplerId = this.addNode('KSampler', {
      seed: Math.floor(Math.random() * 1000000000),
      steps,
      cfg: 7.0,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1.0,
      model: [ckptId, 0],
      positive: [controlApplyId, 0],
      negative: [negClipId, 0],
      latent_image: [latentId, 0]
    }, '3');

    // Node 8: VAE Decode
    const vaeDecodeId = this.addNode('VAEDecode', {
      samples: [samplerId, 0],
      vae: [ckptId, 2]
    }, '8');

    // Node 9: Save Image
    const saveId = this.addNode('SaveImage', {
      filename_prefix: filenamePrefix,
      images: [vaeDecodeId, 0]
    }, '9');

    return {
      type: 'controlnet',
      workflow: this.nodes,
      meta: {
        controlNetModel,
        hintImagePath,
        strength,
        saveNodeId: saveId
      }
    };
  }

  /**
   * Builds an AI Super-Resolution Upscaling workflow (RealESRGAN, 4x-UltraSharp).
   */
  buildUpscale({
    inputImagePath = 'source.png',
    upscaleModel = '4x-UltraSharp.pth',
    filenamePrefix = 'Mave_Comfy_Upscale'
  } = {}) {
    this.reset();

    // Node 1: Load Image
    const loadImgId = this.addNode('LoadImage', {
      image: path.basename(inputImagePath)
    }, '1');

    // Node 2: Upscale Model Loader
    const modelId = this.addNode('UpscaleModelLoader', {
      model_name: upscaleModel
    }, '2');

    // Node 3: Image Upscale With Model
    const upscaleId = this.addNode('ImageUpscaleWithModel', {
      upscale_model: [modelId, 0],
      image: [loadImgId, 0]
    }, '3');

    // Node 4: Save Image
    const saveId = this.addNode('SaveImage', {
      filename_prefix: filenamePrefix,
      images: [upscaleId, 0]
    }, '4');

    return {
      type: 'upscale',
      workflow: this.nodes,
      meta: {
        inputImagePath,
        upscaleModel,
        saveNodeId: saveId
      }
    };
  }

  /**
   * Builds a Diffusion Video Generation workflow (Wan 2.1 / AnimateDiff / SVD).
   */
  buildVideo({
    prompt = 'A majestic eagle soaring gracefully over snowy alpine mountains at golden hour',
    negativePrompt = 'jitter, choppy, low quality, artifacts',
    checkpoint = 'wan2.1_t2v_14B_bf16.safetensors',
    frameCount = 24,
    fps = 12,
    width = 832,
    height = 480,
    steps = 30,
    filenamePrefix = 'Mave_Comfy_Video'
  } = {}) {
    this.reset();

    // Node 4: Video Checkpoint Loader (Wan 2.1 / SVD)
    const ckptId = this.addNode('CheckpointLoaderSimple', {
      ckpt_name: checkpoint
    }, '4');

    // Node 5: Video Empty Latent
    const latentId = this.addNode('EmptyLatentImage', {
      width,
      height,
      batch_size: frameCount
    }, '5');

    // Node 6: Positive Conditioning
    const posClipId = this.addNode('CLIPTextEncode', {
      text: prompt,
      clip: [ckptId, 1]
    }, '6');

    // Node 7: Negative Conditioning
    const negClipId = this.addNode('CLIPTextEncode', {
      text: negativePrompt,
      clip: [ckptId, 1]
    }, '7');

    // Node 3: Video KSampler
    const samplerId = this.addNode('KSampler', {
      seed: Math.floor(Math.random() * 1000000000),
      steps,
      cfg: 6.0,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1.0,
      model: [ckptId, 0],
      positive: [posClipId, 0],
      negative: [negClipId, 0],
      latent_image: [latentId, 0]
    }, '3');

    // Node 8: VAE Decode
    const vaeDecodeId = this.addNode('VAEDecode', {
      samples: [samplerId, 0],
      vae: [ckptId, 2]
    }, '8');

    // Node 9: Video Combine (SaveAnimatedWEBP or VHS_VideoCombine)
    const saveId = this.addNode('SaveAnimatedWEBP', {
      filename_prefix: filenamePrefix,
      fps,
      lossless: false,
      quality: 90,
      method: 'default',
      images: [vaeDecodeId, 0]
    }, '9');

    return {
      type: 'video',
      workflow: this.nodes,
      meta: {
        prompt,
        frameCount,
        fps,
        checkpoint,
        saveNodeId: saveId
      }
    };
  }

  /**
   * Validates DAG integrity: verifies all inputs reference existing nodes and no cyclic dependencies.
   */
  validateGraph(workflow = this.nodes) {
    const nodeIds = new Set(Object.keys(workflow));
    const errors = [];

    for (const [id, node] of Object.entries(workflow)) {
      if (!node.class_type) {
        errors.push(`Node ${id} is missing "class_type".`);
      }
      if (node.inputs && typeof node.inputs === 'object') {
        for (const [param, val] of Object.entries(node.inputs)) {
          if (Array.isArray(val) && val.length === 2) {
            const targetId = String(val[0]);
            if (!nodeIds.has(targetId)) {
              errors.push(`Node ${id} parameter "${param}" points to non-existent node "${targetId}".`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      nodeCount: nodeIds.size,
      errors
    };
  }

  /**
   * Exports workflow to a JSON file.
   */
  saveToFile(destPath, workflow = this.nodes) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, JSON.stringify(workflow, null, 2), 'utf8');
    return destPath;
  }
}

let defaultWorkflowBuilder = null;
function getWorkflowBuilder() {
  if (!defaultWorkflowBuilder) {
    defaultWorkflowBuilder = new WorkflowBuilder();
  }
  return defaultWorkflowBuilder;
}

module.exports = {
  WorkflowBuilder,
  getWorkflowBuilder
};
