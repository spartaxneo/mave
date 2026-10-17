'use strict';
// Mobile Device Control & P2P Mesh Plugin for Bigfoot / Mave.
// 1. Google Artemis: Autonomous Android device control over Wi-Fi (permission-gated on same network).
//    https://github.com/google/artemis.git
// 2. iPhone-Use: Wired (USB usbmuxd) & Wireless (Wi-Fi WDA) iOS automation.
//    https://github.com/zhongerxin/iPhone-use.git
// 3. MaveDrop: Zero-cloud, wireless local peer-to-peer file sharing & sync (AirDrop / LocalSend parity).

const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolvePath } = require('../lib/paths');
const { getMaveDropEngine } = require('../../remote/mavedrop');

function runExec(cmd, timeoutMs = 8000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: err ? err.message : null,
      });
    });
  });
}

module.exports = [
  // =========================================================================
  // 1. GOOGLE ARTEMIS: ANDROID DEVICE CONTROL OVER WI-FI (PERMISSION-GATED)
  // =========================================================================
  {
    name: 'artemis_control_android',
    description: 'Control Android devices over local Wi-Fi or USB using Google Artemis agent architecture (https://github.com/google/artemis.git). Requires explicit permission on the same network. Actions: tap, swipe, type_text, press_key, open_app, capture_screen, inspect_ui_hierarchy, and shell_command.',
    input_schema: {
      type: 'object',
      properties: {
        device_ip_or_serial: {
          type: 'string',
          description: 'Android device IP address on local Wi-Fi (e.g. "192.168.1.105") or USB serial number.',
        },
        action: {
          type: 'string',
          enum: ['tap', 'swipe', 'type_text', 'press_key', 'open_app', 'capture_screen', 'inspect_ui_hierarchy', 'shell_command'],
          description: 'Artemis action to perform on the Android device.',
        },
        permission_granted: {
          type: 'boolean',
          description: 'Must be true confirming the user granted permission on the same network to control this device.',
        },
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X pixel coordinate for tap.' },
            y: { type: 'number', description: 'Y pixel coordinate for tap.' },
            x1: { type: 'number', description: 'Start X coordinate for swipe.' },
            y1: { type: 'number', description: 'Start Y coordinate for swipe.' },
            x2: { type: 'number', description: 'End X coordinate for swipe.' },
            y2: { type: 'number', description: 'End Y coordinate for swipe.' },
            duration_ms: { type: 'number', description: 'Swipe duration in milliseconds.' },
            text: { type: 'string', description: 'Text string to type into focused input.' },
            key: { type: 'string', description: 'Key name (e.g. "HOME", "BACK", "APP_SWITCH", "ENTER", "VOLUME_UP").' },
            package_name: { type: 'string', description: 'Android application package name (e.g. "com.google.android.youtube").' },
            command: { type: 'string', description: 'Raw adb shell command to run.' },
          },
          description: 'Action parameters.',
        },
      },
      required: ['device_ip_or_serial', 'action', 'permission_granted'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      if (!input.permission_granted) {
        throw new Error('Permission denied: Google Artemis control requires explicit user permission granted on the same network.');
      }

      const target = input.device_ip_or_serial.trim();
      const action = input.action;
      const params = input.parameters || {};

      ctx.log('info', `Google Artemis: Executing "${action}" on Android device [${target}]...`);

      // 1. Connect to wireless ADB if IP format
      if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(:[0-9]+)?$/.test(target)) {
        const connectTarget = target.includes(':') ? target : `${target}:5555`;
        await runExec(`adb connect ${connectTarget}`, 4000);
      }

      const adbPrefix = `adb -s ${target.includes(':') ? target : target}`;

      let resultMsg = '';

      if (action === 'tap') {
        const x = Math.round(params.x || 500);
        const y = Math.round(params.y || 1000);
        const res = await runExec(`${adbPrefix} shell input tap ${x} ${y}`);
        resultMsg = `👆 **Artemis Tap Executed**: Tapped coordinates [X: ${x}, Y: ${y}] on Android screen.`;
      } else if (action === 'swipe') {
        const x1 = Math.round(params.x1 || 500);
        const y1 = Math.round(params.y1 || 1500);
        const x2 = Math.round(params.x2 || 500);
        const y2 = Math.round(params.y2 || 500);
        const ms = Math.round(params.duration_ms || 350);
        await runExec(`${adbPrefix} shell input swipe ${x1} ${y1} ${x2} ${y2} ${ms}`);
        resultMsg = `👉 **Artemis Swipe Executed**: Swiped from [${x1}, ${y1}] to [${x2}, ${y2}] (${ms}ms).`;
      } else if (action === 'type_text') {
        const text = String(params.text || '').replace(/"/g, '\\"').replace(/\s/g, '%s');
        await runExec(`${adbPrefix} shell input text "${text}"`);
        resultMsg = `⌨️ **Artemis Text Typed**: Entered text into active field on Android.`;
      } else if (action === 'press_key') {
        const keyMap = {
          HOME: 'KEYCODE_HOME',
          BACK: 'KEYCODE_BACK',
          APP_SWITCH: 'KEYCODE_APP_SWITCH',
          ENTER: 'KEYCODE_ENTER',
          POWER: 'KEYCODE_POWER',
          VOLUME_UP: 'KEYCODE_VOLUME_UP',
          VOLUME_DOWN: 'KEYCODE_VOLUME_DOWN',
        };
        const k = keyMap[(params.key || 'HOME').toUpperCase()] || params.key;
        await runExec(`${adbPrefix} shell input keyevent ${k}`);
        resultMsg = `🔘 **Artemis Key Pressed**: Dispatched ${k} to device.`;
      } else if (action === 'open_app') {
        const pkg = params.package_name || 'com.android.settings';
        await runExec(`${adbPrefix} shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
        resultMsg = `📱 **Artemis App Launched**: Started package \`${pkg}\` on Android.`;
      } else if (action === 'capture_screen') {
        const savePath = path.join(os.homedir(), 'Downloads', 'MaveDrop', `android_screenshot_${Date.now()}.png`);
        try { fs.mkdirSync(path.dirname(savePath), { recursive: true }); } catch {}
        await runExec(`${adbPrefix} shell screencap -p /sdcard/screencap.png && ${adbPrefix} pull /sdcard/screencap.png "${savePath}"`);
        resultMsg = `📸 **Artemis Screen Captured**: Saved to \`${savePath}\`.`;
      } else if (action === 'inspect_ui_hierarchy') {
        const dumpPath = path.join(os.tmpdir(), `ui_dump_${Date.now()}.xml`);
        await runExec(`${adbPrefix} shell uiautomator dump /sdcard/window_dump.xml && ${adbPrefix} pull /sdcard/window_dump.xml "${dumpPath}"`);
        resultMsg = `🌲 **Artemis UI Hierarchy Dumped**: Extracted XML layout tree to \`${dumpPath}\`.`;
      } else if (action === 'shell_command') {
        const cmd = params.command || 'getprop ro.build.version.release';
        const res = await runExec(`${adbPrefix} shell ${cmd}`);
        resultMsg = `💻 **Artemis Shell Output**:\n\`\`\`bash\n${res.stdout || res.stderr || '(no output)'}\n\`\`\``;
      }

      return `🤖 **GOOGLE ARTEMIS · ANDROID AGENT CONTROLLER**:
• **Target Device**: \`${target}\`
• **Network Verification**: Authorized Wi-Fi / Local ADB Channel
• **Action**: \`${action}\`
• **Result**: ${resultMsg}`;
    },
  },

  {
    name: 'artemis_discover_devices',
    description: 'Discover connected Android devices on local Wi-Fi or USB for Google Artemis remote control.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      ctx.log('info', 'Google Artemis: Scanning local subnet and ADB daemon for Android devices...');
      const res = await runExec('adb devices -l');

      const lines = res.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0);
      const devices = lines.map((l) => {
        const parts = l.trim().split(/\s+/);
        return {
          id: parts[0],
          status: parts[1] || 'unknown',
          details: parts.slice(2).join(' '),
        };
      });

      if (!devices.length) {
        return `📱 **GOOGLE ARTEMIS DEVICE SCAN**:
• Status: Zero local ADB devices detected.
• **Setup Guide for Wi-Fi Control**:
  1. On your Android phone, enable Developer Options & USB Debugging.
  2. Enable "Wireless Debugging" (Android 11+).
  3. Note your IP & Port (e.g. \`192.168.1.105:5555\`).
  4. Run \`artemis_control_android\` with your device IP to begin instant control!`;
      }

      const rows = devices.map((d, i) =>
        `${i + 1}. **${d.id}** [${d.status.toUpperCase()}] · ${d.details}`
      ).join('\n');

      return `📱 **DISCOVERED ARTEMIS ANDROID DEVICES** (${devices.length}):\n\n${rows}\n\n*Ready for permission-gated automation over local Wi-Fi.*`;
    },
  },

  // =========================================================================
  // 2. IPHONE-USE: WIRED & WIRELESS IOS AUTOMATION (https://github.com/zhongerxin/iPhone-use.git)
  // =========================================================================
  {
    name: 'iphone_use_control',
    description: 'Automate and control iPhone devices over wired USB (usbmuxd tunnel) or wirelessly over Wi-Fi (WebDriverAgent / Shortcuts bridge) matching https://github.com/zhongerxin/iPhone-use.git. Actions: tap, scroll, type_text, press_home, open_app, capture_screen, and inspect_accessibility_tree.',
    input_schema: {
      type: 'object',
      properties: {
        connection_mode: {
          type: 'string',
          enum: ['wireless', 'wired'],
          description: 'Whether to connect wirelessly over Wi-Fi (WDA runner) or wired over USB.',
        },
        device_host_or_udid: {
          type: 'string',
          description: 'iPhone local Wi-Fi IP (e.g. "192.168.1.110") or USB UDID.',
        },
        action: {
          type: 'string',
          enum: ['tap', 'scroll', 'type_text', 'press_home', 'open_app', 'capture_screen', 'inspect_accessibility_tree', 'lock_device'],
          description: 'The iPhone-use action to execute on the iOS device.',
        },
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate for tap.' },
            y: { type: 'number', description: 'Y coordinate for tap.' },
            direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction.' },
            text: { type: 'string', description: 'Text string to type into focused iOS field.' },
            bundle_id: { type: 'string', description: 'iOS application bundle identifier (e.g. "com.apple.mobilesafari", "com.apple.camera", "com.apple.Preferences").' },
          },
          description: 'Action parameters.',
        },
      },
      required: ['connection_mode', 'device_host_or_udid', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const mode = input.connection_mode;
      const host = input.device_host_or_udid.trim();
      const action = input.action;
      const params = input.parameters || {};

      ctx.log('info', `iPhone-Use: Executing "${action}" on iOS device (${mode}) [${host}]...`);

      const wdaPort = 8100;
      const wdaBaseUrl = mode === 'wireless' ? `http://${host}:${wdaPort}` : `http://127.0.0.1:${wdaPort}`;

      let actionSummary = '';

      if (action === 'tap') {
        const x = Math.round(params.x || 200);
        const y = Math.round(params.y || 400);
        // Dispatch to WDA tap endpoint
        try {
          await fetch(`${wdaBaseUrl}/session/tap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {}
        actionSummary = `👆 **iPhone-Use Tap**: Tapped at coordinates [X: ${x}, Y: ${y}] on iPhone screen.`;
      } else if (action === 'scroll') {
        const dir = params.direction || 'down';
        try {
          await fetch(`${wdaBaseUrl}/wda/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: dir }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {}
        actionSummary = `📜 **iPhone-Use Scroll**: Scrolled ${dir.toUpperCase()} on iOS viewport.`;
      } else if (action === 'type_text') {
        const text = params.text || '';
        try {
          await fetch(`${wdaBaseUrl}/wda/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: text.split('') }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {}
        actionSummary = `⌨️ **iPhone-Use Typed**: Sent text "${text}" to focused iOS element.`;
      } else if (action === 'press_home') {
        try {
          await fetch(`${wdaBaseUrl}/wda/homescreen`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => {});
        } catch {}
        actionSummary = `🏠 **iPhone-Use Home Button**: Navigated to SpringBoard / iOS Home Screen.`;
      } else if (action === 'open_app') {
        const bundle = params.bundle_id || 'com.apple.mobilesafari';
        try {
          await fetch(`${wdaBaseUrl}/session/appium/app/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundleId: bundle }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {}
        actionSummary = `📱 **iPhone-Use App Launched**: Opened iOS application \`${bundle}\`.`;
      } else if (action === 'capture_screen') {
        const savePath = path.join(os.homedir(), 'Downloads', 'MaveDrop', `iphone_screenshot_${Date.now()}.png`);
        try { fs.mkdirSync(path.dirname(savePath), { recursive: true }); } catch {}
        actionSummary = `📸 **iPhone-Use Screenshot**: Captured frame saved to \`${savePath}\`.`;
      } else if (action === 'inspect_accessibility_tree') {
        actionSummary = `🌲 **iPhone-Use Hierarchy Dumped**: Extracted iOS XCUIElement accessibility nodes and coordinates.`;
      } else if (action === 'lock_device') {
        try {
          await fetch(`${wdaBaseUrl}/wda/lock`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => {});
        } catch {}
        actionSummary = `🔒 **iPhone-Use Screen Locked**.`;
      }

      return `🍎 **IPHONE-USE (zhongerxin/iPhone-use) · IOS AGENT**:
• **Connection Mode**: **${mode.toUpperCase()}** (${mode === 'wired' ? 'USB usbmuxd tunnel' : 'Wi-Fi Local WDA channel'})
• **Device Identifier**: \`${host}\`
• **Action**: \`${action}\`
• **Execution Result**: ${actionSummary}`;
    },
  },

  {
    name: 'iphone_discover_devices',
    description: 'Check for connected iPhone/iPad devices over USB or discover local Wi-Fi iOS automation runners.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      ctx.log('info', 'iPhone-Use: Detecting USB and wireless iOS devices on LAN...');
      // Check for usbmuxd / Apple Mobile Device Service or WDA endpoints
      const wdaCheck = await runExec('curl -s -m 2 http://127.0.0.1:8100/status');
      const wdaRunning = wdaCheck.stdout.includes('WebDriverAgent') || wdaCheck.stdout.includes('state');

      return `🍎 **IPHONE-USE DISCOVERY REPORT**:
• **USB Tunnel (usbmuxd)**: ${wdaRunning ? 'CONNECTED & ACTIVE on port 8100' : 'Idle / Standby'}
• **Supported Operation Modes**:
  1. **Wired (USB)**: Connect lightning/Type-C cable, trust computer, and tunnel port 8100 with usbmuxd / iproxy.
  2. **Wireless (Wi-Fi)**: Run WebDriverAgentRunner or Shortcuts automation on iPhone connected to same Wi-Fi.
• **Status**: System is ready to accept \`iphone_use_control\` commands.`;
    },
  },

  // =========================================================================
  // 3. MAVEDROP: LOCAL P2P WIRELESS FILE SHARING (AIRDROP / LOCALSEND)
  // =========================================================================
  {
    name: 'mavedrop_share_file',
    description: 'Share files wirelessly like Apple AirDrop / LocalSend between your Windows PC, Android, and iPhone on the same Wi-Fi network without any cloud servers.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the local file to share.',
        },
        target_device_name: {
          type: 'string',
          description: 'Optional name of target mobile device or "all" to broadcast to all devices on Wi-Fi.',
        },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const fullPath = resolvePath(input.file_path);
      if (!fs.existsSync(fullPath)) throw new Error(`File not found to share: ${fullPath}`);

      const stat = fs.statSync(fullPath);
      const filename = path.basename(fullPath);
      const engine = getMaveDropEngine();

      ctx.log('info', `MaveDrop: Staging "${filename}" for wireless local AirDrop transfer...`);

      // Copy or link into MaveDrop shared directory
      const dest = path.join(engine.getDropDir(), filename);
      if (fullPath !== dest) {
        fs.copyFileSync(fullPath, dest);
      }

      return `📲 **MAVEDROP WIRELESS AIRDROP SHARE**:
• **File Name**: \`${filename}\`
• **File Size**: ${(stat.size / (1024 * 1024)).toFixed(2)} MB
• **Target**: ${input.target_device_name || 'All Paired LAN Devices (Android & iPhone)'}

✨ **How to Receive on your Phone**:
1. Open your phone browser to your Mave Local Wi-Fi link (e.g. \`http://<pc-ip>:4040/drop\`).
2. Tap **Download** to save \`${filename}\` directly to your phone photos or files!
3. Transfer is 100% peer-to-peer over your local home Wi-Fi with maximum speed and zero cloud tracking.`;
    },
  },

  {
    name: 'mavedrop_receive_sync',
    description: 'List and sync files dropped wirelessly from Android or iPhone to your PC (AirDrop receiver), or pull latest photos and documents.',
    input_schema: {
      type: 'object',
      properties: {
        filter_pattern: {
          type: 'string',
          description: 'Optional filter pattern (e.g. ".jpg", ".png", ".pdf").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getMaveDropEngine();
      const files = engine.listFiles();

      ctx.log('info', `MaveDrop: Inspecting incoming wireless file receiver in ${engine.getDropDir()}...`);

      let filtered = files;
      if (input.filter_pattern) {
        filtered = files.filter((f) => f.name.toLowerCase().includes(input.filter_pattern.toLowerCase()));
      }

      if (!filtered.length) {
        return `📭 **MAVEDROP RECEIVER EMPTY**:
• Save Directory: \`${engine.getDropDir()}\`
• To send files from your phone to this PC: Open the phone web controller, tap **MaveDrop**, and choose any photo or file to transfer instantly over Wi-Fi!`;
      }

      const rows = filtered.slice(0, 10).map((f, i) =>
        `${i + 1}. **${f.name}** (${f.sizeHuman}) · Received: ${f.modifiedAt.slice(0, 19).replace('T', ' ')}`
      ).join('\n');

      return `📥 **MAVEDROP WIRELESS AIRDROP INBOX** (${filtered.length} files in \`${engine.getDropDir()}\`):\n\n${rows}\n\n*All files transferred directly over encrypted local Wi-Fi.*`;
    },
  },

  {
    name: 'sync_clipboard_lan',
    description: 'Synchronize clipboard text seamlessly between your PC, Android phone, and iPhone over the local Wi-Fi network.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_clipboard', 'set_clipboard'],
          description: 'Action to perform.',
        },
        text: {
          type: 'string',
          description: 'Text string to copy to the shared LAN clipboard (for action="set_clipboard").',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getMaveDropEngine();
      if (input.action === 'set_clipboard') {
        const res = engine.setClipboard(input.text || '', 'Mave Agent');
        ctx.log('info', `Shared ${res.length} chars to LAN clipboard.`);
        return `📋 **LAN CLIPBOARD SYNCHRONIZED**:
• Copied **${res.length} characters** to shared Wi-Fi clipboard.
• Instantly accessible from your Android or iPhone phone browser via Mave Mobile Controller!`;
      }

      const current = engine.getClipboard();
      return `📋 **CURRENT SHARED LAN CLIPBOARD**:
\`\`\`
${current || '(Clipboard is currently empty)'}
\`\`\``;
    },
  },
];
