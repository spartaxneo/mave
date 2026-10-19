'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { VoiceDesigner, getVoiceDesigner } = require('../src/main/voice_studio/voice_designer');
const { VoiceCloner, getVoiceCloner } = require('../src/main/voice_studio/voice_cloner');
const { VideoDubber, getVideoDubber } = require('../src/main/voice_studio/video_dubber');
const { AudiobookProducer, getAudiobookProducer } = require('../src/main/voice_studio/audiobook_producer');
const voiceStudioPlugin = require('../src/main/plugins/builtin/voice_studio_omnivoice');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

test('VoiceDesigner: Prompt-based Voice Design extracts accurate acoustic attributes', () => {
  const designer = new VoiceDesigner();

  // 1. British professor persona
  const voice1 = designer.designVoiceFromPrompt('Senior British professor with deep gravelly baritone voice and slow thoughtful delivery');
  assert.equal(voice1.gender, 'male');
  assert.equal(voice1.age, 'senior');
  assert.ok(voice1.pitch < 0, 'Pitch should be lower/deep');
  assert.equal(voice1.accent, 'british_rp');
  assert.ok(voice1.speed < 1.0, 'Speed should be slower/measured');

  // 2. Whispered bedtime companion
  const voice2 = designer.designVoiceFromPrompt('Young female bedtime storyteller with soft gentle whisper');
  assert.equal(voice2.gender, 'female');
  assert.equal(voice2.age, 'young_adult');
  assert.ok(voice2.pitch > 0, 'Pitch should be higher');
  assert.equal(voice2.style, 'whispered');

  // 3. Gallery retrieval
  const allVoices = designer.listVoices();
  assert.ok(allVoices.length >= 6); // 4 seeded + 2 newly designed
  assert.ok(allVoices.some(v => v.id === voice1.id));
});

test('VoiceCloner: Zero-shot voice cloning and acoustic profile matching', async () => {
  const cloner = new VoiceCloner();

  // Create mock 16kHz audio buffer
  const sampleBuf = Buffer.alloc(32000 * 4);
  for (let i = 0; i < sampleBuf.length; i++) {
    sampleBuf[i] = (i % 256);
  }

  // 1. Clone voice from buffer
  const clone1 = await cloner.cloneVoice({
    name: 'Alex Rivera',
    audioBuffer: sampleBuf,
    description: 'Host of Tech Horizons podcast'
  });

  assert.equal(clone1.name, 'Alex Rivera');
  assert.ok(clone1.id.startsWith('clone-'));
  assert.equal(clone1.features.embedding.length, 32);
  assert.ok(clone1.features.f0Mean > 0);

  // 2. Cosine similarity speaker matching
  const match = cloner.matchSpeaker(sampleBuf);
  assert.ok(match);
  assert.equal(match.clone.id, clone1.id);
  assert.equal(match.similarity, 1.0); // Exact same buffer = 1.0 similarity
});

test('VideoDubber: Segments video dialogue and computes synchronized multilingual dubbing', async () => {
  const dubber = new VideoDubber();

  const res = await dubber.dubVideo({
    videoPath: 'C:/Users/User/Videos/sample_tech_reel.mp4',
    targetLanguage: 'es',
    voiceId: 'narrator-british-deep'
  });

  assert.equal(res.ok, true);
  assert.equal(res.targetLanguage, 'es');
  assert.ok(res.dubbedVideoPath.includes('_dubbed_es.mp4'));
  assert.equal(res.segmentCount, 4);

  // Check segment synchronization
  const seg1 = res.segments[0];
  assert.equal(seg1.startSec, 0.0);
  assert.equal(seg1.endSec, 3.5);
  assert.equal(seg1.translatedText, 'hola, bienvenidos a nuestro video.');
  assert.ok(seg1.targetSpeedMultiplier > 0);
});

test('AudiobookProducer: Parses character dialogue and casts multi-speaker audiobook', async () => {
  const producer = new AudiobookProducer();

  const script = `
    NARRATOR: The rain hammered against the stained glass windows of the cathedral.
    ALICE: "Did you hear that sound?" she asked.
    BOB: "It was nothing, just the wind," he replied.
    ALICE: "No, someone is outside."
    The shadows stretched across the marble floor as footsteps approached.
  `;

  // 1. Parse script
  const lines = producer.parseScript(script);
  assert.equal(lines.length, 5);
  assert.equal(lines[0].speaker, 'NARRATOR');
  assert.equal(lines[1].speaker, 'ALICE');
  assert.equal(lines[2].speaker, 'BOB');

  // 2. Produce audiobook project
  const project = await producer.produceAudiobook({
    title: 'The Cathedral Mystery',
    scriptText: script,
    voiceCast: {
      'NARRATOR': 'narrator-british-deep',
      'ALICE': 'companion-soothing-female',
      'BOB': 'tech-founder-energetic'
    }
  });

  assert.equal(project.ok, true);
  assert.equal(project.title, 'The Cathedral Mystery');
  assert.equal(project.totalLines, 5);
  assert.ok(project.speakers.includes('NARRATOR'));
  assert.ok(project.speakers.includes('ALICE'));
  assert.ok(project.speakers.includes('BOB'));
  assert.ok(project.totalDurationSeconds > 0);
});

