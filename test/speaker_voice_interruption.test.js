'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  SpeakerRecognizer,
  extractVoiceprint,
  estimatePitch,
  cosineSimilarity,
} = require('../src/main/local/speaker_recognition');

const {
  detectLanguage,
  enrichHumanProsody,
  HUMAN_FILLERS,
} = require('../src/main/local/human_voice');

const {
  InterruptionFilter,
} = require('../src/main/local/interruption_filter');

function createSyntheticWav(frequency = 150, durationSec = 0.2, sampleRate = 16000) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 16000)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }
  return buffer;
}

test('SpeakerRecognizer extracts voiceprints and estimates pitch', () => {
  const wavLow = createSyntheticWav(110);
  const wavHigh = createSyntheticWav(220);

  const vpLow = extractVoiceprint(wavLow);
  const vpHigh = extractVoiceprint(wavHigh);

  assert.ok(vpLow);
  assert.ok(vpHigh);
  assert.ok(vpLow.pitch >= 90 && vpLow.pitch <= 130, `Pitch should be near 110Hz, got ${vpLow.pitch}`);
  assert.ok(vpHigh.pitch >= 190 && vpHigh.pitch <= 245, `Pitch should be near 220Hz, got ${vpHigh.pitch}`);

  // Test cosine similarity of identical vs different vectors
  const selfSim = cosineSimilarity(vpLow.vector, vpLow.vector);
  assert.ok(selfSim > 0.99, 'Self similarity should be close to 1.0');
});

