'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { WorkflowBuilder, getWorkflowBuilder } = require('../src/main/comfyui/workflow_builder');
const { ComfyClient, getComfyClient } = require('../src/main/comfyui/comfy_client');
const comfyUiPlugin = require('../src/main/plugins/builtin/comfyui_engine');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

test('WorkflowBuilder: Constructs valid ComfyUI API DAG workflows across tasks', () => {
  const builder = new WorkflowBuilder();

  // 1. Text to Image
  const t2i = builder.buildText2Img({
    prompt: 'Hyper-detailed futuristic cybernetic tiger in a rain-slicked Tokyo alley',
    checkpoint: 'sd_xl_base_1.0.safetensors',
    width: 1024,
    height: 1024
  });
  assert.equal(t2i.type, 'text2img');
  assert.ok(t2i.workflow['4'], 'Has CheckpointLoaderSimple');
  assert.equal(t2i.workflow['4'].class_type, 'CheckpointLoaderSimple');
  assert.equal(t2i.workflow['3'].class_type, 'KSampler');
  assert.equal(t2i.workflow['9'].class_type, 'SaveImage');
  const t2iValid = builder.validateGraph(t2i.workflow);
  assert.equal(t2iValid.valid, true);
  assert.equal(t2iValid.errors.length, 0);

  // 2. Image to Image
  const i2i = builder.buildImg2Img({
    inputImagePath: 'portrait.png',
    prompt: 'Van Gogh impressionist oil painting style',
    denoise: 0.65
  });
  assert.equal(i2i.type, 'img2img');
  assert.equal(i2i.workflow['1'].class_type, 'LoadImage');
  assert.equal(i2i.workflow['2'].class_type, 'VAEEncode');
  assert.equal(i2i.workflow['3'].inputs.denoise, 0.65);
  const i2iValid = builder.validateGraph(i2i.workflow);
  assert.equal(i2iValid.valid, true);

  // 3. ControlNet
  const cnet = builder.buildControlNet({
    hintImagePath: 'pose.png',
    controlNetModel: 'controlnet-openpose-sdxl.safetensors'
  });
  assert.equal(cnet.type, 'controlnet');
  assert.equal(cnet.workflow['10'].class_type, 'ControlNetLoader');
  assert.equal(cnet.workflow['11'].class_type, 'ControlNetApply');
  const cnetValid = builder.validateGraph(cnet.workflow);
  assert.equal(cnetValid.valid, true);

  // 4. Super-Resolution Upscale
  const upscale = builder.buildUpscale({
    inputImagePath: 'small_asset.png',
    upscaleModel: '4x-UltraSharp.pth'
  });
  assert.equal(upscale.type, 'upscale');
  assert.equal(upscale.workflow['2'].class_type, 'UpscaleModelLoader');
  assert.equal(upscale.workflow['3'].class_type, 'ImageUpscaleWithModel');
  const upscaleValid = builder.validateGraph(upscale.workflow);
  assert.equal(upscaleValid.valid, true);

  // 5. Video Diffusion (Wan 2.1)
  const video = builder.buildVideo({
    prompt: 'Cinematic drone flythrough of lush tropical waterfall canyon',
    frameCount: 32,
    fps: 16
  });
  assert.equal(video.type, 'video');
  assert.equal(video.workflow['5'].inputs.batch_size, 32);
  assert.equal(video.workflow['9'].class_type, 'SaveAnimatedWEBP');
  const videoValid = builder.validateGraph(video.workflow);
  assert.equal(videoValid.valid, true);
});

