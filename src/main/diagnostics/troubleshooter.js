'use strict';
// Mave Error Collector & Self-Healing Diagnostics Engine.
// Captures system errors, missing app failures, command faults, and tool execution issues;
// provides root-cause diagnosis, learning records, and actionable interactive recommendations.

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

let shell = null;
try {
  ({ shell } = require('electron'));
} catch { /* Node testing fallback */ }

const APP_CATALOG = {
  spotify: {
    name: 'Spotify',
    webUrl: 'https://open.spotify.com',
    wingetId: 'Spotify.Spotify',
    storeUrl: 'ms-windows-store://pdp/?productid=9NCBCSZSJRSB',
    downloadUrl: 'https://www.spotify.com/download/windows/',
  },
  discord: {
    name: 'Discord',
    webUrl: 'https://discord.com/app',
    wingetId: 'Discord.Discord',
    storeUrl: 'ms-windows-store://search/?query=discord',
    downloadUrl: 'https://discord.com/download',
  },
  whatsapp: {
    name: 'WhatsApp',
    webUrl: 'https://web.whatsapp.com',
    wingetId: 'WhatsApp.WhatsApp',
    storeUrl: 'ms-windows-store://pdp/?productid=9NKSQGP7F2NH',
    downloadUrl: 'https://www.whatsapp.com/download',
  },
  telegram: {
    name: 'Telegram',
    webUrl: 'https://web.telegram.org',
    wingetId: 'Telegram.TelegramDesktop',
    storeUrl: 'ms-windows-store://pdp/?productid=9NZTWSQNTD0S',
    downloadUrl: 'https://desktop.telegram.org',
  },
  vscode: {
    name: 'Visual Studio Code',
    webUrl: 'https://vscode.dev',
    wingetId: 'Microsoft.VisualStudioCode',
    downloadUrl: 'https://code.visualstudio.com/Download',
  },
  'visual studio code': {
    name: 'Visual Studio Code',
    webUrl: 'https://vscode.dev',
    wingetId: 'Microsoft.VisualStudioCode',
    downloadUrl: 'https://code.visualstudio.com/Download',
  },
  slack: {
    name: 'Slack',
    webUrl: 'https://app.slack.com',
    wingetId: 'SlackTechnologies.Slack',
    storeUrl: 'ms-windows-store://pdp/?productid=9WZDNCRDK3WP',
    downloadUrl: 'https://slack.com/downloads/windows',
  },
  notion: {
    name: 'Notion',
    webUrl: 'https://www.notion.so',
    wingetId: 'Notion.Notion',
    downloadUrl: 'https://www.notion.so/desktop',
  },
  zoom: {
    name: 'Zoom',
    webUrl: 'https://app.zoom.us/wc',
    wingetId: 'Zoom.Zoom',
    downloadUrl: 'https://zoom.us/download',
  },
  steam: {
    name: 'Steam',
    webUrl: 'https://store.steampowered.com',
    wingetId: 'Valve.Steam',
    downloadUrl: 'https://store.steampowered.com/about/',
  },
  vlc: {
    name: 'VLC Media Player',
    wingetId: 'VideoLAN.VLC',
    storeUrl: 'ms-windows-store://pdp/?productid=9NBLGGH4VVNH',
    downloadUrl: 'https://www.videolan.org/vlc/',
  },
  chrome: {
    name: 'Google Chrome',
    webUrl: 'https://www.google.com',
    wingetId: 'Google.Chrome',
    downloadUrl: 'https://www.google.com/chrome/',
  },
  'google chrome': {
    name: 'Google Chrome',
    webUrl: 'https://www.google.com',
    wingetId: 'Google.Chrome',
    downloadUrl: 'https://www.google.com/chrome/',
  },
  firefox: {
    name: 'Mozilla Firefox',
    webUrl: 'https://www.mozilla.org/firefox',
    wingetId: 'Mozilla.Firefox',
    downloadUrl: 'https://www.mozilla.org/firefox/new/',
  },
  netflix: {
    name: 'Netflix',
    webUrl: 'https://www.netflix.com',
    storeUrl: 'ms-windows-store://pdp/?productid=9WZDNCRFJ3TJ',
  },
  youtube: {
    name: 'YouTube',
    webUrl: 'https://www.youtube.com',
  },
};

