'use strict';
// Local generative media and procedural synthesis plugin.
// Synthesizes procedural audio waveforms, melodic chords, game sound effects,
// and generates visual animations/media streams directly on the user's PC.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pcmToWav } = require('../../loopback');

// Note names to frequencies (A4 = 440 Hz)
const NOTE_FREQS = {
  'c3': 130.81, 'c#3': 138.59, 'd3': 146.83, 'd#3': 155.56, 'e3': 164.81, 'f3': 174.61, 'f#3': 185.00, 'g3': 196.00, 'g#3': 207.65, 'a3': 220.00, 'a#3': 233.08, 'b3': 246.94,
  'c4': 261.63, 'c#4': 277.18, 'd4': 293.66, 'd#4': 311.13, 'e4': 329.63, 'f4': 349.23, 'f#4': 369.99, 'g4': 392.00, 'g#4': 415.30, 'a4': 440.00, 'a#4': 466.16, 'b4': 493.88,
  'c5': 523.25, 'c#5': 554.37, 'd5': 587.33, 'd#5': 622.25, 'e5': 659.25, 'f5': 698.46, 'f#5': 739.99, 'g5': 783.99, 'g#5': 830.61, 'a5': 880.00, 'a#5': 932.33, 'b5': 987.77,
};

function parseFrequency(val) {
  if (typeof val === 'number') return val;
  const str = String(val || '').toLowerCase().trim();
  if (NOTE_FREQS[str]) return NOTE_FREQS[str];
  const num = parseFloat(str);
  return isNaN(num) ? 440 : num;
}

/**
 * Generate PCM audio samples for a waveform.
 */
function synthesizePcm({
  freqs = [440],
  duration = 1.0,
  waveform = 'sine',
  sampleRate = 44100,
  volume = 0.8,
  attack = 0.05,
  decay = 0.1,
  sustain = 0.8,
  release = 0.2,
  pitchBend = 0,
} = {}) {
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(totalSamples * 2);

  const attackSamples = Math.floor(sampleRate * attack);
  const decaySamples = Math.floor(sampleRate * decay);
  const releaseSamples = Math.floor(sampleRate * release);
  const sustainSamples = Math.max(0, totalSamples - attackSamples - decaySamples - releaseSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // ADSR Envelope
    let env = 0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i < attackSamples + decaySamples) {
      const p = (i - attackSamples) / decaySamples;
      env = 1.0 - p * (1.0 - sustain);
    } else if (i < attackSamples + decaySamples + sustainSamples) {
      env = sustain;
    } else {
      const relIdx = i - (attackSamples + decaySamples + sustainSamples);
      env = sustain * Math.max(0, 1.0 - relIdx / Math.max(1, releaseSamples));
    }

    // Dynamic pitch bend if requested (e.g. laser chirp: frequency decreases over time)
    const bendMultiplier = 1.0 + pitchBend * (1.0 - t / duration);

    // Sum waveform for each constituent frequency
    let sampleVal = 0;
    for (const f of freqs) {
      const currentFreq = f * bendMultiplier;
      const phase = 2 * Math.PI * currentFreq * t;
      let wave = 0;

      switch (waveform) {
        case 'square':
          wave = Math.sin(phase) >= 0 ? 1 : -1;
          break;
        case 'sawtooth':
          wave = 2 * (t * currentFreq - Math.floor(t * currentFreq + 0.5));
          break;
        case 'triangle':
          wave = 2 * Math.abs(2 * (t * currentFreq - Math.floor(t * currentFreq + 0.5))) - 1;
          break;
        case 'noise':
          wave = Math.random() * 2 - 1;
          break;
        case 'sine':
        default:
          wave = Math.sin(phase);
          break;
      }
      sampleVal += wave / freqs.length;
    }

    const finalSample = Math.max(-32768, Math.min(32767, Math.round(sampleVal * env * volume * 32767)));
    buffer.writeInt16LE(finalSample, i * 2);
  }

  return pcmToWav(buffer, { sampleRate, channels: 1, bitsPerSample: 16 });
}

function resolveDest(dest) {
  let target = String(dest || '').trim();
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    target = path.join(os.homedir(), target.slice(2));
  } else if (!path.isAbsolute(target)) {
    target = path.join(os.homedir(), target);
  }
  return target;
}

