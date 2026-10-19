'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const {
  soundex,
  levenshtein,
  collapseStutters,
  removeFillerWords,
  applyCustomWords,
  cleanTranscription
} = require('../src/main/local/text_cleaner');

const { DictationManager } = require('../src/main/dictation');
const dictationPlugin = require('../src/main/plugins/builtin/universal_dictation');
const { validate } = require('../src/main/plugins/registry');
const { MobileWebServer } = require('../src/main/remote/web');

test('TextCleaner: Soundex phonetic algorithm matches similar sounding words', () => {
  // Classic Soundex tests
  assert.equal(soundex('Robert'), 'R163');
  assert.equal(soundex('Rupert'), 'R163');
  assert.equal(soundex('Smith'), 'S530');
  assert.equal(soundex('Smythe'), 'S530');

  // Mave phonetic equivalents
  assert.equal(soundex('Mave'), soundex('Mayve'));
  assert.equal(soundex('Mave'), soundex('Maive'));
});

test('TextCleaner: Levenshtein distance calculates accurate edit operations', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('ChatGPT', 'chatgpt'), 4);
  assert.equal(levenshtein('Mave', 'Mave'), 0);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('TextCleaner: Stutter and repetition collapser eliminates Whisper hallucination loops', () => {
  // 3+ repetitions should collapse to 1
  assert.equal(collapseStutters('wh wh wh wh what are you doing?'), 'wh what are you doing?');
  assert.equal(collapseStutters('thank you thank you thank you'), 'thank you');
  assert.equal(collapseStutters('I I I I I think that is great'), 'I think that is great');

  // 2 repetitions (intentional emphasis) should be preserved
  assert.equal(collapseStutters('it was very very good'), 'it was very very good');
});

test('TextCleaner: Filler word removal strips fillers and restores sentence capitalization', () => {
  // Universal and English fillers
  const text1 = 'Um, what time does the train leave?';
  const cleaned1 = removeFillerWords(text1, { language: 'en' });
  assert.equal(cleaned1, 'What time does the train leave?');

  const text2 = 'I think, uh, we should go now, hmm?';
  const cleaned2 = removeFillerWords(text2, { language: 'en' });
  assert.equal(cleaned2, 'I think, we should go now?');

  const text3 = 'Uh, can you open VS Code? Um, and run tests.';
  const cleaned3 = removeFillerWords(text3, { language: 'en' });
  assert.equal(cleaned3, 'Can you open VS Code? And run tests.');
});

test('TextCleaner: Custom words dictionary replaces phonetically similar speech errors', () => {
  const dictionary = ['Mave', 'ChatGPT', 'VS Code', 'GitHub', 'Spotify'];

  // Single word phonetic correction
  const text1 = 'Hey mayve can you hear me?';
  const res1 = applyCustomWords(text1, dictionary);
  assert.equal(res1, 'Hey Mave can you hear me?');

  // Multi-word N-gram matching (2-3 words)
  const text2 = 'Open chat gpt and ask a question.';
  const res2 = applyCustomWords(text2, dictionary);
  assert.equal(res2, 'Open ChatGPT and ask a question.');

  const text3 = 'Launch vs code and clone the repository from git hub!';
  const res3 = applyCustomWords(text3, dictionary);
  assert.equal(res3, 'Launch VS Code and clone the repository from GitHub!');
});

test('TextCleaner: Full cleanTranscription pipeline combines all stages', () => {
  const raw = '[BLANK_AUDIO] Um, hey mayve, can you open chat gpt and thank you thank you thank you?';
  const result = cleanTranscription(raw, {
    customWords: ['Mave', 'ChatGPT']
  });

  assert.ok(result.startsWith('Hey Mave'));
  assert.ok(result.includes('ChatGPT'));
  assert.ok(result.includes('thank you?'));
  assert.ok(!result.includes('Um,'));
  assert.ok(!result.includes('[BLANK_AUDIO]'));
});

