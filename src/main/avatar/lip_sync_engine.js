'use strict';

/**
 * Digital Human Acoustic Lip-Sync & Coarticulation Engine
 * 
 * Inspired by suifeng9203/HeyGem.ai & Duix-Avatar:
 * Performs audio/phonetic analysis, viseme decomposition, and smooth coarticulation
 * transitions for realistic digital human avatar mouth motion.
 */

// Standard MPEG-4 / Facial Action Coding System (FACS) Viseme Categories
const VISEMES = {
  SILENCE: 'silence',      // Mouth at rest
  AA: 'aa',                // Wide open jaw: /a/, /ɑ/, /æ/ (car, hat, father)
  OH: 'oh',                // Rounded open lips: /oʊ/, /ɔ/, /u/ (go, thought, boot)
  EE: 'ee',                // Wide spread smile: /i/, /ɪ/, /eɪ/ (see, bit, day)
  FV: 'fv',                // Lower lip tucked under upper teeth: /f/, /v/ (fine, voice)
  TH: 'th',                // Tongue between teeth: /θ/, /ð/ (think, this)
  BMP: 'bmp',              // Lips fully closed: /b/, /m/, /p/ (boy, man, pen)
  W: 'w',                  // Tight forward pucker: /w/, /ʊ/ (win, good)
  L: 'l'                   // Tongue tip against upper alveolar ridge: /l/ (light)
};

// Viseme geometry shapes: openness (0-1) and width (0-1, 0.5 is neutral)
const VISEME_GEOMETRIES = {
  [VISEMES.SILENCE]: { openness: 0.05, width: 0.50, teethVisible: 0.0 },
  [VISEMES.AA]:      { openness: 0.85, width: 0.60, teethVisible: 0.6 },
  [VISEMES.OH]:      { openness: 0.70, width: 0.35, teethVisible: 0.3 },
  [VISEMES.EE]:      { openness: 0.45, width: 0.85, teethVisible: 0.8 },
  [VISEMES.FV]:      { openness: 0.20, width: 0.55, teethVisible: 0.4 },
  [VISEMES.TH]:      { openness: 0.30, width: 0.58, teethVisible: 0.5 },
  [VISEMES.BMP]:     { openness: 0.00, width: 0.52, teethVisible: 0.0 },
  [VISEMES.W]:       { openness: 0.35, width: 0.28, teethVisible: 0.1 },
  [VISEMES.L]:       { openness: 0.40, width: 0.60, teethVisible: 0.5 }
};

class LipSyncEngine {
  constructor({ logger = null } = {}) {
    this.logger = logger;
  }

  /**
   * Estimates rough phoneme sequence from text token.
   */
  wordToVisemes(word) {
    const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return [VISEMES.SILENCE];

    const visemes = [];
    let i = 0;

    while (i < w.length) {
      const ch = w[i];
      const next = w[i + 1] || '';
      const pair = ch + next;

      if (pair === 'th') {
        visemes.push(VISEMES.TH);
        i += 2;
      } else if (pair === 'ee' || pair === 'ea' || ch === 'i') {
        visemes.push(VISEMES.EE);
        i += (pair === 'ee' || pair === 'ea') ? 2 : 1;
      } else if (pair === 'oo' || ch === 'u' || ch === 'o') {
        visemes.push(VISEMES.OH);
        i += (pair === 'oo') ? 2 : 1;
      } else if (ch === 'a') {
        visemes.push(VISEMES.AA);
        i += 1;
      } else if (ch === 'f' || ch === 'v' || pair === 'ph') {
        visemes.push(VISEMES.FV);
        i += (pair === 'ph') ? 2 : 1;
      } else if (ch === 'b' || ch === 'm' || ch === 'p') {
        visemes.push(VISEMES.BMP);
        i += 1;
      } else if (ch === 'w') {
        visemes.push(VISEMES.W);
        i += 1;
      } else if (ch === 'l') {
        visemes.push(VISEMES.L);
        i += 1;
      } else {
        // Default vowel/consonant neutral mapping
        visemes.push(VISEMES.EE);
        i += 1;
      }
    }

    return visemes.length > 0 ? visemes : [VISEMES.SILENCE];
  }