module.exports = [
  {
    name: 'generate_audio_tone',
    description: 'Generate synthetic audio waves, musical chords, or melodic tones using local mathematical synthesis. Can produce sine, square, sawtooth, triangle, or noise waves, with customizable ADSR envelopes, and save as a playable WAV file.',
    input_schema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of note names (e.g. ["C4", "E4", "G4"] for a major chord) or numeric frequencies (e.g. [440, 880]).',
        },
        waveform: {
          type: 'string',
          enum: ['sine', 'square', 'sawtooth', 'triangle', 'noise'],
          description: 'Type of synthesis waveform (default "sine").',
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds (default 1.5, max 10).',
        },
        save_to: {
          type: 'string',
          description: 'Optional file path to save the generated audio to (e.g. "~/Music/chord.wav").',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const rawNotes = input.notes && input.notes.length ? input.notes : ['C4', 'E4', 'G4'];
      const freqs = rawNotes.map(parseFrequency);
      const waveform = input.waveform || 'sine';
      const duration = Math.min(Math.max(Number(input.duration) || 1.5, 0.1), 10);

      ctx.log('info', `Synthesizing ${waveform} audio tone (${freqs.map(Math.round).join(', ')} Hz, ${duration}s)...`);

      const wavBuffer = synthesizePcm({
        freqs,
        duration,
        waveform,
        sampleRate: 44100,
        volume: 0.8,
      });

      let savePath = input.save_to ? resolveDest(input.save_to) : null;
      if (savePath && !savePath.toLowerCase().endsWith('.wav')) savePath += '.wav';

      if (savePath) {
        await ctx.confirm('change', {
          title: 'Save synthesized audio?',
          message: `Write synthesized audio to ${path.basename(savePath)}`,
          detail: savePath,
          confirm: 'Save Audio',
        });
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, wavBuffer);
        ctx.log('info', `Saved synthesized audio to ${savePath}`);
        return `Generated ${duration}s ${waveform} tone (${rawNotes.join(', ')}) and saved to ${savePath} (${Math.round(wavBuffer.length / 1024)} KB).`;
      }

      // If no file path was given, save to temporary folder
      const tempFile = path.join(os.tmpdir(), `synth_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);
      return `Generated ${duration}s ${waveform} audio tone for [${rawNotes.join(', ')}] (${freqs.map((f) => `${Math.round(f)}Hz`).join(', ')}). Saved to temporary file: ${tempFile}`;
    },
  },
  {
    name: 'synthesize_sound_effect',
    description: 'Generate procedural sound effects (retro game audio, UI alerts, bells, sci-fi lasers, explosions, power-ups) on the fly without external audio files.',
    input_schema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['laser', 'coin', 'jump', 'powerup', 'alarm', 'bell', 'explosion', 'blip'],
          description: 'The sound effect preset to synthesize.',
        },
        duration: {
          type: 'number',
          description: 'Sound duration in seconds (default depends on preset, range 0.1 to 5).',
        },
        save_to: {
          type: 'string',
          description: 'Optional file path to save the .wav file to.',
        },
      },
      required: ['preset'],
    },
    async run(input, ctx) {
      const preset = String(input.preset || 'laser').toLowerCase();
      let config = { freqs: [880], duration: 0.3, waveform: 'sawtooth', pitchBend: -0.8, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 };

      switch (preset) {
        case 'laser':
          config = { freqs: [1200], duration: 0.25, waveform: 'sawtooth', pitchBend: -0.85, attack: 0.005, decay: 0.05, sustain: 0.2, release: 0.1 };
          break;
        case 'coin':
          config = { freqs: [987.77, 1318.51], duration: 0.4, waveform: 'square', pitchBend: 0.2, attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 };
          break;
        case 'jump':
          config = { freqs: [200], duration: 0.3, waveform: 'triangle', pitchBend: 1.5, attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.1 };
          break;
        case 'powerup':
          config = { freqs: [300, 450, 600, 900], duration: 0.6, waveform: 'square', pitchBend: 0.5, attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.2 };
          break;
        case 'alarm':
          config = { freqs: [800, 1000], duration: 0.8, waveform: 'square', pitchBend: 0.1, attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.1 };
          break;
        case 'bell':
          config = { freqs: [523.25, 1046.5, 1567.98], duration: 1.5, waveform: 'sine', pitchBend: 0, attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.8 };
          break;
        case 'explosion':
          config = { freqs: [60], duration: 0.8, waveform: 'noise', pitchBend: -0.5, attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.4 };
          break;
        case 'blip':
          config = { freqs: [800], duration: 0.08, waveform: 'sine', pitchBend: 0.1, attack: 0.005, decay: 0.03, sustain: 0.2, release: 0.02 };
          break;
      }

      if (input.duration) config.duration = Math.min(Math.max(Number(input.duration), 0.05), 5);

      ctx.log('info', `Synthesizing procedural sound effect "${preset}"...`);
      const wavBuffer = synthesizePcm({
        ...config,
        sampleRate: 44100,
        volume: 0.85,
      });

      let savePath = input.save_to ? resolveDest(input.save_to) : null;
      if (savePath && !savePath.toLowerCase().endsWith('.wav')) savePath += '.wav';

      if (savePath) {
        await ctx.confirm('change', {
          title: 'Save sound effect?',
          message: `Save procedural ${preset} sound to ${path.basename(savePath)}`,
          detail: savePath,
          confirm: 'Save',
        });
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fs.writeFileSync(savePath, wavBuffer);
        return `Synthesized "${preset}" sound effect and saved to ${savePath}.`;
      }

      const tempFile = path.join(os.tmpdir(), `sfx_${preset}_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);
      return `Synthesized procedural "${preset}" sound effect (${config.duration}s, ${config.waveform} wave). Saved to temporary file: ${tempFile}`;
    },
  },
  {
    name: 'generate_media_stream',
    description: 'Generate dynamic procedural visual media streams, animations, or visualizers (such as audio spectrum visualizers, particle systems, kinetic graphics, or geometric waveforms) as standalone interactive HTML5 or animated SVG media.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['visualizer', 'particles', 'geometric', 'matrix', 'waveform'],
          description: 'Type of generative visual stream to produce.',
        },
        title: {
          type: 'string',
          description: 'Title or caption for the media stream.',
        },
        save_to: {
          type: 'string',
          description: 'File path to save the generated HTML5/SVG stream to (e.g. "~/Documents/visualizer.html").',
        },
      },
      required: ['type'],
    },
    async run(input, ctx) {
      const type = String(input.type || 'visualizer').toLowerCase();
      const title = String(input.title || `${type.toUpperCase()} Stream`);
      let savePath = input.save_to ? resolveDest(input.save_to) : path.join(os.tmpdir(), `media_stream_${type}_${Date.now()}.html`);
      if (!savePath.toLowerCase().endsWith('.html') && !savePath.toLowerCase().endsWith('.svg')) savePath += '.html';

      ctx.log('info', `Generating procedural ${type} media stream...`);

      let html = '';
      if (type === 'visualizer') {
        html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { margin: 0; background: #0a0b10; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
    canvas { border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
    h1 { position: absolute; top: 20px; color: #fff; font-size: 1.2rem; opacity: 0.8; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <canvas id="c" width="800" height="400"></canvas>
  <script>
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const bars = 64;
    let t = 0;
    function render() {
      ctx.fillStyle = 'rgba(10, 11, 16, 0.25)';
      ctx.fillRect(0, 0, c.width, c.height);
      const barW = (c.width - 40) / bars;
      for (let i = 0; i < bars; i++) {
        const h = Math.abs(Math.sin(t + i * 0.15) * Math.cos(t * 0.7 + i * 0.05)) * 140 + 10;
        const hue = (i / bars * 240 + t * 40) % 360;
        ctx.fillStyle = 'hsl(' + hue + ', 85%, 60%)';
        ctx.fillRect(20 + i * barW, c.height / 2 - h / 2, barW - 2, h);
      }
      t += 0.05;
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`;
      } else if (type === 'particles') {
        html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>body { margin: 0; background: #050608; overflow: hidden; }</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const pts = Array.from({ length: 120 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      r: Math.random() * 2 + 1
    }));
    function draw() {
      ctx.fillStyle = 'rgba(5, 6, 8, 0.2)';
      ctx.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x = (p.x + p.vx + c.width) % c.width;
        p.y = (p.y + p.vy + c.height) % c.height;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 110) {
            ctx.strokeStyle = 'rgba(74, 222, 128, ' + (1 - d / 110) * 0.4 + ')';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;
      } else {
        html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;}</style></head>
<body>
  <canvas id="c" width="600" height="600"></canvas>
  <script>
    const c = document.getElementById('c'), ctx = c.getContext('2d');
    let t = 0;
    function f(){
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0,0,600,600);
      ctx.strokeStyle = 'hsl(' + (t * 50 % 360) + ', 80%, 65%)';
      ctx.beginPath();
      for(let i = 0; i < Math.PI * 8; i += 0.05){
        const r = 200 * Math.sin(3 * i + t);
        const x = 300 + r * Math.cos(i);
        const y = 300 + r * Math.sin(i);
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); t += 0.02; requestAnimationFrame(f);
    }
    f();
  </script>
</body>
</html>`;
      }

      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(savePath, html, 'utf8');

      ctx.log('info', `Generated ${type} media stream at ${savePath}`);
      return `Generated dynamic ${type} media stream "${title}" and saved to ${savePath}. You can open it in any browser or embed it directly into your stream.`;
    },
  },
];