function getStoragePath() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const dir = path.join(home, 'AppData', 'Roaming', 'mave');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dir, 'error-diagnostics.json');
}

class Troubleshooter {
  constructor({ logger = null } = {}) {
    this.logger = logger;
    this.errors = [];
    this.loadPersistedErrors();
  }

  loadPersistedErrors() {
    try {
      const file = getStoragePath();
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(data)) this.errors = data.slice(-100);
      }
    } catch {
      this.errors = [];
    }
  }

  saveErrors() {
    try {
      const file = getStoragePath();
      fs.writeFileSync(file, JSON.stringify(this.errors.slice(-100), null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  /**
   * Records an error and returns structured diagnosis and self-healing recommendations.
   */
  collectError({ task = '', tool = '', error = null, context = {} }) {
    const errorMsg = error ? (error.message || String(error)) : 'Unknown failure';
    const errorStack = error && error.stack ? error.stack : '';
    const diagnosis = this.diagnose(task, errorMsg, tool, context);

    const record = {
      id: 'err-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      task: String(task).slice(0, 300),
      tool: String(tool || 'system'),
      error: errorMsg.slice(0, 500),
      stack: errorStack.slice(0, 1000),
      category: diagnosis.category,
      explanation: diagnosis.explanation,
      diagnosis: diagnosis,
      recommendations: diagnosis.recommendations,
      resolved: false,
    };

    this.errors.push(record);
    if (this.errors.length > 100) this.errors.shift();
    this.saveErrors();

    if (this.logger) {
      this.logger.error(`[Troubleshooter] Recorded ${diagnosis.category}: ${errorMsg}`);
    }

    return record;
  }

  /**
   * Analyzes an error to determine root cause and actionable recommendations.
   */
  diagnose(task = '', errorMsg = '', tool = '', context = {}) {
    const normTask = String(task).toLowerCase().trim();
    const normErr = String(errorMsg).toLowerCase();

    // 1. Missing App Diagnosis (e.g. "open spotify", "launch discord")
    const appMatch = normTask.match(/^(?:open|launch|start|run)\s+(?:the\s+|my\s+)?([a-z0-9][\w .+&'-]{1,30})/i);
    const rawTarget = context.appName || (appMatch ? appMatch[1] : '');
    const targetApp = String(rawTarget || '').trim().toLowerCase();

    if (
      targetApp &&
      (normErr.includes('not match') || normErr.includes('not installed') || normErr.includes('cannot find') || normErr.includes('not found') || tool === 'open_app')
    ) {
      const appInfo = context.appInfo || APP_CATALOG[targetApp] || APP_CATALOG[targetApp.replace(/\s+/g, '')];
      const displayName = appInfo ? appInfo.name : targetApp.charAt(0).toUpperCase() + targetApp.slice(1);
      const recs = [];

      if (appInfo && appInfo.webUrl) {
        recs.push({
          id: 'open_web',
          label: `🌐 Open ${displayName} Web`,
          description: `Use the full web version of ${displayName} in your browser`,
          actionType: 'open_url',
          payload: { url: appInfo.webUrl },
        });
      }

      if (appInfo && appInfo.wingetId) {
        recs.push({
          id: 'install_winget',
          label: `⬇️ Install ${displayName} (Winget)`,
          description: `Automatically install ${displayName} via Windows Package Manager`,
          actionType: 'run_command',
          payload: { command: `winget install --id ${appInfo.wingetId} -e --accept-package-agreements --accept-source-agreements` },
        });
      }

      if (appInfo && appInfo.storeUrl) {
        recs.push({
          id: 'open_store',
          label: `🏬 Open in Microsoft Store`,
          description: `Install ${displayName} through the official Windows Store`,
          actionType: 'open_url',
          payload: { url: appInfo.storeUrl },
        });
      }

      if (!recs.length) {
        recs.push({
          id: 'search_download',
          label: `🔍 Download ${displayName}`,
          description: `Find official Windows installer on Google`,
          actionType: 'open_url',
          payload: { url: `https://www.google.com/search?q=download+${encodeURIComponent(displayName)}+windows` },
        });
      }

      return {
        category: 'APP_NOT_INSTALLED',
        appName: displayName,
        explanation: `${displayName} is not installed on your Windows PC.`,
        recommendations: recs,
      };
    }

    // 2. Command Not Found / CLI Tool Missing
    if (normErr.includes('is not recognized as an internal or external command') || normErr.includes('cannot find the path')) {
      const cmdMatch = errorMsg.match(/'([^']+)' is not recognized/);
      const missingCmd = cmdMatch ? cmdMatch[1] : 'The command';
      return {
        category: 'COMMAND_NOT_FOUND',
        explanation: `${missingCmd} is not installed or not in your Windows PATH environment.`,
        recommendations: [
          {
            id: 'search_winget',
            label: `🔎 Search ${missingCmd} on Winget`,
            description: `Check if package exists in Windows Package Manager`,
            actionType: 'run_command',
            payload: { command: `winget search ${missingCmd}` },
          },
          {
            id: 'check_env',
            label: `📂 Inspect System PATH`,
            description: `Verify if installed folder is registered in PATH`,
            actionType: 'run_command',
            payload: { command: '$env:PATH -split ";"' },
          },
        ],
      };
    }

    // 3. Permission Denied / Administrator Privileges Required
    if (normErr.includes('access is denied') || normErr.includes('permission denied') || normErr.includes('requires elevation')) {
      return {
        category: 'PERMISSION_DENIED',
        explanation: `Windows prevented this action because it requires elevated Administrator privileges.`,
        recommendations: [
          {
            id: 'run_admin',
            label: `🛡️ Run Elevated PowerShell`,
            description: `Request administrative execution for this task`,
            actionType: 'run_command',
            payload: { command: `Start-Process powershell -Verb RunAs` },
          },
        ],
      };
    }

    // 4. Port Conflict / Address In Use
    if (normErr.includes('eaddrinuse') || normErr.includes('already in use')) {
      return {
        category: 'PORT_IN_USE',
        explanation: `A background process is already occupying the requested network port.`,
        recommendations: [
          {
            id: 'check_ports',
            label: `🔍 Check Active Port Processes`,
            description: `List processes holding local listening ports`,
            actionType: 'run_command',
            payload: { command: `Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess` },
          },
        ],
      };
    }

    // 5. Default Fallback
    return {
      category: 'TASK_FAILURE',
      explanation: errorMsg || 'The operation could not be completed.',
      recommendations: [
        {
          id: 'check_diag',
          label: `📊 Run System Diagnostics`,
          description: `Check CPU, memory, and hardware health`,
          actionType: 'run_task',
          payload: { task: 'Check system diagnostics' },
        },
        {
          id: 'search_web',
          label: `🌐 Search Solution Online`,
          description: `Search web for this specific error`,
          actionType: 'open_url',
          payload: { url: `https://www.google.com/search?q=${encodeURIComponent('Windows error: ' + errorMsg.slice(0, 100))}` },
        },
      ],
    };
  }

  /**
   * Executes a recommended remediation action.
   */
  async executeRecommendation(rec, controller) {
    if (!rec) return { ok: false, error: 'No recommendation provided' };

    if (rec.actionType === 'open_url' && rec.payload && rec.payload.url) {
      if (shell) {
        await shell.openExternal(rec.payload.url);
      } else {
        exec(`start "" "${rec.payload.url.replace(/"/g, '\\"')}"`);
      }
      return { ok: true, message: `Opened: ${rec.payload.url}` };
    }

    if (rec.actionType === 'run_command' && rec.payload && rec.payload.command) {
      return new Promise((resolve) => {
        exec(rec.payload.command, { shell: 'powershell.exe', timeout: 30000 }, (error, stdout, stderr) => {
          resolve({
            ok: !error,
            output: stdout || stderr || (error ? error.message : 'Command executed.'),
            error: error ? error.message : null,
          });
        });
      });
    }

    if (rec.actionType === 'run_task' && rec.payload && rec.payload.task && controller && controller.runTask) {
      return await controller.runTask(rec.payload.task, 'diagnostics');
    }

    return { ok: false, error: 'Unsupported action type' };
  }

  getRecentErrors(limit = 20) {
    return this.errors.slice(-limit).reverse();
  }

  clearErrors() {
    this.errors = [];
    this.saveErrors();
    return { ok: true };
  }
}

let _instance = null;
function getTroubleshooter(deps = {}) {
  if (!_instance) _instance = new Troubleshooter(deps);
  return _instance;
}

module.exports = {
  Troubleshooter,
  getTroubleshooter,
  APP_CATALOG,
};
