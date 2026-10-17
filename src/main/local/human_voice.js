'use strict';
// Hyper-Humanized Multi-Lingual Smart Voice & Conversational Prosody Engine for Mave.
// Injects natural human thinking fillers (Hmm, Ah, Got it), breath pauses (...),
// and delivers fluent multi-lingual speech using OpenAI Neural TTS (ChatGPT Alloy/Nova) and Kokoro.

const https = require('https');
const { speakable } = require('./verbalizer');

// Language detection heuristic based on Unicode scripts and frequent grammatical markers
function detectLanguage(text) {
  const t = String(text || '').trim();
  if (!t) return 'en';

  // Devanagari script (Hindi / Sanskrit / Marathi)
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  // Common Romanized Hindi words (Hinglish)
  if (/\b(?:kya|hai|haan|nahi|karo|bhai|kaise|achha|theek|samajh|dekho|mera|apna|shukriya|namaste|chal)\b/i.test(t)) return 'hi';

  // Japanese (Hiragana / Katakana / Kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';

  // Chinese (Hanzi)
  if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';

  // Spanish
  if (/\b(?:hola|gracias|por favor|buenos|dias|tardes|como|estas|amigo|si|claro)\b/i.test(t)) return 'es';

  // French
  if (/\b(?:bonjour|merci|s'il vous plait|oui|d'accord|comment|bienvenue)\b/i.test(t)) return 'fr';

  // German
  if (/\b(?:guten tag|danke|bitte|ja|wie geht's|hallo|alles klar)\b/i.test(t)) return 'de';

  return 'en';
}

/**
 * Natural human conversational fillers and breath pauses by language.
 */
const HUMAN_FILLERS = {
  en: [
    'Hmm... ',
    'Ah, let’s see... ',
    'Got it... ',
    'Alright... ',
    'Right... ',
  ],
  hi: [
    'Hmm... dekhte hain... ',
    'Acha... samajh gaya... ',
    'Haan... bilkul... ',
    'Suno... ',
  ],
  es: [
    'Hmm... veamos... ',
    'Ah, entiendo... ',
    'Claro... ',
    'De acuerdo... ',
  ],
  fr: [
    'Hmm... voyons voir... ',
    'Ah, d’accord... ',
    'Bien sûr... ',
  ],
  de: [
    'Hmm... mal sehen... ',
    'Alles klar... ',
    'Verstanden... ',
  ],
  ja: [
    'ええと... ',
    'なるほど... ',
    'わかりました... ',
  ],
  zh: [
    '嗯... 好的... ',
    '明白了... ',
    '让我想想... ',
  ],
};

/**
 * Enrich text with human conversational pacing, breath pauses, and natural speech cadence.
 */
function enrichHumanProsody(text, { addFiller = false, language = null } = {}) {
  let clean = speakable(text);
  if (!clean) return '';

  const lang = language || detectLanguage(clean);

  // Soften robotic list markers into conversational prose
  clean = clean.replace(/^(?:1|2|3|4|5)\.\s+/gm, 'First, ')
               .replace(/^(?:[•*-])\s+/gm, 'Also, ');

  // Insert natural human breathing pauses before clauses (..., )
  clean = clean.replace(/\b(however|furthermore|on the other hand|specifically|moreover)\b/gi, '... $1');
  clean = clean.replace(/\b(so|well|actually|honestly|in fact)\b/gi, '$1...');

  // Inject a natural thinking filler at the start if requested (e.g. for real-time voice mode response)
  if (addFiller && !/^(?:hmm|ah|got it|alright|right|ok|sure|yes|no)\b/i.test(clean)) {
    const list = HUMAN_FILLERS[lang] || HUMAN_FILLERS.en;
    const filler = list[Math.floor(Math.random() * list.length)];
    clean = `${filler}${clean}`;
  }

  // Ensure breath pauses don't stack excessively
  clean = clean.replace(/(?:\.\.\.\s*){2,}/g, '... ').trim();
  return clean;
}

const OPENAI_TTS_CACHE = new Map();

/**
 * Synthesize speech using OpenAI's neural TTS (ChatGPT voice) with multi-lingual support.
 * Voices: alloy (default neutral warm), nova (energetic female), shimmer (expressive female),
 * echo (smooth male), onyx (deep male), fable (warm narrative).
 */
function synthesizeOpenAITTS({ text, apiKey, voice = 'alloy', speed = 1.0, model = 'tts-1', endpoint = null }) {
  const cacheKey = `${voice}|${speed}|${text}`;
  if (OPENAI_TTS_CACHE.has(cacheKey)) {
    return Promise.resolve(OPENAI_TTS_CACHE.get(cacheKey));
  }

  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('OpenAI API key is required for ChatGPT voice.'));

    let hostname = 'api.openai.com';
    let path = '/v1/audio/speech';
    let port = 443;
    let protocol = https;

    if (endpoint) {
      try {
        const u = new URL(endpoint);
        hostname = u.hostname;
        port = u.port || (u.protocol === 'http:' ? 80 : 443);
        protocol = u.protocol === 'http:' ? require('http') : https;
        path = u.pathname.replace(/\/+$/, '') + '/audio/speech';
      } catch {}
    }

    const payload = JSON.stringify({
      model: model || 'tts-1',
      input: text,
      voice: voice || 'alloy',
      speed: Math.max(0.25, Math.min(2.0, Number(speed) || 1.0)),
      response_format: 'mp3',
    });

    const req = protocol.request({
      hostname,
      port,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const result = { ok: true, buffer, format: 'audio/mpeg' };
          if (text.length <= 120) {
            OPENAI_TTS_CACHE.set(cacheKey, result);
            if (OPENAI_TTS_CACHE.size > 80) {
              const firstKey = OPENAI_TTS_CACHE.keys().next().value;
              OPENAI_TTS_CACHE.delete(firstKey);
            }
          }
          resolve(result);
        } else {
          try {
            const errJson = JSON.parse(buffer.toString('utf8'));
            reject(new Error(errJson.error?.message || `OpenAI TTS error ${res.statusCode}`));
          } catch {
            reject(new Error(`OpenAI TTS returned HTTP ${res.statusCode}`));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

module.exports = {
  detectLanguage,
  enrichHumanProsody,
  synthesizeOpenAITTS,
  HUMAN_FILLERS,
};