test('Voice Studio Plugin: Validates tool schemas and runs tools', async () => {
  assert.equal(Array.isArray(voiceStudioPlugin), true);
  assert.equal(voiceStudioPlugin.length, 5);

  for (const def of voiceStudioPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = { log: () => {} };

  // 1. design_custom_voice
  const designTool = voiceStudioPlugin.find(t => t.name === 'design_custom_voice');
  const designRes = await designTool.run({ prompt: 'Deep resonant voice of an ancient wizard' }, mockCtx);
  assert.ok(designRes.includes('VOICE PERSONA DESIGNED'));
  assert.ok(designRes.includes('Acoustic Pitch'));

  // 2. clone_voice_profile
  const cloneTool = voiceStudioPlugin.find(t => t.name === 'clone_voice_profile');
  const cloneRes = await cloneTool.run({ name: 'Sam Altman' }, mockCtx);
  assert.ok(cloneRes.includes('VOICE CLONED SUCCESSFULLY'));
  assert.ok(cloneRes.includes('Sam Altman'));

  // 3. dub_video_multilingual
  const dubTool = voiceStudioPlugin.find(t => t.name === 'dub_video_multilingual');
  const dubRes = await dubTool.run({ video_path: 'video.mp4', target_language: 'fr' }, mockCtx);
  assert.ok(dubRes.includes('VIDEO DUBBING COMPLETE'));
  assert.ok(dubRes.includes('FR'));

  // 4. produce_multi_voice_story
  const storyTool = voiceStudioPlugin.find(t => t.name === 'produce_multi_voice_story');
  const storyRes = await storyTool.run({
    title: 'The Galactic Odyssey',
    script_text: 'COMMANDER: Set coordinates for Mars.\nNAVIGATOR: Coordinates locked in, sir.'
  }, mockCtx);
  assert.ok(storyRes.includes('MULTI-VOICE AUDIO STORY PRODUCED'));
  assert.ok(storyRes.includes('The Galactic Odyssey'));

  // 5. list_voice_personas
  const listTool = voiceStudioPlugin.find(t => t.name === 'list_voice_personas');
  const listRes = await listTool.run({}, mockCtx);
  assert.ok(listRes.includes('MAVE VOICE STUDIO CATALOG'));
  assert.ok(listRes.includes('Designed Voices'));
});

test('MobileWebServer: Serves Voice Studio endpoints over HTTP', async () => {
  const testPort = 4923;
  const webServer = new MobileWebServer({ port: testPort });

  await webServer.start();

  try {
    // 1. POST /api/voice/design
    const designData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/design`, 'POST', {
      prompt: 'Warm empathetic female therapist with soothing tone',
      name: 'Dr. Clara'
    });
    assert.equal(designData.statusCode, 200);
    const designJson = JSON.parse(designData.body);
    assert.equal(designJson.ok, true);
    assert.equal(designJson.voice.name, 'Dr. Clara');
    assert.equal(designJson.voice.gender, 'female');

    // 2. POST /api/voice/clone
    const cloneData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/clone`, 'POST', {
      name: 'Sarah Connor',
      description: 'Resistance fighter voice'
    });
    assert.equal(cloneData.statusCode, 200);
    const cloneJson = JSON.parse(cloneData.body);
    assert.equal(cloneJson.ok, true);
    assert.equal(cloneJson.clone.name, 'Sarah Connor');

    // 3. POST /api/voice/dub
    const dubData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/dub`, 'POST', {
      videoPath: 'my_clip.mp4',
      targetLanguage: 'de'
    });
    assert.equal(dubData.statusCode, 200);
    const dubJson = JSON.parse(dubData.body);
    assert.equal(dubJson.ok, true);
    assert.equal(dubJson.targetLanguage, 'de');

    // 4. POST /api/voice/story
    const storyData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/story`, 'POST', {
      title: 'Midnight Run',
      scriptText: 'JACK: We need to hurry.\nSARAH: I know, the train is leaving.'
    });
    assert.equal(storyData.statusCode, 200);
    const storyJson = JSON.parse(storyData.body);
    assert.equal(storyJson.ok, true);
    assert.equal(storyJson.title, 'Midnight Run');
    assert.equal(storyJson.totalLines, 2);

    // 5. GET /api/voice/personas
    const personasData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/personas`, 'GET');
    assert.equal(personasData.statusCode, 200);
    const personasJson = JSON.parse(personasData.body);
    assert.equal(personasJson.ok, true);
    assert.ok(personasJson.designed.length > 0);
    assert.ok(personasJson.cloned.length > 0);

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
