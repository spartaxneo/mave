'use strict';
// System Telemetry, Power Management, and Wake-Word Plugin for Bigfoot.
// Provides hardware status reports, workstation power/lock/sleep controls,
// Wake-on-LAN (WOL), and hands-free voice wake-word configuration.

const { execFile } = require('child_process');
const dgram = require('dgram');
const { getWakeWordListener } = require('../../local/wakeword');

function queryTelemetry() {
  const script = `
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$drives = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB, 1)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB, 1)}}
$topProc = Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 ProcessName, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB, 0)}}

[PSCustomObject]@{
  cpuName = $cpu.Name
  cpuLoad = $cpu.LoadPercentage
  totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  drives = $drives
  topProcesses = $topProc
} | ConvertTo-Json -Compress
`;

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

function sendWolPacket(mac, broadcast = '255.255.255.255', port = 9) {
  const cleanMac = String(mac || '').replace(/[^0-9a-fA-F]/g, '');
  if (cleanMac.length !== 12) throw new Error('Invalid MAC address format. Expected 12 hexadecimal characters (e.g. 00:11:22:33:44:55).');

  const macBuffer = Buffer.from(cleanMac, 'hex');
  const magicPacket = Buffer.alloc(102);
  magicPacket.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) {
    macBuffer.copy(magicPacket, 6 + i * 6);
  }

  const client = dgram.createSocket('udp4');
  return new Promise((resolve, reject) => {
    client.bind(() => {
      client.setBroadcast(true);
      client.send(magicPacket, 0, magicPacket.length, port, broadcast, (err) => {
        client.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

module.exports = [
  {
    name: 'get_system_diagnostics',
    description: 'Get a full real-time telemetry and diagnostics report of this computer: CPU load, RAM usage, storage space across all drives, and top memory-consuming processes.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    async run(_input, ctx) {
      ctx.log('info', 'Scanning hardware telemetry and system metrics...');
      try {
        const data = await queryTelemetry();
        const usedRam = Math.round((data.totalRamGB - data.freeRamGB) * 10) / 10;
        const ramPct = Math.round((usedRam / data.totalRamGB) * 100);

        const driveLines = (Array.isArray(data.drives) ? data.drives : [data.drives])
          .map((d) => `  • Drive ${d.DeviceID}: ${d.FreeGB} GB free of ${d.SizeGB} GB`)
          .join('\n');

        const procLines = (Array.isArray(data.topProcesses) ? data.topProcesses : [data.topProcesses])
          .map((p) => `  • ${p.ProcessName}: ${p.MemMB} MB`)
          .join('\n');

        return `SYSTEM TELEMETRY REPORT:
• Processor: ${data.cpuName} (Load: ${data.cpuLoad}%)
• Memory: ${usedRam} GB used / ${data.totalRamGB} GB total (${ramPct}% in use, ${data.freeRamGB} GB free)
• Storage:
${driveLines}
• Top Memory Consumers:
${procLines}`;
      } catch (err) {
        return `Failed to gather hardware telemetry: ${err.message}`;
      }
    },
  },
  {
    name: 'manage_system_power',
    description: 'Control PC hardware power states: lock workstation, put PC into sleep/standby, turn off monitor displays, inspect battery state, or broadcast a Wake-on-LAN magic packet to wake remote machines on the network.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['lock_pc', 'sleep_pc', 'turn_off_screens', 'battery_status', 'wake_on_lan'],
          description: 'Power action to execute.',
        },
        target: {
          type: 'string',
          description: 'Target MAC address for wake_on_lan action (e.g. "00:11:22:33:44:55").',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;

      if (action === 'lock_pc') {
        await ctx.confirm('change', { title: 'Lock Workstation?', message: 'Lock the current Windows session', confirm: 'Lock PC' });
        execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true });
        return '🔒 Locked workstation successfully.';
      }

      if (action === 'sleep_pc') {
        await ctx.confirm('change', { title: 'Put PC to Sleep?', message: 'Put the computer into sleep/standby mode', confirm: 'Sleep PC' });
        execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true });
        return '💤 Put PC into sleep mode.';
      }

      if (action === 'turn_off_screens') {
        await ctx.confirm('read', { title: 'Turn off monitors?', message: 'Turn off display monitors (move mouse or press key to wake)', confirm: 'Turn Off Displays' });
        const ps = `(Add-Type '[DllImport("user32.dll")]public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);' -Name a -Passthru)::SendMessage(-1,0x0112,0xF170,2)`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
        return '🖥️ Turned off display monitors. Moving the mouse or typing any key will wake them.';
      }

      if (action === 'wake_on_lan') {
        const mac = String(input.target || '').trim();
        if (!mac) throw new Error('A target MAC address is required for wake_on_lan (e.g. "00:11:22:33:44:55").');
        await ctx.confirm('change', { title: 'Broadcast Wake-on-LAN?', message: `Send Magic Packet to wake device: ${mac}`, confirm: 'Send WOL' });
        await sendWolPacket(mac);
        return `⚡ Broadcasted Wake-on-LAN magic packet to \`${mac}\` across local subnet.`;
      }

      // action === 'battery_status'
      return new Promise((resolve) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          'Get-CimInstance -ClassName Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress'],
        { windowsHide: true, timeout: 5000 }, (_err, stdout) => {
          try {
            const data = JSON.parse(stdout);
            if (data && data.EstimatedChargeRemaining !== undefined) {
              resolve(`🔋 Battery Status: ${data.EstimatedChargeRemaining}% charge remaining (Status: ${data.BatteryStatus === 2 ? 'Charging' : 'Discharging'}).`);
              return;
            }
          } catch {}
          resolve('🔌 System is running on continuous AC Desktop power (no battery installed).');
        });
      });
    },
  },
  {
    name: 'toggle_wake_word',
    description: 'Enable or disable 24/7 background room wake-word listening ("Hey Mave" / "Mave") for completely hands-free voice control.',
    input_schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Whether to enable (true) or disable (false) the background wake-word listener.' },
        phrase: { type: 'string', description: 'Activation trigger phrase (default "Hey Mave").' },
      },
      required: ['enabled'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const listener = getWakeWordListener();
      if (input.enabled) {
        const res = listener.start(input.phrase || 'Hey Mave');
        ctx.log('info', `Wake-word listener activated for: "${res.phrase}"`);
        return `🎙️ **Hands-Free Wake-Word Activated**: Listening for *"${res.phrase}"* in the room. Just say the phrase to activate!`;
      }

      listener.stop();
      ctx.log('info', 'Wake-word listener paused.');
      return '🔇 **Wake-Word Listener Deactivated**: Background room audio listening stopped.';
    },
  },
  {
    name: 'manage_uac_and_elevation',
    description: 'Inspect Windows UAC status, detect if Mave is running as Administrator / High Integrity level, and request administrative elevation to interact with elevated apps.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['check_elevation_status', 'request_admin_elevation'],
          description: 'Elevation operation to perform.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;

      if (action === 'check_elevation_status') {
        const script = `
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$uac = Get-ItemProperty -Path HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System -ErrorAction SilentlyContinue
[PSCustomObject]@{
  isAdmin = $isAdmin
  promptOnSecureDesktop = $uac.PromptOnSecureDesktop
  enableLUA = $uac.EnableLUA
} | ConvertTo-Json -Compress
`;
        return new Promise((resolve) => {
          execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 }, (_err, stdout) => {
            try {
              const data = JSON.parse(stdout || '{}');
              const status = data.isAdmin ? '👑 **ELEVATED (High Integrity / Administrator)**' : '🛡️ **STANDARD USER (Medium Integrity)**';
              const uacMode = data.promptOnSecureDesktop === 0 ? 'Interactive Desktop (Accessible)' : 'Dimmed Secure Desktop (Isolated Winlogon Station)';
              resolve(`🛡️ **WINDOWS UAC & INTEGRITY STATUS**:
• **Process Privilege**: ${status}
• **UAC Secure Desktop Mode**: ${uacMode}
• **UAC Active (EnableLUA)**: ${data.enableLUA ? 'Yes' : 'No'}
${!data.isAdmin ? '\n💡 *Tip*: Run `manage_uac_and_elevation` with action="request_admin_elevation" to launch Mave as Administrator.' : ''}`);
            } catch {
              resolve('🛡️ Unable to query UAC registry. Process is running in standard user session.');
            }
          });
        });
      }

      if (action === 'request_admin_elevation') {
        await ctx.confirm('change', {
          title: 'Launch Mave as Administrator?',
          message: 'Request Windows Administrator elevation (High Integrity) to allow Mave to operate elevated tools and admin utilities.',
          confirm: 'Elevate Mave',
        });
        const path = require('path');
        const batPath = path.join(__dirname, '..', '..', '..', '..', 'start-mave-elevated.bat');
        execFile('cmd.exe', ['/c', batPath], { windowsHide: true });
        return '🚀 **ELEVATION PROMPT LAUNCHED**: Please click "Yes" on the Windows UAC elevation prompt on your screen to launch the elevated Mave instance.';
      }
    },
  },
];
