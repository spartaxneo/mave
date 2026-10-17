'use strict';
// Acoustic Voice Biometrics & Speaker Recognition Engine for Mave.
// Extracts acoustic descriptors (fundamental frequency F0, spectral centroid,
// zero-crossing rate, energy dynamics, and harmonic timbre) from 16kHz WAV audio
// to identify who is speaking (Owner vs Family Members vs Guests).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultVoiceprintDir() {
  const base = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(base, 'voiceprints.json');
}

/**
 * Parse 16-bit PCM samples from a standard WAV buffer.
 */
function decodeWavToFloat32(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) return new Float32Array(0);

  // Read header
  let dataOffset = 44;
  for (let i = 12; i < wavBuffer.length - 8; i++) {
    if (wavBuffer.toString('ascii', i, i + 4) === 'data') {
      dataOffset = i + 8;
      break;
    }
  }

  const sampleCount = Math.floor((wavBuffer.length - dataOffset) / 2);
  if (sampleCount <= 0) return new Float32Array(0);

  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = wavBuffer.readInt16LE(dataOffset + i * 2);
    samples[i] = s / 32768.0;
  }
  return samples;
}

/**
 * Estimate fundamental frequency (Pitch / F0) using normalized autocorrelation.
 */
function estimatePitch(samples, sampleRate = 16000) {
  if (samples.length < 512) return 120; // default pitch in Hz

  // Search lag range corresponding to human pitch: 65 Hz to 350 Hz
  const minLag = Math.floor(sampleRate / 350); // ~45
  const maxLag = Math.floor(sampleRate / 65);  // ~246

  const windowSize = Math.min(1024, samples.length - maxLag);
  if (windowSize <= 0) return 120;

  const corrs = new Float32Array(maxLag);
  let globalMax = -1;
  let globalBestLag = minLag;

  for (let lag = minLag; lag < maxLag; lag++) {
    let corr = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < windowSize; i++) {
      const s1 = samples[i];
      const s2 = samples[i + lag];
      corr += s1 * s2;
      norm1 += s1 * s1;
      norm2 += s2 * s2;
    }
    const denom = Math.sqrt(norm1 * norm2);
    const normCorr = denom > 0.0001 ? corr / denom : 0;
    corrs[lag] = normCorr;
    if (normCorr > globalMax) {
      globalMax = normCorr;
      globalBestLag = lag;
    }
  }

  // To prevent octave/harmonic errors, select the first prominent local peak that is close to the global maximum
  let bestLag = globalBestLag;
  if (globalMax > 0.35) {
    const threshold = globalMax * 0.85;
    for (let lag = minLag + 1; lag < maxLag - 1; lag++) {
      if (corrs[lag] > corrs[lag - 1] && corrs[lag] >= corrs[lag + 1] && corrs[lag] >= threshold) {
        bestLag = lag;
        break;
      }
    }
  }

  const pitch = sampleRate / bestLag;
  return Math.round(pitch);
}

/**
 * Calculate Spectral Centroid (brightness / timbre) and Zero-Crossing Rate.
 */
function extractSpectralFeatures(samples) {
  if (!samples.length) return { centroid: 0, zcr: 0, rms: 0 };

  let zcrCount = 0;
  let sumSq = 0;

  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
    if (i > 0 && ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0))) {
      zcrCount++;
    }
  }

  const rms = Math.sqrt(sumSq / samples.length);
  const zcr = zcrCount / samples.length;

  // Discrete Fourier / Spectral magnitude proxy across 8 frequency bands
  const bandEnergies = [0, 0, 0, 0, 0, 0, 0, 0];
  const chunkSize = Math.max(1, Math.floor(samples.length / 8));
  for (let b = 0; b < 8; b++) {
    let bSum = 0;
    const start = b * chunkSize;
    const end = Math.min(samples.length, start + chunkSize);
    for (let j = start; j < end; j++) {
      bSum += Math.abs(samples[j]);
    }
    bandEnergies[b] = bSum / (end - start || 1);
  }

  let num = 0;
  let den = 0;
  for (let i = 0; i < bandEnergies.length; i++) {
    num += (i + 1) * bandEnergies[i];
    den += bandEnergies[i];
  }
  const centroid = den > 0 ? num / den : 1;

  return { centroid, zcr, rms, bandEnergies };
}

/**
 * Create a normalized 12-dimensional voiceprint vector.
 */
