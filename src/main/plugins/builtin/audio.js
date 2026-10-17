'use strict';
// System audio capture and offline transcription plugin.
// Captures internal PC audio (meetings, videos, browser audio) via WASAPI loopback
// and transcribes it using Bigfoot's bundled whisper.cpp.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { recordSystemAudio, isLoopbackAvailable } = require('../../loopback');
const { SpeechService, speechPaths } = require('../../local/speech');

function getSpeechService(ctx) {
  if (global.__bigfootSpeech) return global.__bigfootSpeech;
  if (ctx && ctx.speech) return ctx.speech;
  if (speechPaths()) {
    const s = new SpeechService();
    global.__bigfootSpeech = s;
    return s;
  }
  return null;
}

module.exports = [
  {
    name: 'listen_system_audio',
    description: 'Listen to the internal desktop audio currently playing through your computer speakers or headphones (such as a meeting in Zoom/Teams, a YouTube video, music, or game) for a few seconds, and transcribe what was spoken using local speech recognition.',
    input_schema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'How many seconds of system audio to listen to (default 6, range 2 to 30).',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const seconds = Math.min(Math.max(Number(input.seconds) || 6, 2), 30);
      const avail = isLoopbackAvailable();
      if (!avail.available && avail.reason && !avail.reason.includes('0x80070490')) {
        return `System audio capture is unavailable: ${avail.reason}`;
      }

      ctx.log('info', `Listening to system audio playback for ${seconds} seconds...`);

      let recording;
      try {
        recording = await recordSystemAudio({ durationSeconds: seconds, signal: ctx.signal });
      } catch (err) {
        return `Could not capture system audio: ${err.message}`;
      }

      ctx.log('info', `Captured ${recording.duration}s of system audio. Transcribing with local Whisper...`);

      const speech = getSpeechService(ctx);
      if (!speech) {
        return `Captured ${recording.duration}s of internal audio (${Math.round(recording.wav.length / 1024)} KB WAV), but the local speech recognizer is not yet downloaded. Run setup or fetch speech to enable transcription.`;
      }

      try {
        const transcript = await speech.transcribe(recording.wav);
        if (!transcript || !transcript.trim()) {
          return `Listened for ${recording.duration}s to system audio: no recognizable spoken words were heard (the audio may have been music, background sound, or silence).`;
        }
        return `System audio transcript (${recording.duration}s):\n"${transcript}"`;
      } catch (err) {
        return `Captured ${recording.duration}s of system audio, but transcription failed: ${err.message}`;
      }
    },
  },
  {
    name: 'record_system_audio',
    description: 'Record internal audio playing on the computer (what you hear through your speakers or headphones) and save it as a WAV file on disk.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path or filename to save the .wav recording to (e.g. "~/Music/meeting.wav").',
        },
        seconds: {
          type: 'number',
          description: 'How many seconds to record (default 8, max 60).',
        },
      },
      required: ['path'],
    },
    async run(input, ctx) {
      const seconds = Math.min(Math.max(Number(input.seconds) || 8, 1), 60);
      let targetPath = String(input.path || '').trim();
      if (!targetPath) throw new Error('A destination path is required.');

      // Resolve home directory ~
      if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
        targetPath = path.join(os.homedir(), targetPath.slice(2));
      } else if (!path.isAbsolute(targetPath)) {
        targetPath = path.join(os.homedir(), targetPath);
      }
      if (!targetPath.toLowerCase().endsWith('.wav')) targetPath += '.wav';

      await ctx.confirm('change', {
        title: 'Save system audio recording?',
        message: `Record ${seconds}s of PC audio and save to ${path.basename(targetPath)}`,
        detail: targetPath,
        confirm: 'Record and Save',
      });

      ctx.log('info', `Recording ${seconds}s of system audio to ${targetPath}...`);
      const recording = await recordSystemAudio({ durationSeconds: seconds, signal: ctx.signal });

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, recording.wav);

      ctx.log('info', `Saved ${recording.duration}s WAV (${Math.round(recording.wav.length / 1024)} KB) to ${targetPath}`);
      return `Successfully recorded ${recording.duration}s of system audio and saved to ${targetPath}.`;
    },
  },
];
