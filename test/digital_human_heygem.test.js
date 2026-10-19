'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');

const { LipSyncEngine, VISEMES } = require('../src/main/avatar/lip_sync_engine');
const { MotionSynthesizer } = require('../src/main/avatar/motion_synthesizer');
const { AvatarProducer, getAvatarProducer } = require('../src/main/avatar/avatar_producer');
const digitalHumanPlugin = require('../src/main/plugins/builtin/digital_human_heygem');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

test('LipSyncEngine: Decomposes text to visemes and computes smooth coarticulation curves', () => {
  const engine = new LipSyncEngine();

  // 1. Word to Viseme phonetic mapping
  const thVisemes = engine.wordToVisemes('think');
  assert.equal(thVisemes[0], VISEMES.TH);

  const bmpVisemes = engine.wordToVisemes('banana');
  assert.equal(bmpVisemes[0], VISEMES.BMP);

  // 2. Timeline generation with coarticulation
  const timeline = engine.generateVisemeTimeline({
    text: 'Hello world, welcome to our presentation.'
  });

  assert.ok(timeline.totalDurationSec > 0);
  assert.equal(timeline.wordCount, 6);
  assert.ok(timeline.keyframeCount >= 5);

  const kf1 = timeline.keyframes[0];
  assert.equal(kf1.timeSec, 0.0);
  assert.equal(kf1.viseme, VISEMES.SILENCE);

  // Verify coarticulation blends openness and width
  for (const kf of timeline.keyframes) {
    assert.ok(kf.openness >= 0.0 && kf.openness <= 1.0);
    assert.ok(kf.width >= 0.0 && kf.width <= 1.0);
  }
});

test('MotionSynthesizer: Generates 3D head sway, natural eye blinks, and breathing rhythm', () => {
  const synth = new MotionSynthesizer();

  const motion = synth.generateMotionTimeline({
    durationSec: 4.0,
    fps: 30,
    isQuestion: true
  });

  assert.equal(motion.fps, 30);
  assert.equal(motion.totalFrames, 120);
  assert.equal(motion.frames.length, 120);

  const midFrame = motion.frames[60];
  assert.ok('yawDeg' in midFrame.headPose);
  assert.ok('pitchDeg' in midFrame.headPose);
  assert.ok('rollDeg' in midFrame.headPose);
  assert.ok(midFrame.breath >= -1.0 && midFrame.breath <= 1.0);

  // Question intonation raises eyebrow towards end
  const lastFrame = motion.frames[119];
  assert.ok(lastFrame.eyebrow > 0.1);

  // Verify at least one blink occurs in 4 seconds
  const hasBlink = motion.frames.some(f => f.blink > 0.8);
  assert.equal(hasBlink, true);
});

test('AvatarProducer: Manages personas, clones custom avatar, and synthesizes video project', async () => {
  const producer = new AvatarProducer();

  // 1. Catalog inquiry
  const avatars = producer.listAvatars();
  assert.ok(avatars.length >= 4);
  assert.ok(avatars.some(a => a.id === 'alex-tech'));
  assert.ok(avatars.some(a => a.id === 'elena-educator'));

  // 2. Clone custom avatar
  const clone = producer.cloneAvatar({
    name: 'Dr. Evelyn Reed',
    sourceMedia: 'portrait_webcam.mp4',
    description: 'Lead AI Robotics Researcher',
    gender: 'female'
  });

  assert.equal(clone.name, 'Dr. Evelyn Reed');
  assert.equal(clone.isCustom, true);
  assert.ok(producer.listAvatars().some(a => a.id === clone.id));

  // 3. Produce avatar video
  const result = await producer.produceAvatarVideo({
    avatarId: 'alex-tech',
    scriptText: 'Welcome to our autonomous digital assistant demonstration.'
  });

  assert.equal(result.ok, true);
  assert.equal(result.avatar.id, 'alex-tech');
  assert.ok(result.durationSec > 0);
  assert.ok(result.totalFrames > 0);
  assert.ok(result.htmlPreviewPath.endsWith('.html'));
  assert.ok(fs.existsSync(result.htmlPreviewPath));
  assert.ok(result.ffmpegRenderCommand.includes('ffmpeg'));

  // Clean up generated html preview file
  fs.unlinkSync(result.htmlPreviewPath);
});

