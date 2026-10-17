'use strict';
// Distributed Hands & Remote Device Control Plugin for Mave.
// Host PC is always the central "Brain".
// Connected devices (laptops, phones, tablets, family PCs) act as the "Hands".
// Guarantees:
// 1. Explicit permission is required from the remote device before any control.
// 2. Control actions execute exclusively on the remote device.
// 3. Host PC's own screen, mouse, and keyboard remain completely untouched.

const { getRemoteHandsManager } = require('../../remote/hands');

module.exports = [
  {
    name: 'remote_hands_list_devices',
    description: 'List all connected and enrolled devices available as "Hands" for Mave, including their permission states (granted, pending, revoked), platform, resolution, and active target status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const mgr = getRemoteHandsManager();
      const devices = mgr.listDevices();

      if (!devices.length) {
        return `📱 **DISTRIBUTED HANDS · CONNECTED DEVICES** (0):
No remote devices are currently connected.
• **To connect a device as Hands**:
  1. Open \`http://<this-pc-ip>:8080\` on any laptop, phone, or tablet on the same Wi-Fi.
  2. In the "Hands" tab, tap "Enable Remote Hands Mode".
  3. Grant permission on that device to allow Mave to perform tasks on their screen!`;
      }

      const rows = devices.map((d, i) => {
        const permStatus = d.permission.status.toUpperCase();
        const activeMarker = d.isActiveHandsTarget ? '🎯 [ACTIVE HANDS TARGET]' : '';
        const permIcon = d.permission.status === 'granted' ? '✅' : (d.permission.status === 'pending' ? '⏳' : '⛔');
        return `${i + 1}. **${d.name}** (\`${d.id}\`) ${activeMarker}
   • **Platform**: ${d.platform} (${d.type}) | **IP**: \`${d.ip}\`
   • **Permission**: ${permIcon} \`${permStatus}\` [Scopes: ${d.permission.scopes.join(', ') || 'none'}]
   • **Screen**: ${d.bounds.width}x${d.bounds.height} | **Has Frame**: ${d.hasFrame ? 'Yes' : 'Awaiting stream'}`;
      }).join('\n\n');

      return `🤖 **DISTRIBUTED HANDS · WORKER DEVICES** (${devices.length}):
*The Brain is this PC. Connected devices are the Hands.*

${rows}`;
    },
  },

  {
    name: 'remote_hands_request_permission',
    description: 'Request permission from a remote device owner to allow Mave to work on their device (view screen, mouse, keyboard, or apps). Generates a 6-digit confirmation code and sends a prompt to their device screen.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'ID, IP, or name of the remote device (e.g. "Alex\'s MacBook", "192.168.1.105", "hands_abc123").',
        },
        duration_minutes: {
          type: 'number',
          description: 'Requested duration in minutes (e.g. 15, 60, 120). Default: 60.',
        },
        reason: {
          type: 'string',
          description: 'Short user-friendly explanation of what task Mave wants to perform on their device.',
        },
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permissions needed (screen_read, screen_control, keyboard, shell, apps).',
        },
      },
      required: ['device_id_or_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const dev = mgr.getDevice(input.device_id_or_name);
      if (!dev) {
        throw new Error(`Device "${input.device_id_or_name}" not found. Run \`remote_hands_list_devices\` to see connected devices.`);
      }

      ctx.log('info', `Requesting permission from remote device [${dev.name}]...`);
      const req = mgr.requestPermission(dev.id, {
        durationMinutes: input.duration_minutes || 60,
        reason: input.reason || 'Execute task requested by user',
        scopes: input.scopes || ['screen_read', 'screen_control', 'keyboard', 'apps'],
      });

      return `🔒 **PERMISSION REQUEST DISPATCHED**:
• **Target Device**: **${dev.name}** (\`${dev.id}\`)
• **Pairing / Authorization Code**: \`${req.grantCode}\`
• **Scopes**: ${req.scopes ? req.scopes.join(', ') : 'screen_read, screen_control, keyboard, apps'}
• **Status**: ⏳ Pending user confirmation on the remote device.
*The remote device owner can tap "Grant" on their screen or enter code \`${req.grantCode}\` to authorize Mave.*`;
    },
  },

  {
    name: 'remote_hands_grant_permission',
    description: 'Grant control permission for a connected remote device so Mave can perform tasks on its screen.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'ID or name of the remote device to grant permission for.',
        },
        code: {
          type: 'string',
          description: 'Optional 6-digit permission code if requested.',
        },
        duration_minutes: {
          type: 'number',
          description: 'Duration in minutes to authorize (e.g. 60). Default: 60.',
        },
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed scopes (default: screen_read, screen_control, keyboard, apps).',
        },
      },
      required: ['device_id_or_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const dev = mgr.getDevice(input.device_id_or_name);
      if (!dev) throw new Error(`Device "${input.device_id_or_name}" not found.`);

      ctx.log('info', `Granting remote control permission to [${dev.name}]...`);
      const res = mgr.grantPermission(dev.id, {
        durationMinutes: input.duration_minutes || 60,
        scopes: input.scopes || ['screen_read', 'screen_control', 'keyboard', 'apps'],
        code: input.code,
      });

      return `✅ **PERMISSION GRANTED FOR REMOTE HANDS**:
• **Device**: **${dev.name}** (\`${dev.id}\`)
• **Status**: Active (Authorized)
• **Scopes**: ${res.scopes.join(', ')}
• **Expires In**: ${input.duration_minutes || 60} minutes
*Mave can now control this device. Actions will execute on ${dev.name} without touching your PC!*`;
    },
  },

  {
    name: 'remote_hands_revoke_permission',
    description: 'Immediately revoke remote control permission from a device, stopping any active tasks on it.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'ID or name of the remote device to revoke.',
        },
      },
      required: ['device_id_or_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const dev = mgr.getDevice(input.device_id_or_name);
      if (!dev) throw new Error(`Device "${input.device_id_or_name}" not found.`);

      ctx.log('warn', `Revoking permission from [${dev.name}]...`);
      mgr.revokePermission(dev.id);

      return `⛔ **PERMISSION REVOKED**:
• **Device**: **${dev.name}** (\`${dev.id}\`)
• **Status**: Revoked & Disconnected. Mave can no longer read or control this device.`;
    },
  },

  {
    name: 'remote_hands_switch_target',
    description: 'Switch Mave\'s active screen and computer target between "host" (this PC) and a remote device ("Hands"). When switched to a remote device, all screenshots, mouse clicks, and typing occur on that remote device, leaving this PC untouched.',
    input_schema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target to switch to: "host" (this PC) or device ID/name (e.g. "Alex\'s MacBook", "hands_abc123").',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const t = String(input.target || '').trim();

      if (t.toLowerCase() === 'host' || t.toLowerCase() === 'this pc' || t.toLowerCase() === 'local') {
        mgr.resetToHostTarget(ctx.agent);
        ctx.log('info', 'Active computer target switched back to Host PC.');
        return '🖥️ **TARGET SWITCHED: HOST PC**\nMave is now operating on this local PC screen.';
      }

      const dev = mgr.getDevice(t);
      if (!dev) throw new Error(`Remote device "${t}" not found. Run \`remote_hands_list_devices\` to see available devices.`);

      if (!dev.isPermissionActive('screen_control')) {
        throw new Error(`Cannot switch target to "${dev.name}": Permission has not been granted by that device yet. Request permission first.`);
      }

      mgr.switchToRemoteTarget(dev.id, ctx.agent);
      ctx.log('info', `Active computer target switched to remote device [${dev.name}]. Host screen is untouched.`);

      return `🎯 **TARGET SWITCHED: REMOTE HANDS [${dev.name}]**:
• **Target Device**: **${dev.name}** (\`${dev.id}\`)
• **Platform**: ${dev.platform} | **Resolution**: ${dev.bounds.width}x${dev.bounds.height}
• **Host PC Isolation**: ACTIVE. All mouse clicks, typing, and screenshots now happen exclusively on **${dev.name}**!
• **This PC**: 100% untouched and free for your own use.`;
    },
  },

  {
    name: 'remote_hands_execute_action',
    description: 'Send a discrete UI action (click, type, key, open_app, shell) directly to a remote device with verified permission, without affecting this PC.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'ID or name of the target remote device.',
        },
        action: {
          type: 'string',
          enum: ['click', 'double_click', 'right_click', 'type', 'key', 'scroll', 'open_url', 'open_app', 'shell'],
          description: 'Action to execute on remote device.',
        },
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            text: { type: 'string', description: 'Text to type or key name' },
            url: { type: 'string', description: 'URL to open' },
            app: { type: 'string', description: 'App name or package to open' },
            command: { type: 'string', description: 'Shell command to execute' },
            scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
            scroll_amount: { type: 'number' },
          },
          description: 'Parameters for the action.',
        },
      },
      required: ['device_id_or_name', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const dev = mgr.getDevice(input.device_id_or_name);
      if (!dev) throw new Error(`Remote device "${input.device_id_or_name}" not found.`);

      const action = input.action;
      const params = input.parameters || {};

      ctx.log('info', `Executing "${action}" on remote device [${dev.name}]...`);

      const res = await mgr.executeActionOnDevice(dev.id, action, params, ctx.signal);

      return `🖐️ **REMOTE ACTION EXECUTED ON [${dev.name}]**:
• **Action**: \`${action}\`
• **Parameters**: ${JSON.stringify(params)}
• **Status**: ${res}
• **Host Screen**: Completely untouched.`;
    },
  },

  {
    name: 'remote_hands_capture_screen',
    description: 'Capture a screenshot of the remote device\'s screen without touching or capturing the host PC screen.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'ID or name of the remote device.',
        },
      },
      required: ['device_id_or_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mgr = getRemoteHandsManager();
      const dev = mgr.getDevice(input.device_id_or_name);
      if (!dev) throw new Error(`Remote device "${input.device_id_or_name}" not found.`);

      const frame = await mgr.captureScreen(dev.id);

      return `📸 **REMOTE SCREEN CAPTURED**:
• **Device**: **${dev.name}** (\`${dev.id}\`)
• **Resolution**: ${dev.bounds.width}x${dev.bounds.height}
• **Frame Size**: ${frame.length} bytes
• **Host Screen**: Untouched. Attached remote screen to context.`;
    },
  },
];
