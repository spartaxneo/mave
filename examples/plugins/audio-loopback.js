'use strict';
// Example plugin: Listen to and capture system audio playback directly on Windows.
// Copy this file to %APPDATA%\Bigfoot\plugins\ to try it as a user plugin.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { recordSystemAudio, isLoopbackAvailable } = require('../../src/main/loopback');

module.exports = [
  {
    name: 'system_sound_check',
    description: 'Check if desktop audio output is active and capture a 3-second audio preview of what is playing on the computer.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      const status = isLoopbackAvailable();
      if (!status.available && status.reason && !status.reason.includes('0x80070490')) {
        return `System audio loopback is unavailable: ${status.reason}`;
      }

      ctx.log('info', 'Sampling 3 seconds of desktop sound...');
      try {
        const recording = await recordSystemAudio({ durationSeconds: 3, signal: ctx.signal });
        return `Desktop audio captured successfully: ${recording.duration}s (${recording.frames} samples, 16kHz mono).`;
      } catch (err) {
        return `System sound capture check: ${err.message}`;
      }
    },
  },
];
