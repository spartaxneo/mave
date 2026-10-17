'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { pcmToWav, resampleStereo48kToMono16k, isLoopbackAvailable } = require('../src/main/loopback');
const audioPlugin = require('../src/main/plugins/builtin/audio');
const mediaPlugin = require('../src/main/plugins/builtin/media');
const { validate } = require('../src/main/plugins/registry');

test('pcmToWav builds a valid RIFF/WAVE header', () => {
  const dummyPcm = Buffer.alloc(3200); // 1600 samples of 16-bit
  const wav = pcmToWav(dummyPcm, { sampleRate: 16000, channels: 1, bitsPerSample: 16 });

  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wav.subarray(12, 16).toString('ascii'), 'fmt ');
  assert.equal(wav.readUInt32LE(16), 16); // Subchunk1Size
  assert.equal(wav.readUInt16LE(20), 1);  // PCM format
  assert.equal(wav.readUInt16LE(22), 1);  // Mono (1 channel)
  assert.equal(wav.readUInt32LE(24), 16000); // Sample rate
  assert.equal(wav.readUInt16LE(34), 16); // 16 bits per sample
  assert.equal(wav.subarray(36, 40).toString('ascii'), 'data');
  assert.equal(wav.readUInt32LE(40), 3200); // Data length
  assert.equal(wav.length, 44 + 3200);
});

test('resampleStereo48kToMono16k correctly reduces 48kHz stereo to 16kHz mono', () => {
  // 3000 stereo frames at 48kHz = 3000 * 4 bytes = 12000 bytes
  // Resampled 16kHz mono = 1000 mono frames = 1000 * 2 bytes = 2000 bytes
  const src = Buffer.alloc(12000);
  for (let i = 0; i < 3000; i++) {
    src.writeInt16LE(1000, i * 4);     // Left channel
    src.writeInt16LE(2000, i * 4 + 2); // Right channel
  }

  const resampled = resampleStereo48kToMono16k(src);
  assert.equal(resampled.length, 2000);
  // Average of (1000 + 2000) / 2 = 1500
  assert.equal(resampled.readInt16LE(0), 1500);
  assert.equal(resampled.readInt16LE(100), 1500);
});

test('isLoopbackAvailable returns a structured status', () => {
  const status = isLoopbackAvailable();
  assert.ok(typeof status.available === 'boolean');
});

test('audio builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(audioPlugin));
  assert.equal(audioPlugin.length, 2);

  for (const tool of audioPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Audio tool ${tool.name} must be valid: ${error}`);
  }

  const names = audioPlugin.map((t) => t.name);
  assert.ok(names.includes('listen_system_audio'));
  assert.ok(names.includes('record_system_audio'));
});

test('media builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(mediaPlugin));
  assert.equal(mediaPlugin.length, 3);

  for (const tool of mediaPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Media tool ${tool.name} must be valid: ${error}`);
  }

  const names = mediaPlugin.map((t) => t.name);
  assert.ok(names.includes('generate_audio_tone'));
  assert.ok(names.includes('synthesize_sound_effect'));
  assert.ok(names.includes('generate_media_stream'));
});

test('generate_audio_tone synthesizes playable WAV audio', async () => {
  const tool = mediaPlugin.find((t) => t.name === 'generate_audio_tone');
  assert.ok(tool);

  const logs = [];
  const ctx = {
    log: (_kind, text) => logs.push(text),
    confirm: async () => true,
    signal: null,
  };

  const outFile = path.join(os.tmpdir(), `test_tone_${Date.now()}.wav`);
  try {
    const res = await tool.run({
      notes: ['A4', 'C5', 'E5'],
      waveform: 'sine',
      duration: 0.5,
      save_to: outFile,
    }, ctx);

    assert.ok(res.includes('Generated'));
    assert.ok(fs.existsSync(outFile));
    const data = fs.readFileSync(outFile);
    assert.ok(data.length > 44);
    assert.equal(data.subarray(0, 4).toString('ascii'), 'RIFF');
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
});

test('synthesize_sound_effect generates sound effect preset', async () => {
  const tool = mediaPlugin.find((t) => t.name === 'synthesize_sound_effect');
  assert.ok(tool);

  const logs = [];
  const ctx = {
    log: (_kind, text) => logs.push(text),
    confirm: async () => true,
    signal: null,
  };

  const outFile = path.join(os.tmpdir(), `test_laser_${Date.now()}.wav`);
  try {
    const res = await tool.run({
      preset: 'laser',
      duration: 0.2,
      save_to: outFile,
    }, ctx);

    assert.ok(res.includes('Synthesized'));
    assert.ok(fs.existsSync(outFile));
    const data = fs.readFileSync(outFile);
    assert.ok(data.length > 44);
    assert.equal(data.subarray(0, 4).toString('ascii'), 'RIFF');
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
});

test('generate_media_stream generates HTML5 media stream animation', async () => {
  const tool = mediaPlugin.find((t) => t.name === 'generate_media_stream');
  assert.ok(tool);

  const logs = [];
  const ctx = {
    log: (_kind, text) => logs.push(text),
    confirm: async () => true,
    signal: null,
  };

  const outFile = path.join(os.tmpdir(), `test_stream_${Date.now()}.html`);
  try {
    const res = await tool.run({
      type: 'visualizer',
      title: 'Test Audio Visualizer',
      save_to: outFile,
    }, ctx);

    assert.ok(res.includes('Generated'));
    assert.ok(fs.existsSync(outFile));
    const content = fs.readFileSync(outFile, 'utf8');
    assert.ok(content.includes('<!DOCTYPE html>'));
    assert.ok(content.includes('<canvas id="c"'));
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
});
