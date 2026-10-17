'use strict';
// Example plugin: Procedural media generation and streaming animations.
// Copy this file to %APPDATA%\Bigfoot\plugins\ to use it as a user plugin.

const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = [
  {
    name: 'create_ambient_stream',
    description: 'Generates an interactive, ambient relaxing generative audio/visual stream in HTML5 format.',
    input_schema: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['ocean', 'aurora', 'cyberpunk', 'sunset'],
          description: 'Color and visual theme for the ambient stream.',
        },
      },
      required: [],
    },
    async run(input, ctx) {
      const theme = input.theme || 'aurora';
      const colors = {
        ocean: ['#0f172a', '#0284c7', '#38bdf8', '#0ea5e9'],
        aurora: ['#030712', '#10b981', '#06b6d4', '#6366f1'],
        cyberpunk: ['#180628', '#f43f5e', '#a855f7', '#06b6d4'],
        sunset: ['#1c1917', '#f97316', '#e11d48', '#fbbf24'],
      }[theme] || ['#030712', '#10b981', '#06b6d4', '#6366f1'];

      const targetPath = path.join(os.homedir(), `ambient_stream_${theme}.html`);
      ctx.log('info', `Generating ambient ${theme} stream to ${targetPath}...`);

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ambient ${theme.toUpperCase()} Stream</title>
  <style>
    body { margin: 0; background: ${colors[0]}; overflow: hidden; height: 100vh; display: flex; align-items: center; justify-content: center; }
    canvas { width: 100vw; height: 100vh; }
    .badge { position: absolute; bottom: 24px; left: 24px; color: rgba(255,255,255,0.7); font-family: system-ui, sans-serif; font-size: 14px; background: rgba(0,0,0,0.4); padding: 8px 16px; border-radius: 99px; backdrop-filter: blur(8px); }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div class="badge">Ambient Stream: ${theme.toUpperCase()}</div>
  <script>
    const c = document.getElementById('c'), ctx = c.getContext('2d');
    function resize() { c.width = window.innerWidth; c.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();
    let t = 0;
    const waves = 5;
    function render() {
      ctx.fillStyle = '${colors[0]}15';
      ctx.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < waves; i++) {
        ctx.beginPath();
        ctx.strokeStyle = '${colors[1]}'.replace(')', ', ' + (0.15 + i * 0.1) + ')').replace('#', 'rgba(' + parseInt('${colors[1]}'.slice(1,3),16) + ',' + parseInt('${colors[1]}'.slice(3,5),16) + ',' + parseInt('${colors[1]}'.slice(5,7),16) + ',');
        ctx.lineWidth = 3;
        for (let x = 0; x < c.width; x += 10) {
          const y = c.height / 2 + Math.sin(x * 0.003 + t + i * 0.8) * (80 + i * 30) + Math.cos(x * 0.001 - t * 0.5) * 40;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      t += 0.015;
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`;

      fs.writeFileSync(targetPath, html, 'utf8');
      return `Generated ambient ${theme} media stream and saved to ${targetPath}. Open with your browser or stream it as a backdrop.`;
    },
  },
];
