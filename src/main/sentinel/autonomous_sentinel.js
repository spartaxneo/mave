'use strict';
// Autonomous Sentinel, Proactive Sensory Nervous System & Human Activity Journal for Mave.
// Monitors internet connectivity automatically without manual intervention,
// watches for events and incoming messages, tracks desktop activity sessions (Office vs Personal),
// learns human habits over time, and synthesizes daily executive activity summaries
// with full user privacy controls and immutable "Mave" core identity.

const { EventEmitter } = require('events');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { app } = require('electron');
const { getMemoryStore } = require('../memory');

function getSentinelDir() {
  const base = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  const dir = path.join(base, 'sentinel_activity');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const DEFAULT_OFFICE_APPS = new Set([
  'code', 'devenv', 'visualstudio', 'cursor', 'pycharm', 'webstorm', 'sublime_text',
  'terminal', 'powershell', 'cmd', 'windowsterminal', 'git', 'bash', 'githubdesktop',
  'outlook', 'teams', 'slack', 'word', 'excel', 'powerpnt', 'onenote',
  'notion', 'linear', 'jira', 'trello', 'figma', 'postman', 'docker', 'zoom',
  'blender', 'rider', 'clion', 'goland', 'datagrip', 'androidstudio', 'antigravity'
]);

class AutonomousSentinel extends EventEmitter {
  constructor(options = {}) {
    super();
    this.settings = options.settings || null;
    this.windows = options.windows || null;
    this.logger = options.logger || console;

    this.isOnline = null;
    this.networkTimer = null;
    this.activityTimer = null;
    this.summaryTimer = null;

    this.todayDate = new Date().toISOString().slice(0, 10);
    this.todayActivity = this._loadTodayActivity();

    this.init();
  }

  init() {
    this.startNetworkSentinel();
    this.startActivityTracker();
  }

  // ==========================================
  // 1. Proactive Internet & Connectivity Sentinel
  // ==========================================

  startNetworkSentinel() {
    if (this.networkTimer) clearInterval(this.networkTimer);
    // Initial probe
    this.checkConnectivity();
    // Non-blocking poll every 4 seconds
    this.networkTimer = setInterval(() => this.checkConnectivity(), 4000);
  }

  async checkConnectivity() {
    if (this.settings && this.settings.get('onlineSentinelEnabled') === false) {
      return;
    }

    const online = await this._probeInternet();
    const previous = this.isOnline;
    this.isOnline = online;

    if (previous === null) {
      // First boot detection
      this.logger.info(`[AutonomousSentinel] Initial network state: ${online ? 'ONLINE' : 'OFFLINE'}`);
      return;
    }

    if (!previous && online) {
      // Transition: OFFLINE -> ONLINE
      this.logger.info('[AutonomousSentinel] 🌐 Internet connection established automatically!');
      this.emit('online', { timestamp: Date.now() });

      // Proactively trigger connected background tasks
      this._onInternetConnected();

      // Notify windows
      if (this.windows && this.windows.broadcast) {
        this.windows.broadcast('sentinel:network-change', {
          online: true,
          transition: 'connected',
          timestamp: Date.now(),
          message: '🌐 Internet connection detected. Mave is online and synchronizing.',
        });
      }
    } else if (previous && !online) {
      // Transition: ONLINE -> OFFLINE
      this.logger.info('[AutonomousSentinel] 🟡 Internet connection dropped. Sovereign local mode active.');
      this.emit('offline', { timestamp: Date.now() });

      if (this.windows && this.windows.broadcast) {
        this.windows.broadcast('sentinel:network-change', {
          online: false,
          transition: 'disconnected',
          timestamp: Date.now(),
          message: '🟡 Offline mode engaged. Mave is running 100% locally with zero cloud dependencies.',
        });
      }
    }
  }

  _probeInternet() {
    return new Promise((resolve) => {
      // Try fast DNS lookup to high-reliability anycast DNS IP
      dns.lookup('1.1.1.1', (err) => {
        if (!err) return resolve(true);
        // Fallback to secondary check
        dns.lookup('google.com', (err2) => {
          resolve(!err2);
        });
      });
    });
  }

  /**
   * Proactively dispatches queued tasks when internet connects.
   */
  async _onInternetConnected() {
    try {
      // 1. Sync prompt cache if enabled
      try {
        const { getPromptCacheManager } = require('../llm/prompt_cache');
        const pcm = getPromptCacheManager();
        if (pcm) pcm.getStats();
      } catch {}

      // 2. Check for updated model weights in background
      try {
        const { catalog } = require('../local/catalog');
        if (catalog && catalog.scanCustomModels) await catalog.scanCustomModels();
      } catch {}

      // 3. Update dynamic island
      if (this.windows && this.windows.broadcast) {
        this.windows.broadcast('island:update', {
          title: 'Internet Online 🌐',
          mood: 'idle',
        });
      }
    } catch (err) {
      this.logger.error('[AutonomousSentinel] Error in onInternetConnected:', err.message);
    }
  }

  // ==========================================
  // 2. Continuous Activity Tracking (Office vs Personal)
  // ==========================================

  startActivityTracker() {
    if (this.activityTimer) clearInterval(this.activityTimer);
    // Track every 15 seconds
    this.activityTimer = setInterval(() => this.trackActiveSession(), 15000);
  }

  async trackActiveSession() {
    if (this.settings && this.settings.get('activityTrackingEnabled') === false) {
      return;
    }

    // Check date rollover
    const currentDate = new Date().toISOString().slice(0, 10);
    if (currentDate !== this.todayDate) {
      this._archiveDay(this.todayDate);
      this.todayDate = currentDate;
      this.todayActivity = this._loadTodayActivity();
    }

    try {
      const activeWindow = await this._getForegroundWindow();
      if (!activeWindow || !activeWindow.appName) return;

      const appName = String(activeWindow.appName).toLowerCase().trim();
      const title = String(activeWindow.title || '').trim();

      const category = this.classifyApp(appName, title);

      // Accumulate metrics
      this.todayActivity.totalSeconds += 15;
      this.todayActivity.categories[category] = (this.todayActivity.categories[category] || 0) + 15;
      this.todayActivity.apps[appName] = (this.todayActivity.apps[appName] || 0) + 15;

      if (title && !this.todayActivity.recentTitles.some((t) => t.title === title)) {
        this.todayActivity.recentTitles.push({
          app: appName,
          title,
          category,
          timestamp: Date.now(),
        });
        if (this.todayActivity.recentTitles.length > 150) {
          this.todayActivity.recentTitles.shift();
        }
      }

      this._saveTodayActivity();
    } catch {}
  }

  classifyApp(appName, windowTitle = '') {
    const customList = this.settings ? this.settings.get('officeAppsList') : '';
    const officeApps = customList
      ? new Set(customList.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
      : DEFAULT_OFFICE_APPS;

    const lowerApp = appName.toLowerCase();
    const lowerTitle = (windowTitle || '').toLowerCase();

    // 1. Direct Office Process Match
    if (officeApps.has(lowerApp)) return 'office';

    // 2. Browser Window Heuristics
    if (/chrome|msedge|firefox|brave|opera|safari/.test(lowerApp)) {
      const officeKeywords = /github|gitlab|jira|confluence|linear|stack\s?overflow|docs|figma|notion|chatgpt|mave|localhost|vercel|aws|azure|pr\s|pull request|trello|asana|meet|zoom|teams/;
      const personalKeywords = /youtube|netflix|spotify|reddit|twitter|x\.com|instagram|facebook|twitch|tiktok|disney|prime video|steam|roblox|game/;

      if (personalKeywords.test(lowerTitle)) return 'personal';
      if (officeKeywords.test(lowerTitle)) return 'office';
      return 'research';
    }

    // 3. Media & Entertainment
    if (/spotify|vlc|netflix|steam|epicgames|discord|itunes/.test(lowerApp)) {
      return 'personal';
    }

    return 'general';
  }

  _getForegroundWindow() {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        return resolve({ appName: 'Desktop', title: 'Active Window' });
      }

      const script = `
$ErrorActionPreference = 'SilentlyContinue'
$w = Add-Type -MemberDefinition @"
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
"@ -Name "WinApiForeground" -Namespace "MaveNative" -PassThru
$hwnd = [MaveNative.WinApiForeground]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[MaveNative.WinApiForeground]::GetWindowText($hwnd, $sb, 256) | Out-Null
$pid = 0
[MaveNative.WinApiForeground]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$p = Get-Process -Id $pid -ErrorAction SilentlyContinue
[PSCustomObject]@{ appName = $p.ProcessName; title = $sb.ToString() } | ConvertTo-Json -Compress
`;

      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 4000 }, (err, stdout) => {
        if (err || !stdout) return resolve({ appName: 'Desktop', title: 'Desktop' });
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve({ appName: parsed.appName || 'Desktop', title: parsed.title || '' });
        } catch {
          resolve({ appName: 'Desktop', title: 'Desktop' });
        }
      });
    });
  }

  // ==========================================
  // 3. Conversation Tracking & Habit Learning
  // ==========================================

  recordConversation({ prompt, response = '', topic = 'general', source = 'desktop' }) {
    if (this.settings && this.settings.get('conversationTrackingEnabled') === false) {
      return;
    }

    const conv = {
      timestamp: Date.now(),
      prompt: String(prompt || '').slice(0, 500),
      topic,
      source,
    };

    this.todayActivity.conversations.push(conv);
    if (this.todayActivity.conversations.length > 100) this.todayActivity.conversations.shift();

    // Auto-extract and learn user habits into MemoryStore
    this._learnFromConversation(prompt, response);
    this._saveTodayActivity();
  }

  _learnFromConversation(prompt, response) {
    try {
      const memory = getMemoryStore();
      if (!memory) return;

      const pLower = prompt.toLowerCase();
      // Check coding stack
      if (/\b(react|typescript|python|rust|c\+\+|node|docker|kubernetes|golang|flutter|swift)\b/i.test(pLower)) {
        const match = pLower.match(/\b(react|typescript|python|rust|c\+\+|node|docker|kubernetes|golang|flutter|swift)\b/i);
        if (match) {
          memory.remember(`User actively develops with ${match[1].toUpperCase()}`, { topic: 'work_habits', keywords: ['dev', match[1]] });
        }
      }

      // Check communication preference
      if (/\b(brief|concise|bullet points|short|detailed|step by step)\b/i.test(pLower)) {
        const match = pLower.match(/\b(brief|concise|bullet points|short|detailed|step by step)\b/i);
        if (match) {
          memory.remember(`User prefers ${match[1]} style explanations and responses`, { topic: 'rules', keywords: ['preference', 'tone'] });
        }
      }
    } catch {}
  }

  // ==========================================
  // 4. Inbound Message & Event Sentinel
  // ==========================================

  notifyIncomingMessage({ source = 'Telegram', sender = 'User', preview = '', urgent = false }) {
    const payload = {
      id: `msg_${Date.now()}`,
      source,
      sender,
      preview: String(preview || '').slice(0, 240),
      urgent: Boolean(urgent),
      timestamp: Date.now(),
    };

    this.emit('incoming:message', payload);

    if (this.windows && this.windows.broadcast) {
      this.windows.broadcast('sentinel:incoming-activity', payload);
      this.windows.broadcast('island:update', {
        title: `💬 New from ${source}`,
        mood: 'speaking',
      });
    }

    return payload;
  }

  // ==========================================
  // 5. Daily Human Activity & Learning Summary Journal
  // ==========================================

  getDailySummary(dateStr = null) {
    const targetDate = dateStr || this.todayDate;
    const data = targetDate === this.todayDate ? this.todayActivity : this._loadArchivedDay(targetDate);

    const totalSeconds = data.totalSeconds || 0;
    const officeSeconds = data.categories.office || 0;
    const personalSeconds = data.categories.personal || 0;
    const researchSeconds = data.categories.research || 0;
    const generalSeconds = data.categories.general || 0;

    const totalMinutes = Math.round(totalSeconds / 60);
    const officeMinutes = Math.round(officeSeconds / 60);
    const personalMinutes = Math.round(personalSeconds / 60);

    const workRatio = totalMinutes > 0 ? Math.round((officeMinutes / totalMinutes) * 100) : 0;
    const personalRatio = totalMinutes > 0 ? Math.round((personalMinutes / totalMinutes) * 100) : 0;

    // Top applications
    const sortedApps = Object.entries(data.apps || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([app, sec]) => ({ app, minutes: Math.round(sec / 60) }));

    const convCount = (data.conversations || []).length;

    // Structured narrative summary
    const narrative = data.customSummary || this._synthesizeNarrative({
      date: targetDate,
      totalMinutes,
      officeMinutes,
      personalMinutes,
      workRatio,
      personalRatio,
      sortedApps,
      convCount,
    });

    return {
      date: targetDate,
      totalMinutes,
      officeMinutes,
      personalMinutes,
      workRatio,
      personalRatio,
      topApps: sortedApps,
      conversationCount: convCount,
      recentTitles: (data.recentTitles || []).slice(-10),
      narrativeSummary: narrative,
      customSummary: Boolean(data.customSummary),
    };
  }

  _synthesizeNarrative({ date, totalMinutes, officeMinutes, personalMinutes, workRatio, personalRatio, sortedApps, convCount }) {
    if (totalMinutes === 0 && convCount === 0) {
      return `On ${date}, activity tracking was initialized. No desktop sessions or conversations recorded yet.`;
    }

    const hours = (totalMinutes / 60).toFixed(1);
    const topAppsStr = sortedApps.length ? sortedApps.map((a) => `${a.app} (${a.minutes}m)`).join(', ') : 'desktop exploration';

    return `On ${date}, you logged ${hours} hours of active screen time (${workRatio}% Office/Work, ${personalRatio}% Personal). Top tools: ${topAppsStr}. You completed ${convCount} collaborative interaction${convCount === 1 ? '' : 's'} with Mave.`;
  }

  saveDailySummary(dateStr, customText) {
    const targetDate = dateStr || this.todayDate;
    if (targetDate === this.todayDate) {
      this.todayActivity.customSummary = String(customText || '').trim();
      this._saveTodayActivity();
    } else {
      const dayData = this._loadArchivedDay(targetDate);
      dayData.customSummary = String(customText || '').trim();
      const filePath = path.join(getSentinelDir(), `journal_${targetDate}.json`);
      fs.writeFileSync(filePath, JSON.stringify(dayData, null, 2), 'utf8');
    }
    return { ok: true, date: targetDate };
  }

  clearActivityHistory() {
    try {
      const dir = getSentinelDir();
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
      }
      this.todayActivity = this._newDayTemplate(this.todayDate);
      this._saveTodayActivity();
      return { ok: true, message: 'All activity history and journals securely cleared.' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  // ==========================================
  // Storage Helpers
  // ==========================================

  _newDayTemplate(date) {
    return {
      date,
      totalSeconds: 0,
      categories: { office: 0, personal: 0, research: 0, general: 0 },
      apps: {},
      recentTitles: [],
      conversations: [],
      customSummary: null,
    };
  }

  _loadTodayActivity() {
    const filePath = path.join(getSentinelDir(), `journal_${this.todayDate}.json`);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return this._newDayTemplate(this.todayDate);
  }

  _saveTodayActivity() {
    try {
      const filePath = path.join(getSentinelDir(), `journal_${this.todayDate}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.todayActivity, null, 2), 'utf8');
    } catch {}
  }

  _archiveDay(date) {
    this._saveTodayActivity();
  }

  _loadArchivedDay(date) {
    const filePath = path.join(getSentinelDir(), `journal_${date}.json`);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return this._newDayTemplate(date);
  }
}

let _sentinelInstance = null;
function getAutonomousSentinel(options = {}) {
  if (!_sentinelInstance) {
    _sentinelInstance = new AutonomousSentinel(options);
  }
  return _sentinelInstance;
}

module.exports = { AutonomousSentinel, getAutonomousSentinel };
