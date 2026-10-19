'use strict';

/**
 * Text Cleaner & Voice Audio Post-Processing Pipeline
 * 
 * Inspired by Handy (https://github.com/cjpais/Handy):
 * 1. Stutter & Whisper Repetition Collapser: collapses 3+ consecutive word repetitions and phrase loops.
 * 2. Two-Tiered Filler Word Removal with Sentence Capital Debt & Punctuation Preservation.
 * 3. Phonetic (Soundex) + Levenshtein Custom Word / Dictionary Correction with N-gram matching (1-3 words).
 * 4. Punctuation boundary & Case Pattern Preservation.
 */

// Universal fillers safe across languages
const UNIVERSAL_FILLER_WORDS = [
  'uh', 'uhm', 'umm', 'uhh', 'uhhh', 'ehh', 'ehm', 'ahm', 'hmm', 'hm', 'mmm'
];

// Language-gated fillers
const GATED_FILLER_WORDS = {
  en: ['um', 'ah', 'eh'],
  de: ['äh', 'ähm'],
  fr: ['euh'],
  es: ['este', 'eh']
};

/**
 * Soundex phonetic representation (American Soundex).
 */
function soundex(word) {
  if (!word || typeof word !== 'string') return '';
  const clean = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!clean.length) return '';

  const table = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };

  const first = clean[0];
  let code = first;
  let prev = table[first] || '0';

  for (let i = 1; i < clean.length; i++) {
    const char = clean[i];
    const curr = table[char] || '0';
    if (curr !== '0' && curr !== prev) {
      code += curr;
      prev = curr;
      if (code.length === 4) break;
    } else if (curr === '0') {
      prev = '0';
    }
  }

  while (code.length < 4) code += '0';
  return code;
}

/**
 * Normalized Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }

  return v1[b.length];
}

/**
 * Collapses 3+ consecutive identical word or multi-word phrase repetitions (Whisper hallucination loops / stutters).
 * E.g. "wh wh wh wh" -> "wh", "thank you thank you thank you" -> "thank you"
 */
function collapseStutters(text) {
  if (!text || typeof text !== 'string') return '';
  let words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  // 1. Multi-word phrase repetition collapse (phrases of 2 to 3 words repeated 3+ times)
  for (let phraseLen = 3; phraseLen >= 2; phraseLen--) {
    let collapsedWords = [];
    let i = 0;
    while (i < words.length) {
      if (i + phraseLen <= words.length) {
        const phrase = words.slice(i, i + phraseLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
        let count = 1;
        while (i + (count + 1) * phraseLen <= words.length) {
          const nextPhrase = words.slice(i + count * phraseLen, i + (count + 1) * phraseLen).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
          if (nextPhrase === phrase && phrase.length > 0) count++;
          else break;
        }

        if (count >= 3) {
          const chosen = [...words.slice(i, i + phraseLen)];
          const lastSeqWord = words[i + count * phraseLen - 1];
          const lastMatch = lastSeqWord.match(/[^a-zA-Z0-9]+$/);
          if (lastMatch && !chosen[chosen.length - 1].endsWith(lastMatch[0])) {
            chosen[chosen.length - 1] += lastMatch[0];
          }
          collapsedWords.push(...chosen);
          i += count * phraseLen;
          continue;
        }
      }
      collapsedWords.push(words[i]);
      i++;
    }
    words = collapsedWords;
  }

  // 2. Single-word repetition collapse (3+ identical consecutive words)
  const result = [];
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (clean.length > 0 && /^[a-z0-9]+$/i.test(clean)) {
      let count = 1;
      while (i + count < words.length) {
        const nextClean = words[i + count].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (nextClean === clean) count++;
        else break;
      }

      if (count >= 3) {
        const lastSeqWord = words[i + count - 1];
        const lastMatch = lastSeqWord.match(/[^a-zA-Z0-9]+$/);
        let finalWord = word;
        if (lastMatch && !finalWord.endsWith(lastMatch[0])) {
          finalWord += lastMatch[0];
        }
        result.push(finalWord);
        i += count;
      } else {
        result.push(word);
        i++;
      }
    } else {
      result.push(word);
      i++;
    }
  }

  return result.join(' ');
}

/**
 * Extracts leading/trailing punctuation and core alphanumeric word.
 */
function extractPunctuation(word) {
  const match = String(word || '').match(/^([^a-zA-Z0-9]*)(.*?)([^a-zA-Z0-9]*)$/);
  if (!match) return { prefix: '', core: word, suffix: '' };
  return { prefix: match[1] || '', core: match[2] || '', suffix: match[3] || '' };
}

/**
 * Preserves capitalization pattern from original to replacement.
 */