test('DictationManager: Injects text into active window with clipboard preservation', async () => {
  const typedActions = [];
  const mockInput = {
    type: async (text) => typedActions.push({ action: 'type', text }),
    hotkey: async (keys) => typedActions.push({ action: 'hotkey', keys }),
    key: async (k) => typedActions.push({ action: 'key', k }),
    windowTitle: async () => 'Notepad - Untitled'
  };

  const mgr = new DictationManager({ input: mockInput });

  // 1. Short text typing
  const res1 = await mgr.dictate('Hello world', { pasteMethod: 'type' });
  assert.equal(res1.ok, true);
  assert.equal(res1.text, 'Hello world');
  assert.ok(typedActions.some(a => a.action === 'type' && a.text === 'Hello world'));

  // 2. Long text with reliable paste chord and autoSubmit Enter
  const longText = 'This is a longer paragraph dictated by the user to be pasted reliably into the active window.';
  const res2 = await mgr.dictate(longText, { pasteMethod: 'reliable_paste', autoSubmit: true });
  assert.equal(res2.ok, true);
  assert.equal(res2.autoSubmitted, true);
  assert.ok(typedActions.some(a => a.action === 'hotkey' && a.keys.includes('Control')));
  assert.ok(typedActions.some(a => a.action === 'key' && a.k === 'return'));

  // 3. Custom words dictionary management
  mgr.addCustomWords(['AirLLM', 'KokoroTTS']);
  assert.ok(mgr.getCustomWords().includes('AirLLM'));
  assert.ok(mgr.getCustomWords().includes('KokoroTTS'));

  mgr.removeCustomWord('AirLLM');
  assert.ok(!mgr.getCustomWords().includes('AirLLM'));
});

test('Universal Dictation Plugin: Exports valid schemas and executes tools', async () => {
  assert.equal(Array.isArray(dictationPlugin), true);
  assert.equal(dictationPlugin.length, 4);

  for (const def of dictationPlugin) {
    const error = validate(def);
    assert.equal(error, null, `Tool ${def.name} failed schema validation: ${error}`);
  }

  const mockCtx = { log: () => {} };

  // 1. clean_speech_transcript
  const cleanTool = dictationPlugin.find(t => t.name === 'clean_speech_transcript');
  const cleanRes = await cleanTool.run({ text: 'Um, open chat gpt please' }, mockCtx);
  assert.ok(cleanRes.includes('Open ChatGPT please'));

  // 2. manage_voice_dictionary
  const dictTool = dictationPlugin.find(t => t.name === 'manage_voice_dictionary');
  const addRes = await dictTool.run({ action: 'add', words: ['Superintelligence'] }, mockCtx);
  assert.ok(addRes.includes('Superintelligence'));

  // 3. toggle_dictation_mode
  const toggleTool = dictationPlugin.find(t => t.name === 'toggle_dictation_mode');
  const toggleRes = await toggleTool.run({ enabled: true }, mockCtx);
  assert.ok(toggleRes.includes('ACTIVATED'));
});

test('MobileWebServer: Serves dictation and voice cleaning endpoints over HTTP', async () => {
  const testPort = 4922;
  const webServer = new MobileWebServer({ port: testPort });

  await webServer.start();

  try {
    // 1. POST /api/voice/clean
    const cleanData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/clean`, 'POST', {
      text: 'Um, hey mayve, open spotify'
    });
    assert.equal(cleanData.statusCode, 200);
    const cleanJson = JSON.parse(cleanData.body);
    assert.equal(cleanJson.ok, true);
    assert.equal(cleanJson.cleaned, 'Hey Mave, open Spotify');

    // 2. GET /api/dictate/status
    const statusData = await makeRequest(`http://127.0.0.1:${testPort}/api/dictate/status`, 'GET');
    assert.equal(statusData.statusCode, 200);
    const statusJson = JSON.parse(statusData.body);
    assert.equal(statusJson.ok, true);

    // 3. POST /api/dictate/toggle
    const toggleData = await makeRequest(`http://127.0.0.1:${testPort}/api/dictate/toggle`, 'POST', { enabled: true });
    assert.equal(toggleData.statusCode, 200);
    const toggleJson = JSON.parse(toggleData.body);
    assert.equal(toggleJson.ok, true);
    assert.equal(toggleJson.dictationMode, true);

    // 4. POST /api/voice/dictionary
    const dictData = await makeRequest(`http://127.0.0.1:${testPort}/api/voice/dictionary`, 'POST', {
      words: ['QuantumComputing']
    });
    assert.equal(dictData.statusCode, 200);
    const dictJson = JSON.parse(dictData.body);
    assert.equal(dictJson.ok, true);
    assert.ok(dictJson.words.includes('QuantumComputing'));

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