  /**
   * Generates a time-coded viseme timeline with coarticulation interpolation.
   */
  generateVisemeTimeline({ text, durationSec = null }) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return {
        totalDurationSec: 1.0,
        keyframes: [
          { timeSec: 0.0, viseme: VISEMES.SILENCE, openness: 0.05, width: 0.5 }
        ]
      };
    }

    const words = cleanText.split(/\s+/);
    // Estimate ~140 words per minute (approx 2.3 words per second)
    const estimatedDuration = durationSec || Math.max(1.5, Math.round((words.length / 2.3) * 10) / 10);
    const timePerWord = estimatedDuration / words.length;

    const rawKeyframes = [];
    let currentTime = 0.0;

    // Initial rest frame
    rawKeyframes.push({
      timeSec: 0.0,
      viseme: VISEMES.SILENCE,
      word: '',
      ...VISEME_GEOMETRIES[VISEMES.SILENCE]
    });

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const word = words[wIdx];
      const wordVisemes = this.wordToVisemes(word);
      const timePerViseme = (timePerWord * 0.85) / wordVisemes.length;

      for (let vIdx = 0; vIdx < wordVisemes.length; vIdx++) {
        const v = wordVisemes[vIdx];
        const geom = VISEME_GEOMETRIES[v] || VISEME_GEOMETRIES[VISEMES.SILENCE];

        rawKeyframes.push({
          timeSec: Math.round(currentTime * 1000) / 1000,
          viseme: v,
          word,
          openness: geom.openness,
          width: geom.width,
          teethVisible: geom.teethVisible
        });

        currentTime += timePerViseme;
      }

      // Small natural inter-word boundary
      currentTime += timePerWord * 0.15;
    }

    // Closing rest frame
    rawKeyframes.push({
      timeSec: Math.round(estimatedDuration * 1000) / 1000,
      viseme: VISEMES.SILENCE,
      word: '',
      ...VISEME_GEOMETRIES[VISEMES.SILENCE]
    });

    // Apply Coarticulation Smoothing:
    // Blend adjacent mouth shapes over time so transitions are organic
    const smoothedKeyframes = this.applyCoarticulation(rawKeyframes);

    return {
      text: cleanText,
      totalDurationSec: estimatedDuration,
      wordCount: words.length,
      keyframeCount: smoothedKeyframes.length,
      keyframes: smoothedKeyframes
    };
  }

  /**
   * Applies smooth temporal coarticulation across keyframes.
   */
  applyCoarticulation(keyframes) {
    if (keyframes.length <= 2) return keyframes;

    return keyframes.map((kf, i, arr) => {
      if (i === 0 || i === arr.length - 1) return kf;

      const prev = arr[i - 1];
      const next = arr[i + 1];

      // Smooth weighted 3-point Gaussian kernel (0.25 prev + 0.50 current + 0.25 next)
      const blendedOpenness = Math.round((prev.openness * 0.20 + kf.openness * 0.60 + next.openness * 0.20) * 100) / 100;
      const blendedWidth = Math.round((prev.width * 0.15 + kf.width * 0.70 + next.width * 0.15) * 100) / 100;

      return {
        ...kf,
        openness: blendedOpenness,
        width: blendedWidth
      };
    });
  }
}

let defaultLipSyncEngine = null;
function getLipSyncEngine() {
  if (!defaultLipSyncEngine) {
    defaultLipSyncEngine = new LipSyncEngine();
  }
  return defaultLipSyncEngine;
}

module.exports = {
  VISEMES,
  VISEME_GEOMETRIES,
  LipSyncEngine,
  getLipSyncEngine
};