function preserveCasePattern(original, replacement) {
  if (!original || !replacement) return replacement;
  const cleanOriginal = original.replace(/[^a-zA-Z]/g, '');
  if (!cleanOriginal) return replacement;

  if (cleanOriginal === cleanOriginal.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (cleanOriginal[0] === cleanOriginal[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Removes filler words with sentence capital debt & punctuation transfer.
 */
function removeFillerWords(text, { language = 'en', enabled = true, customFillers = null } = {}) {
  if (!enabled || !text) return text || '';

  const fillers = new Set();
  if (Array.isArray(customFillers) && customFillers.length > 0) {
    for (const f of customFillers) fillers.add(f.toLowerCase().trim());
  } else {
    for (const f of UNIVERSAL_FILLER_WORDS) fillers.add(f);
    const langKey = language.split(/[-_]/)[0].toLowerCase();
    const gated = GATED_FILLER_WORDS[langKey] || [];
    for (const f of gated) fillers.add(f);
  }

  const words = text.split(/\s+/).filter(Boolean);
  const kept = [];
  let capitalOwed = false;
  let sentenceStart = true;
  let pendingPunctuation = '';

  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const { prefix, core, suffix } = extractPunctuation(raw);
    const lower = core.toLowerCase();

    if (fillers.has(lower)) {
      if (sentenceStart || (core.length > 0 && core[0] === core[0].toUpperCase())) {
        capitalOwed = true;
      }
      // If filler had end punctuation like '?' or '!', save it to attach to previous word
      if (suffix.includes('?') || suffix.includes('!') || suffix.includes('.')) {
        pendingPunctuation = suffix.replace(/,/g, '');
      }
      continue;
    }

    let formattedCore = core;
    if (capitalOwed && formattedCore.length > 0) {
      formattedCore = formattedCore[0].toUpperCase() + formattedCore.slice(1);
      capitalOwed = false;
    }

    kept.push(`${prefix}${formattedCore}${suffix}`);
    sentenceStart = suffix.includes('.') || suffix.includes('!') || suffix.includes('?');
  }

  // If a trailing filler had sentence punctuation (e.g. "go now, hmm?"), attach '?' to last kept word
  if (pendingPunctuation && kept.length > 0) {
    let last = kept[kept.length - 1];
    // Strip trailing comma from last word if any
    last = last.replace(/,+$/, '');
    kept[kept.length - 1] = `${last}${pendingPunctuation}`;
  }

  let result = kept.join(' ');
  // Clean up comma artifacts like "think, ," or ", word"
  result = result.replace(/,\s*,/g, ',').replace(/\s+,\s*/g, ', ').replace(/,\s*([.?!])/g, '$1').trim();
  return result;
}

/**
 * Builds normalized match key for words (alphanumeric lowercase).
 */
function buildMatchKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Applies custom dictionary corrections using phonetic (Soundex) + Levenshtein + N-grams.
 */
function applyCustomWords(text, customWords = [], threshold = 0.20) {
  if (!text || !Array.isArray(customWords) || !customWords.length) {
    return text || '';
  }

  // Pre-index custom words with match keys and Soundex codes
  const dict = customWords.map(word => {
    const key = buildMatchKey(word);
    return {
      word,
      key,
      soundex: soundex(key),
      len: key.length
    };
  }).filter(entry => entry.key.length > 0);

  const words = text.split(/\s+/).filter(Boolean);
  const result = [];
  let i = 0;

  while (i < words.length) {
    let bestMatch = null;
    let bestN = 1;
    let bestScore = Infinity;

    // Evaluate N-grams from 3 down to 1
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const slice = words.slice(i, i + n);
      const combined = slice.map(w => buildMatchKey(w)).join('');
      if (!combined.length) continue;

      const candSoundex = soundex(combined);
      const candLen = combined.length;

      for (const entry of dict) {
        const lenDiff = Math.abs(candLen - entry.len);
        const maxLen = Math.max(candLen, entry.len);

        // Handy max 25% length difference check: prevents short words (e.g. "open")
        // from matching longer dictionary words ("OpenAI")
        if (maxLen > 0 && (lenDiff / maxLen) > 0.25) continue;

        const lev = levenshtein(combined, entry.key);
        const levScore = maxLen > 0 ? lev / maxLen : 1.0;
        const phoneticMatch = (candSoundex && entry.soundex && candSoundex === entry.soundex);
        const combinedScore = phoneticMatch ? levScore * 0.3 : levScore;

        if (combinedScore < threshold && combinedScore < bestScore) {
          bestScore = combinedScore;
          bestMatch = entry.word;
          bestN = n;
        }
      }
    }

    if (bestMatch) {
      const firstWord = words[i];
      const lastWord = words[i + bestN - 1];
      const { prefix } = extractPunctuation(firstWord);
      const { suffix } = extractPunctuation(lastWord);
      const cased = preserveCasePattern(firstWord, bestMatch);

      result.push(`${prefix}${cased}${suffix}`);
      i += bestN;
    } else {
      result.push(words[i]);
      i++;
    }
  }

  return result.join(' ');
}

/**
 * Complete Speech-to-Text Post-Processing Pipeline.
 */
function cleanTranscription(text, options = {}) {
  if (!text) return '';

  // 1. Strip raw transcription artifacts / timestamps / bracketed notes
  let cleaned = String(text)
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\b(WEBVTT|Kind: captions|Language: \w+)\b/gi, ' ')
    .trim();

  // 2. Collapse Stutters & Repetition Loops (3+ repeated words or phrases)
  cleaned = collapseStutters(cleaned);

  // 3. Remove Filler Words with Capitalization & Punctuation Restoration
  cleaned = removeFillerWords(cleaned, {
    language: options.language || 'en',
    enabled: options.removeFillers !== false,
    customFillers: options.customFillers || null
  });

  // 4. Apply Phonetic & Levenshtein Custom Vocabulary Replacement
  const customWords = options.customWords || [
    'Mave', 'Bigfoot', 'ChatGPT', 'OpenAI', 'Anthropic', 'Claude', 'GitHub', 'VS Code',
    'Spotify', 'Chrome', 'PowerShell', 'Terminal', 'YouTube', 'Discord'
  ];
  if (options.additionalWords && Array.isArray(options.additionalWords)) {
    customWords.push(...options.additionalWords);
  }
  cleaned = applyCustomWords(cleaned, customWords, options.threshold || 0.20);

  // 5. Normalize whitespace and trailing spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

module.exports = {
  soundex,
  levenshtein,
  collapseStutters,
  removeFillerWords,
  extractPunctuation,
  preserveCasePattern,
  applyCustomWords,
  cleanTranscription
};
