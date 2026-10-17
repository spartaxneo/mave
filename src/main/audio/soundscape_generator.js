'use strict';

/**
 * SoundscapeGenerator - Adaptive Cognitive Neuro-Acoustic Soundscape Synthesizer
 * 
 * Provides:
 * 1. Binaural beat entrainment (Delta, Theta, Alpha, Beta, Gamma)
 * 2. Colored noise spectrums (Brown noise, Pink noise, White noise)
 * 3. Heart-rate biofeedback entrainment to down-regulate stress or stimulate focus
 * 4. Ambient field acoustic layer mixing
 */

class SoundscapeGenerator {
  constructor() {
    this.frequencyBands = {
      DELTA: { minHz: 0.5, maxHz: 4, carrierHz: 100, cognitiveState: 'Deep Restorative Sleep' },
      THETA: { minHz: 4, maxHz: 8, carrierHz: 150, cognitiveState: 'Deep Meditation & Creativity' },
      ALPHA: { minHz: 8, maxHz: 12, carrierHz: 210, cognitiveState: 'Relaxed Alertness & Flow State' },
      BETA: { minHz: 13, maxHz: 30, carrierHz: 260, cognitiveState: 'High-Intensity Coding & Logic' },
      GAMMA: { minHz: 30, maxHz: 50, carrierHz: 320, cognitiveState: 'Peak Cognitive Synthesis' }
    };

    this.ambientTextures = {
      BROWN_NOISE: { slope: '-6dB/octave', description: 'Deep low-end rumble that blocks conversational distraction.' },
      PINK_NOISE: { slope: '-3dB/octave', description: 'Equal energy per octave, ideal for continuous memory consolidation.' },
      WHITE_NOISE: { slope: 'Flat', description: 'Uniform spectral distribution across audible frequencies.' },
      RAIN_COASTAL: { layers: ['Heavy Rain on Skylight', 'Rolling Thunder', 'Distant Surf'] }
    };
  }

  generateSoundscapeProfile({ mode = 'ALPHA', durationMinutes = 45, heartRateBpm = null, ambientLayer = 'BROWN_NOISE' }) {
    const band = this.frequencyBands[mode.toUpperCase()] || this.frequencyBands.ALPHA;
    const targetBeatHz = (band.minHz + band.maxHz) / 2;
    const leftEarHz = band.carrierHz;
    const rightEarHz = Math.round((band.carrierHz + targetBeatHz) * 10) / 10;

    let biofeedbackAdjustment = null;
    if (heartRateBpm && typeof heartRateBpm === 'number') {
      if (heartRateBpm > 95) {
        biofeedbackAdjustment = {
          observedBpm: heartRateBpm,
          recommendation: 'Elevated heart rate detected: Applying theta down-regulation to soothe parasympathetic nervous system.',
          targetEntrainment: 'THETA (6 Hz)'
        };
      } else if (heartRateBpm < 60 && mode.toUpperCase() === 'BETA') {
        biofeedbackAdjustment = {
          observedBpm: heartRateBpm,
          recommendation: 'Low resting pulse: Gentle beta entrainment (16 Hz) to accelerate alertness.',
          targetEntrainment: 'BETA (16 Hz)'
        };
      }
    }

    const texture = this.ambientTextures[ambientLayer.toUpperCase()] || this.ambientTextures.BROWN_NOISE;

    return {
      mode: mode.toUpperCase(),
      cognitiveTarget: band.cognitiveState,
      durationMinutes,
      frequencies: {
        carrierFrequencyHz: band.carrierHz,
        binauralBeatHz: targetBeatHz,
        leftChannelHz: leftEarHz,
        rightChannelHz: rightEarHz
      },
      acousticLayer: {
        textureName: ambientLayer.toUpperCase(),
        spectralSlope: texture.slope || 'Multi-layered',
        description: texture.description || 'Natural ambient layers'
      },
      biofeedbackAdjustment,
      headphoneRequirement: 'Stereo headphones required for true binaural phase differential entrainment.'
    };
  }
}

let _soundscapeGen = null;
function getSoundscapeGenerator() {
  if (!_soundscapeGen) {
    _soundscapeGen = new SoundscapeGenerator();
  }
  return _soundscapeGen;
}

module.exports = { SoundscapeGenerator, getSoundscapeGenerator };
