'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SoundscapeGenerator } = require('../src/main/audio/soundscape_generator');
const soundscapePlugin = require('../src/main/plugins/builtin/soundscape_generator');

test('SoundscapeGenerator generates accurate binaural frequencies and cognitive targets', () => {
  const gen = new SoundscapeGenerator();

  // Alpha flow
  const alpha = gen.generateSoundscapeProfile({ mode: 'ALPHA', durationMinutes: 60, ambientLayer: 'BROWN_NOISE' });
  assert.equal(alpha.mode, 'ALPHA');
  assert.equal(alpha.frequencies.carrierFrequencyHz, 210);
  assert.equal(alpha.frequencies.binauralBeatHz, 10);
  assert.equal(alpha.frequencies.leftChannelHz, 210);
  assert.equal(alpha.frequencies.rightChannelHz, 220);
  assert.ok(alpha.cognitiveTarget.includes('Flow State'));

  // Beta high intensity
  const beta = gen.generateSoundscapeProfile({ mode: 'BETA' });
  assert.equal(beta.mode, 'BETA');
  assert.equal(beta.frequencies.binauralBeatHz, 21.5);
  assert.ok(beta.cognitiveTarget.includes('Coding & Logic'));
});

test('SoundscapeGenerator adapts to elevated heart rate with biofeedback down-regulation', () => {
  const gen = new SoundscapeGenerator();

  const stressed = gen.generateSoundscapeProfile({ mode: 'ALPHA', heartRateBpm: 105 });
  assert.ok(stressed.biofeedbackAdjustment);
  assert.equal(stressed.biofeedbackAdjustment.observedBpm, 105);
  assert.ok(stressed.biofeedbackAdjustment.recommendation.includes('Elevated heart rate'));
  assert.ok(stressed.biofeedbackAdjustment.targetEntrainment.includes('THETA'));
});

test('Soundscape Generator builtin plugin tools run properly', async () => {
  const genTool = soundscapePlugin.find(t => t.name === 'soundscape_generate_focus_audio');
  assert.ok(genTool);

  const mockCtx = { log: () => {} };
  const output = await genTool.run({
    mode: 'ALPHA',
    duration_minutes: 30,
    ambient_texture: 'BROWN_NOISE'
  }, mockCtx);

  assert.ok(output.includes('COGNITIVE ACOUSTIC SOUNDSCAPE GENERATED'));
  assert.ok(output.includes('Binaural Differential'));
  assert.ok(output.includes('BROWN_NOISE'));
});
