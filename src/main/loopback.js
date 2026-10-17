'use strict';
// Windows WASAPI system audio loopback capture engine.
// Uses loopback-capture (N-API) to capture system playback audio, downsamples
// 48 kHz stereo to 16 kHz mono, and formats standard RIFF WAV files for local Whisper.

const fs = require('fs');
const path = require('path');

let LoopbackCapture = null;
try {
  ({ LoopbackCapture } = require('loopback-capture'));
} catch {
  // Gracefully degrade when native module is missing
}

/**
 * Build a 44-byte RIFF/WAVE header for linear PCM.
 */
function pcmToWav(pcmBuffer, { sampleRate = 16000, channels = 1, bitsPerSample = 16 } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0); // ChunkID
  header.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  header.write('WAVE', 8); // Format
  header.write('fmt ', 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write('data', 36); // Subchunk2ID
  header.writeUInt32LE(dataSize, 40); // Subchunk2Size

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Resample 48 kHz 16-bit stereo PCM to 16 kHz 16-bit mono PCM.
 * Ratio is exactly 3:1 (48000 / 16000 = 3).
 * Input: 4 bytes per frame (2 bytes L, 2 bytes R).
 * Output: 2 bytes per frame (16-bit mono).
 */
function resampleStereo48kToMono16k(srcBuffer) {
  const srcFrames = Math.floor(srcBuffer.length / 4);
  const outFrames = Math.floor(srcFrames / 3);
  const outBuffer = Buffer.alloc(outFrames * 2);

  for (let i = 0; i < outFrames; i++) {
    // Average 3 consecutive stereo frames for anti-aliasing filter
    let sum = 0;
    for (let step = 0; step < 3; step++) {
      const offset = (i * 3 + step) * 4;
      const left = srcBuffer.readInt16LE(offset);
      const right = srcBuffer.readInt16LE(offset + 2);
      sum += (left + right) / 2;
    }
    const sample = Math.max(-32768, Math.min(32767, Math.round(sum / 3)));
    outBuffer.writeInt16LE(sample, i * 2);
  }

  return outBuffer;
}

/**
 * Check if loopback capture is supported and an audio playback endpoint is active.
 */
function isLoopbackAvailable() {
  if (!LoopbackCapture) return { available: false, reason: 'loopback-capture native module not installed' };
  try {
    const test = new LoopbackCapture();
    return { available: true };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

/**
 * Record internal system audio from the default playback device.
 * @param {object} options
 *   durationSeconds  number of seconds to record (default 6, max 60)
 *   signal           optional AbortSignal to cancel recording early
 *   processId        optional PID to record specific application only
 *   onChunk          optional callback for streaming PCM chunks
 * @returns {Promise<{ wav: Buffer, pcm: Buffer, duration: number, frames: number }>}
 */
function recordSystemAudio({ durationSeconds = 6, signal = null, processId = null, onChunk = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!LoopbackCapture) {
      return reject(new Error('Audio loopback capture is not supported: native module loopback-capture is not installed.'));
    }

    const duration = Math.min(Math.max(Number(durationSeconds) || 6, 1), 60);
    const chunks = [];
    let capture = null;
    let timer = null;
    let stopped = false;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      if (capture) {
        try { capture.stop(); } catch { /* ignore */ }
        capture = null;
      }
    };

    if (signal) {
      if (signal.aborted) return reject(new Error('Audio capture aborted'));
      signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Audio capture stopped by user'));
      }, { once: true });
    }

    try {
      capture = new LoopbackCapture();
      const handleData = (chunk) => {
        if (stopped || !chunk || !chunk.length) return;
        chunks.push(chunk);
        if (onChunk) onChunk(chunk);
      };

      if (processId && Number.isInteger(processId)) {
        capture.start(processId, true, handleData);
      } else {
        capture.startSystemAudio(handleData);
      }
    } catch (err) {
      cleanup();
      // Handle HRESULT 0x80070490 (Element not found - no active audio playback device)
      if (String(err.message).includes('0x80070490') || String(err.message).includes('not found')) {
        return reject(new Error('No active default audio playback device found. Ensure your speakers or headphones are enabled and plugged in.'));
      }
      return reject(new Error(`Failed to initialize system audio capture: ${err.message}`));
    }

    timer = setTimeout(() => {
      cleanup();
      const rawStereo = Buffer.concat(chunks);
      const mono16k = resampleStereo48kToMono16k(rawStereo);
      const wav = pcmToWav(mono16k, { sampleRate: 16000, channels: 1, bitsPerSample: 16 });
      resolve({
        wav,
        pcm: mono16k,
        duration: Math.round((mono16k.length / (16000 * 2)) * 10) / 10,
        frames: mono16k.length / 2,
      });
    }, duration * 1000);
  });
}

module.exports = {
  pcmToWav,
  resampleStereo48kToMono16k,
  isLoopbackAvailable,
  recordSystemAudio,
};