test('Digital Human Plugin: Validates tool schemas and runs tools', async () => {
  assert.equal(Array.isArray(digitalHumanPlugin), true);
  assert.equal(digitalHumanPlugin.length, 5);

  for (const def of digitalHumanPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = { log: () => {} };

  // 1. heygem_list_avatars
  const listTool = digitalHumanPlugin.find(t => t.name === 'heygem_list_avatars');
  const listRes = await listTool.run({}, mockCtx);
  assert.ok(listRes.includes('MAVE DIGITAL HUMAN AVATAR CATALOG'));
  assert.ok(listRes.includes('Alex'));

  // 2. heygem_synthesize_lip_sync
  const lipTool = digitalHumanPlugin.find(t => t.name === 'heygem_synthesize_lip_sync');
  const lipRes = await lipTool.run({ text: 'Quantum computation and machine intelligence' }, mockCtx);
  assert.ok(lipRes.includes('ACOUSTIC LIP-SYNC'));
  assert.ok(lipRes.includes('Keyframe'));

  // 3. heygem_clone_custom_avatar
  const cloneTool = digitalHumanPlugin.find(t => t.name === 'heygem_clone_custom_avatar');
  const cloneRes = await cloneTool.run({ name: 'Sammy Twin' }, mockCtx);
  assert.ok(cloneRes.includes('CUSTOM DIGITAL HUMAN AVATAR CLONED'));
  assert.ok(cloneRes.includes('Sammy Twin'));

  // 4. heygem_create_avatar_video
  const videoTool = digitalHumanPlugin.find(t => t.name === 'heygem_create_avatar_video');
  const videoRes = await videoTool.run({
    avatar_id: 'elena-educator',
    script_text: 'Today we explore neural visemes and coarticulation.'
  }, mockCtx);
  assert.ok(videoRes.includes('DIGITAL HUMAN VIDEO GENERATED'));
  assert.ok(videoRes.includes('Elena'));

  // 5. heygem_preview_realtime_avatar
  const previewTool = digitalHumanPlugin.find(t => t.name === 'heygem_preview_realtime_avatar');
  const previewRes = await previewTool.run({ avatar_id: 'alex-tech' }, mockCtx);
  assert.ok(previewRes.includes('REAL-TIME AVATAR STREAM READY'));
});

test('MobileWebServer: Serves Digital Human Avatar endpoints over HTTP', async () => {
  const testPort = 4940;
  const webServer = new MobileWebServer({ port: testPort });

  await webServer.start();

  try {
    // 1. GET /api/avatar/list
    const listData = await makeRequest(`http://127.0.0.1:${testPort}/api/avatar/list`, 'GET');
    assert.equal(listData.statusCode, 200);
    const listJson = JSON.parse(listData.body);
    assert.equal(listJson.ok, true);
    assert.ok(listJson.avatars.length >= 4);

    // 2. POST /api/avatar/clone
    const cloneData = await makeRequest(`http://127.0.0.1:${testPort}/api/avatar/clone`, 'POST', {
      name: 'Agent Zero',
      description: 'Covert field strategist'
    });
    assert.equal(cloneData.statusCode, 200);
    const cloneJson = JSON.parse(cloneData.body);
    assert.equal(cloneJson.ok, true);
    assert.equal(cloneJson.avatar.name, 'Agent Zero');

    // 3. POST /api/avatar/video
    const videoData = await makeRequest(`http://127.0.0.1:${testPort}/api/avatar/video`, 'POST', {
      avatarId: 'alex-tech',
      scriptText: 'Welcome to the digital human interface.'
    });
    assert.equal(videoData.statusCode, 200);
    const videoJson = JSON.parse(videoData.body);
    assert.equal(videoJson.ok, true);
    assert.equal(videoJson.avatar.id, 'alex-tech');
    assert.ok(videoJson.durationSec > 0);

    // Clean up created html file
    if (fs.existsSync(videoJson.htmlPreviewPath)) {
      fs.unlinkSync(videoJson.htmlPreviewPath);
    }

    // 4. POST /api/avatar/lipsync
    const lipData = await makeRequest(`http://127.0.0.1:${testPort}/api/avatar/lipsync`, 'POST', {
      text: 'Testing acoustic lipsync'
    });
    assert.equal(lipData.statusCode, 200);
    const lipJson = JSON.parse(lipData.body);
    assert.equal(lipJson.ok, true);
    assert.ok(lipJson.timeline.keyframeCount > 0);

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