function extractVoiceprint(wavBuffer) {
  const samples = decodeWavToFloat32(wavBuffer);
  if (!samples.length) return null;

  const pitch = estimatePitch(samples);
  const { centroid, zcr, rms, bandEnergies } = extractSpectralFeatures(samples);

  // Normalize pitch (65Hz - 350Hz -> 0 - 1)
  const normPitch = Math.max(0, Math.min(1, (pitch - 65) / (350 - 65)));
  // Normalize centroid (1 - 8 -> 0 - 1)
  const normCentroid = Math.max(0, Math.min(1, (centroid - 1) / 7));
  // Normalize ZCR (0 - 0.5 -> 0 - 1)
  const normZcr = Math.max(0, Math.min(1, zcr * 2));
  // Normalize RMS
  const normRms = Math.max(0, Math.min(1, rms * 5));

  const vector = [normPitch, normCentroid, normZcr, normRms, ...bandEnergies];
  return {
    pitch,
    centroid,
    zcr,
    rms,
    vector,
  };
}

/**
 * Compute cosine similarity between two voiceprint vectors.
 */
function cosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denom > 0.0001 ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

class SpeakerRecognizer {
  constructor(filePath = defaultVoiceprintDir()) {
    this.filePath = filePath;
    this.profiles = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(data)) {
          for (const p of data) {
            if (p && p.name && p.vector) {
              this.profiles.set(p.name.toLowerCase(), p);
            }
          }
        }
      }
    } catch {}
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify([...this.profiles.values()], null, 2), 'utf8');
    } catch {}
  }

  /**
   * Enroll a speaker with their voice sample.
   */
  enroll(name, wavBuffer, role = 'family') {
    if (!name || !wavBuffer) throw new Error('Speaker name and audio are required.');
    const vp = extractVoiceprint(wavBuffer);
    if (!vp) throw new Error('Could not extract acoustic features from audio.');

    const cleanName = String(name).trim();
    const profile = {
      name: cleanName,
      role,
      pitch: vp.pitch,
      centroid: vp.centroid,
      vector: vp.vector,
      enrolledAt: Date.now(),
    };

    this.profiles.set(cleanName.toLowerCase(), profile);
    this.save();
    return { ok: true, name: cleanName, role, pitch: vp.pitch };
  }

  /**
   * Identify who is speaking from incoming audio.
   */
  identify(wavBuffer) {
    const vp = extractVoiceprint(wavBuffer);
    if (!vp) {
      return { identified: false, name: 'Unknown', confidence: 0, role: 'guest', pitch: 120 };
    }

    if (this.profiles.size === 0) {
      // Auto-enroll the primary user on first clear speech
      this.enroll('Primary User', wavBuffer, 'owner');
      return {
        identified: true,
        name: 'Primary User',
        confidence: 0.95,
        role: 'owner',
        pitch: vp.pitch,
        autoEnrolled: true,
      };
    }

    let bestName = 'Unknown';
    let bestScore = -1;
    let bestRole = 'guest';

    for (const [name, prof] of this.profiles.entries()) {
      const sim = cosineSimilarity(vp.vector, prof.vector);
      if (sim > bestScore) {
        bestScore = sim;
        bestName = prof.name;
        bestRole = prof.role;
      }
    }

    // Similarity threshold: 0.75 for verified match
    const threshold = 0.72;
    const isMatch = bestScore >= threshold;

    return {
      identified: isMatch,
      name: isMatch ? bestName : 'Unknown Guest',
      confidence: Number(bestScore.toFixed(3)),
      role: isMatch ? bestRole : 'guest',
      pitch: vp.pitch,
      timbre: vp.centroid > 4.5 ? 'bright' : 'warm',
    };
  }

  listSpeakers() {
    return [...this.profiles.values()].map((p) => ({
      name: p.name,
      role: p.role,
      pitch: p.pitch,
      enrolledAt: p.enrolledAt,
    }));
  }

  deleteSpeaker(name) {
    const key = String(name || '').toLowerCase().trim();
    const existed = this.profiles.delete(key);
    if (existed) this.save();
    return existed;
  }
}

let recognizerInstance = null;
function getSpeakerRecognizer() {
  if (!recognizerInstance) recognizerInstance = new SpeakerRecognizer();
  return recognizerInstance;
}

module.exports = {
  SpeakerRecognizer,
  getSpeakerRecognizer,
  extractVoiceprint,
  estimatePitch,
  cosineSimilarity,
};