test('ComfyClient: Handles offline server gracefully and executes with online server', async () => {
  // 1. Offline test on unused port
  const offlineClient = new ComfyClient({ host: '127.0.0.1', port: 59182 });
  const offlineStatus = await offlineClient.checkStatus();
  assert.equal(offlineStatus.online, false);
  assert.ok(offlineStatus.error);
  assert.ok(offlineStatus.launchCommand.includes('59182'));

  const offlineModels = await offlineClient.getAvailableModels();
  assert.equal(offlineModels.ok, false);
  assert.ok(offlineModels.checkpoints.length > 0);

  // 2. Spin up mock ComfyUI server
  const mockPort = 59183;
  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${mockPort}`);

    if (url.pathname === '/system_stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        system: { os: 'windows', python_version: '3.11.9' },
        devices: [{
          name: 'NVIDIA GeForce RTX 4090',
          type: 'cuda',
          vram_total: 24 * (1024 ** 3),
          vram_free: 20 * (1024 ** 3)
        }]
      }));
    }

    if (url.pathname === '/object_info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        CheckpointLoaderSimple: {
          input: { required: { ckpt_name: [['sd_xl_base_1.0.safetensors', 'flux1-dev.safetensors']] } }
        },
        LoraLoader: {
          input: { required: { lora_name: [['add-detail-xl.safetensors']] } }
        },
        KSampler: {
          input: {
            required: {
              sampler_name: [['euler', 'dpmpp_2m']],
              scheduler: [['normal', 'karras']]
            }
          }
        }
      }));
    }

    if (req.method === 'POST' && url.pathname === '/prompt') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        prompt_id: 'mock_prompt_99',
        number: 1
      }));
    }

    if (url.pathname === '/history/mock_prompt_99') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        mock_prompt_99: {
          status: { status_str: 'success' },
          outputs: {
            '9': {
              images: [{ filename: 'mock_out_001.png', subfolder: '', type: 'output' }]
            }
          }
        }
      }));
    }

    if (url.pathname === '/view') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      // Send dummy 1x1 PNG bytes
      const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      return res.end(pngBuffer);
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(r => mockServer.listen(mockPort, '127.0.0.1', r));

  try {
    const onlineClient = new ComfyClient({ host: '127.0.0.1', port: mockPort });
    const onlineStatus = await onlineClient.checkStatus();
    assert.equal(onlineStatus.online, true);
    assert.equal(onlineStatus.devices[0].name, 'NVIDIA GeForce RTX 4090');
    assert.equal(onlineStatus.devices[0].vramTotalGB, 24);

    const models = await onlineClient.getAvailableModels();
    assert.equal(models.ok, true);
    assert.ok(models.checkpoints.includes('flux1-dev.safetensors'));

    // Execute workflow end-to-end
    const builder = new WorkflowBuilder();
    const { workflow } = builder.buildText2Img({ prompt: 'Test Prompt' });
    const tmpDir = path.join(os.tmpdir(), `mave_test_${Date.now()}`);

    const result = await onlineClient.executeWorkflow({
      workflow,
      outputDir: tmpDir
    });

    assert.equal(result.ok, true);
    assert.equal(result.promptId, 'mock_prompt_99');
    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0].filename, 'mock_out_001.png');
    assert.ok(fs.existsSync(result.assets[0].filePath));

    // Cleanup tmpDir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } finally {
    mockServer.close();
  }
});

test('ComfyUI Plugin: Validates tool schemas and runs offline fallback & builder tools', async () => {
  assert.equal(Array.isArray(comfyUiPlugin), true);
  assert.equal(comfyUiPlugin.length, 5);

  for (const def of comfyUiPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = { log: () => {} };

  // 1. comfyui_status
  const statusTool = comfyUiPlugin.find(t => t.name === 'comfyui_status');
  const statusRes = await statusTool.run({}, mockCtx);
  assert.ok(statusRes.includes('COMFYUI STUDIO STATUS'));

  // 2. comfyui_build_workflow
  const buildTool = comfyUiPlugin.find(t => t.name === 'comfyui_build_workflow');
  const buildRes = await buildTool.run({
    workflow_type: 'text2img',
    prompt: 'Ancient fantasy library floating in cosmos'
  }, mockCtx);
  assert.ok(buildRes.includes('COMFYUI WORKFLOW DAG GENERATED'));
  assert.ok(buildRes.includes('Total Graph Nodes'));

  // 3. comfyui_generate_image (offline fallback)
  const genTool = comfyUiPlugin.find(t => t.name === 'comfyui_generate_image');
  const genRes = await genTool.run({
    prompt: 'Luminescent cyberpunk neon garden'
  }, mockCtx);
  assert.ok(genRes.includes('COMFYUI'));
  assert.ok(genRes.includes('Workflow'));

  // 4. comfyui_upscale_image
  const upscaleTool = comfyUiPlugin.find(t => t.name === 'comfyui_upscale_image');
  const upscaleRes = await upscaleTool.run({
    image_path: 'mock_test.png'
  }, mockCtx);
  assert.ok(upscaleRes.includes('UPSCAL'));

  // 5. comfyui_generate_video
  const videoTool = comfyUiPlugin.find(t => t.name === 'comfyui_generate_video');
  const videoRes = await videoTool.run({
    prompt: 'Soaring over endless desert dunes'
  }, mockCtx);
  assert.ok(videoRes.includes('VIDEO'));
});

test('MobileWebServer: Serves ComfyUI API endpoints over HTTP', async () => {
  const testPort = 4930;
  const webServer = new MobileWebServer({ port: testPort });

  await webServer.start();

  try {
    // 1. GET /api/comfyui/status
    const statusData = await makeRequest(`http://127.0.0.1:${testPort}/api/comfyui/status`, 'GET');
    assert.equal(statusData.statusCode, 200);
    const statusJson = JSON.parse(statusData.body);
    assert.equal(statusJson.ok, true);
    assert.ok('status' in statusJson);
    assert.ok('models' in statusJson);

    // 2. POST /api/comfyui/workflow
    const workflowData = await makeRequest(`http://127.0.0.1:${testPort}/api/comfyui/workflow`, 'POST', {
      type: 'text2img',
      prompt: 'Golden steampunk dragonfly'
    });
    assert.equal(workflowData.statusCode, 200);
    const workflowJson = JSON.parse(workflowData.body);
    assert.equal(workflowJson.ok, true);
    assert.equal(workflowJson.validation.valid, true);

    // 3. POST /api/comfyui/generate (offline fallback)
    const genData = await makeRequest(`http://127.0.0.1:${testPort}/api/comfyui/generate`, 'POST', {
      prompt: 'A futuristic city in the clouds'
    });
    assert.equal(genData.statusCode, 200);
    const genJson = JSON.parse(genData.body);
    assert.equal(genJson.ok, true);

    // 4. POST /api/comfyui/upscale
    const upscaleData = await makeRequest(`http://127.0.0.1:${testPort}/api/comfyui/upscale`, 'POST', {
      imagePath: 'sample.png',
      upscaleModel: '4x-UltraSharp.pth'
    });
    assert.equal(upscaleData.statusCode, 200);
    const upscaleJson = JSON.parse(upscaleData.body);
    assert.equal(upscaleJson.ok, true);

  } finally {
    webServer.stop();
  }
});

function makeRequest(urlStr, method = 'GET', bodyObj = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    });

    req.on('error', reject);

    if (bodyObj) {
      req.write(JSON.stringify(bodyObj));
    }
    req.end();
  });
}