test('SpeakerRecognizer enrolls, identifies, and lists family members and owner', () => {
  const tmpFile = path.join(os.tmpdir(), `mave_voiceprints_test_${Date.now()}.json`);
  const recognizer = new SpeakerRecognizer(tmpFile);

  const wavUser1 = createSyntheticWav(120);
  const wavUser2 = createSyntheticWav(230);

  // 1. Auto-enrollment on first speech if no profiles
  const firstId = recognizer.identify(wavUser1);
  assert.equal(firstId.identified, true);
  assert.equal(firstId.name, 'Primary User');
  assert.equal(firstId.role, 'owner');

  // 2. Explicit enrollment of family member
  recognizer.enroll('Sarah', wavUser2, 'family');

  const speakers = recognizer.listSpeakers();
  assert.equal(speakers.length, 2);
  assert.ok(speakers.some((s) => s.name === 'Sarah' && s.role === 'family'));

  // 3. Identification test
  const idSarah = recognizer.identify(wavUser2);
  assert.equal(idSarah.identified, true);
  assert.equal(idSarah.name, 'Sarah');

  // 4. Deletion
  const deleted = recognizer.deleteSpeaker('Sarah');
  assert.equal(deleted, true);
  assert.equal(recognizer.listSpeakers().length, 1);

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('Human Voice detects languages correctly', () => {
  assert.equal(detectLanguage('Hello, what can you do today?'), 'en');
  assert.equal(detectLanguage('नमस्ते, आप कैसे हैं?'), 'hi');
  assert.equal(detectLanguage('bhai kya haal hai mera kaam karo'), 'hi');
  assert.equal(detectLanguage('Hola amigo, como estas hoy?'), 'es');
  assert.equal(detectLanguage('Bonjour mon ami, merci beaucoup'), 'fr');
  assert.equal(detectLanguage('Guten Tag, danke schön!'), 'de');
  assert.equal(detectLanguage('こんにちは、元気ですか？'), 'ja');
  assert.equal(detectLanguage('你好，今天天气怎么样？'), 'zh');
});

test('enrichHumanProsody applies natural pauses and conversational fillers', () => {
  const rawText = '1. Open the file\n2. Edit the content\nHowever, you must be careful.';
  const enriched = enrichHumanProsody(rawText, { addFiller: true, language: 'en' });

  // List markers should be softened
  assert.ok(!enriched.startsWith('1.'), 'Numeric list markers should be replaced with natural words');
  assert.ok(enriched.includes('First,') || enriched.includes('Open the file'));

  // Breath pause before however
  assert.ok(enriched.includes('... however') || enriched.includes('... However'));

  // Filler check
  const hasFiller = HUMAN_FILLERS.en.some((f) => enriched.startsWith(f.trim()));
  assert.ok(hasFiller, `Expected speech to start with a natural filler, got: "${enriched}"`);
});

test('InterruptionFilter distinguishes direct interrupts from side chatter and noise', () => {
  const filter = new InterruptionFilter();

  // 1. Direct interruption commands
  const direct1 = filter.evaluate({ transcript: 'Mave stop right now', isMaveSpeaking: true });
  assert.equal(direct1.shouldInterrupt, true);
  assert.equal(direct1.action, 'interrupt');
  assert.equal(direct1.reason, 'direct_command');

  const direct2 = filter.evaluate({ transcript: 'wait a second hold on', isMaveSpeaking: true });
  assert.equal(direct2.shouldInterrupt, true);
  assert.equal(direct2.action, 'interrupt');

  // 2. Side-talk to family / roommate
  const sideTalk = filter.evaluate({
    transcript: 'Mom pass the salt please',
    isMaveSpeaking: true,
    rms: 0.05,
  });
  assert.equal(sideTalk.shouldInterrupt, false);
  assert.equal(sideTalk.action, 'ignore');
  assert.equal(sideTalk.reason, 'side_conversation_detected');

  const sideTalk2 = filter.evaluate({
    transcript: 'hey dude what are we eating tonight',
    isMaveSpeaking: true,
    rms: 0.06,
  });
  assert.equal(sideTalk2.shouldInterrupt, false);
  assert.equal(sideTalk2.action, 'ignore');

  // 3. Low acoustic energy / background murmur
  const lowEnergy = filter.evaluate({
    transcript: 'cough or whisper in distance',
    isMaveSpeaking: true,
    rms: 0.01,
  });
  assert.equal(lowEnergy.shouldInterrupt, false);
  assert.equal(lowEnergy.reason, 'low_energy_background_chatter');

  // 4. Enrolled owner speaking with high confidence and clear energy
  const ownerSpeak = filter.evaluate({
    transcript: 'can we look at something else',
    isMaveSpeaking: true,
    rms: 0.06,
    speaker: { identified: true, role: 'owner', name: 'Primary User', confidence: 0.88 },
  });
  assert.equal(ownerSpeak.shouldInterrupt, true);
  assert.equal(ownerSpeak.reason, 'enrolled_owner_speech_override');

  // 5. When Mave is not speaking, never interrupt
  const notSpeaking = filter.evaluate({ transcript: 'stop', isMaveSpeaking: false });
  assert.equal(notSpeaking.shouldInterrupt, false);
});

test('VOICES catalog includes ChatGPT neural voices and studio blended Kokoro voices', () => {
  const { VOICES, ackFile } = require('../src/main/kokoro');
  const { isFemaleVoice, isMaleVoice } = require('../src/main/voice');

  const voiceIds = VOICES.map((v) => v.id);

  // ChatGPT voices
  ['nova', 'alloy', 'shimmer', 'echo', 'onyx', 'fable'].forEach((id) => {
    assert.ok(voiceIds.includes(id), `VOICES must include ChatGPT voice ${id}`);
  });

  // Studio Blended voices
  ['blend_muse', 'blend_serena', 'blend_orion'].forEach((id) => {
    assert.ok(voiceIds.includes(id), `VOICES must include Blended voice ${id}`);
  });

  // Check genders
  assert.equal(isFemaleVoice('nova'), true);
  assert.equal(isFemaleVoice('alloy'), true);
  assert.equal(isFemaleVoice('shimmer'), true);
  assert.equal(isFemaleVoice('blend_muse'), true);
  assert.equal(isFemaleVoice('blend_serena'), true);

  assert.equal(isMaleVoice('echo'), true);
  assert.equal(isMaleVoice('onyx'), true);
  assert.equal(isMaleVoice('fable'), true);
  assert.equal(isMaleVoice('blend_orion'), true);

  // Instant acknowledgment: all voices fall back to instant ACK wav
  const ackNova = ackFile('nova', 1.0);
  assert.ok(ackNova && fs.existsSync(ackNova), 'ackFile must return valid audio file for nova');
  const ackMuse = ackFile('blend_muse', 1.0);
  assert.ok(ackMuse && fs.existsSync(ackMuse), 'ackFile must return valid audio file for blend_muse');
});

test('AudioService prepare and speak handles audio objects with buffer and type', async () => {
  const { AudioService } = require('../src/main/audio');
  const mockSettings = {
    get: (key) => {
      if (key === 'speakResponses') return true;
      if (key === 'ttsProvider') return 'kokoro';
      if (key === 'voice') return 'blend_muse';
      if (key === 'speechRate') return 1.0;
      return null;
    },
  };

  const a = new AudioService({ windows: {}, settings: mockSettings, logger: { error: () => {}, warn: () => {} } });

  // Mock kokoro.say
  const fakeWav = Buffer.from('RIFF....WAVEfmt ');
  a.kokoro.say = async () => fakeWav;

  const prep = await a.prepare('Hello world');
  assert.ok(prep);
  assert.ok(Buffer.isBuffer(prep.buffer));
  assert.equal(prep.type, 'audio/wav');

  // Verify speak calls engine play with correct audio payload
  let playedPayload = null;
  a.call = async (cmd, args) => {
    if (cmd === 'play') playedPayload = args;
    return true;
  };

  const used = await a.speak('Hello world', { prepared: prep });
  assert.equal(used, 'bigfoot');
  assert.ok(playedPayload);
  assert.equal(playedPayload.type, 'audio/wav');
  assert.deepEqual(playedPayload.audio, fakeWav);
});

