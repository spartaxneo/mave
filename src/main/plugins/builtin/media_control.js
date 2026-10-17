'use strict';
// Native Windows Media and Audio Control Plugin for Bigfoot.
// Allows controlling background media playback (Spotify, YouTube, VLC, browser players)
// and adjusting system master volume without switching windows.

const { execFile } = require('child_process');

const VK_CODES = {
  play_pause: 0xB3, // VK_MEDIA_PLAY_PAUSE
  next: 0xB0,       // VK_MEDIA_NEXT_TRACK
  prev: 0xB1,       // VK_MEDIA_PREV_TRACK
  stop: 0xB2,       // VK_MEDIA_STOP
  mute: 0xAD,       // VK_VOLUME_MUTE
  volume_down: 0xAE,// VK_VOLUME_DOWN
  volume_up: 0xAF,  // VK_VOLUME_UP
};

function sendMediaKey(vkCode) {
  return new Promise((resolve) => {
    const ps = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo); }'; [M]::keybd_event(${vkCode}, 0, 0, 0); [M]::keybd_event(${vkCode}, 0, 2, 0)`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 5000 }, () => {
      resolve();
    });
  });
}

module.exports = [
  {
    name: 'control_media_playback',
    description: 'Control media playback on Windows (Spotify, YouTube, media players) or adjust master audio volume hands-free.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['play_pause', 'next', 'prev', 'stop', 'mute', 'volume_up', 'volume_down'],
          description: 'The playback or audio command to send.',
        },
        steps: {
          type: 'number',
          description: 'Number of times to apply volume adjustment (e.g. 5 steps up or down). Default 1.',
        },
      },
      required: ['action'],
    },
    async run(input, ctx) {
      const action = String(input.action || 'play_pause').toLowerCase();
      const vk = VK_CODES[action];
      if (!vk) throw new Error(`Unknown media action "${action}"`);

      const steps = Math.min(Math.max(Number(input.steps) || 1, 1), 20);
      ctx.log('info', `Media control: ${action} (${steps}x)`);

      for (let i = 0; i < steps; i++) {
        await sendMediaKey(vk);
        if (steps > 1 && ctx.sleep) await ctx.sleep(50);
      }

      if (action === 'next' || action === 'stop') {
        try {
          const { getMemoryStore } = require('../../memory');
          getMemoryStore().recordFeedback({ action: 'music', item: 'current song/track', feedback: 'skip' });
        } catch { /* ignore */ }
      }

      const labels = {
        play_pause: 'Toggled play/pause for active media player',
        next: 'Skipped to next track',
        prev: 'Returned to previous track',
        stop: 'Stopped media playback',
        mute: 'Toggled master volume mute',
        volume_up: `Increased system volume by ${steps * 2}%`,
        volume_down: `Decreased system volume by ${steps * 2}%`,
      };

      return labels[action] || `Executed media action: ${action}`;
    },
  },
];
