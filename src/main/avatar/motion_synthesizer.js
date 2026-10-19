'use strict';

/**
 * Procedural Facial Motion & Head Pose Synthesizer
 * 
 * Inspired by suifeng9203/HeyGem.ai & Duix-Avatar:
 * Synthesizes realistic non-verbal digital human micro-expressions, 3D head tilts,
 * natural eye blinks, and subtle breathing motion.
 */

class MotionSynthesizer {
  constructor({ logger = null } = {}) {
    this.logger = logger;
  }

  /**
   * Generates a frame-by-frame procedural motion sequence.
   */
  generateMotionTimeline({ durationSec = 5.0, fps = 30, isQuestion = false }) {
    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    const frames = [];

    // Randomized blink intervals: blink roughly every 3.5 seconds
    const blinkFrames = new Set();
    const blinkIntervalFrames = Math.round(3.5 * fps);
    let nextBlink = Math.round((Math.random() * 0.5 + 1.5) * fps);

    while (nextBlink < totalFrames) {
      // Blink lasts ~4 frames (approx 130-150ms at 30fps)
      for (let b = 0; b < 4; b++) {
        if (nextBlink + b < totalFrames) {
          blinkFrames.add(nextBlink + b);
        }
      }
      nextBlink += blinkIntervalFrames + Math.round((Math.random() - 0.5) * fps);
    }

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;

      // 1. Subtle natural head motion (Harmonic drift)
      // Yaw: horizontal gentle sway (+- 2.2 degrees)
      const yawDeg = Math.round((Math.sin(t * 0.8) * 1.8 + Math.sin(t * 1.6) * 0.4) * 10) / 10;
      // Pitch: vertical nod motion (+- 1.5 degrees, slight dip when speaking)
      const pitchDeg = Math.round((Math.cos(t * 1.1) * 1.2 + Math.sin(t * 2.2) * 0.3) * 10) / 10;
      // Roll: subtle head canting (+- 1.0 degree)
      const rollDeg = Math.round((Math.sin(t * 0.6) * 0.9) * 10) / 10;

      // 2. Eye Blink: 0.0 is wide open, 1.0 is closed
      let blink = 0.0;
      if (blinkFrames.has(f)) {
        // Find position in blink burst
        blink = 0.95;
      }

      // 3. Eyebrow expression: slight raise if question or emphasis
      let eyebrow = 0.0;
      if (isQuestion && t > durationSec * 0.6) {
        eyebrow = 0.25; // Raised towards end of question
      }

      // 4. Subtle respiratory chest/shoulder breathing oscillation (0.25 Hz = 15 breaths/min)
      const breath = Math.round(Math.sin(t * 2 * Math.PI * 0.25) * 100) / 100;

      frames.push({
        frame: f + 1,
        timeSec: Math.round(t * 1000) / 1000,
        headPose: {
          yawDeg,
          pitchDeg,
          rollDeg
        },
        blink,
        eyebrow,
        breath
      });
    }

    return {
      fps,
      totalFrames,
      durationSec,
      frames
    };
  }
}

let defaultMotionSynthesizer = null;
function getMotionSynthesizer() {
  if (!defaultMotionSynthesizer) {
    defaultMotionSynthesizer = new MotionSynthesizer();
  }
  return defaultMotionSynthesizer;
}

module.exports = {
  MotionSynthesizer,
  getMotionSynthesizer
};
