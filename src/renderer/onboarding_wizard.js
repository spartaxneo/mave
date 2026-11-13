'use strict';

/**
 * MAVE Minimalist Onboarding Wizard
 * Calm, progressive-disclosure setup flow:
 * 1. Intro slides (Think it through, Keep what works)
 * 2. Gmail / Google authentication (no ghost or anonymous login)
 * 3. Step 1 — Personalize ("Make MAVE yours")
 * 4. Step 2 — Pick a voice (pastel orbs + live preview)
 * 5. Step 3 — Choose Main Computer vs Connect to a Main Computer
 * 6a. Connect via QR / Pair Code / Gmail switcher
 * 6b. Real Hardware Scan + Minimal Feature & AI Model Picker
 * 7. Installing & Setup execution screen
 */

const ONBOARDING_STEPS = [
  { id: 'intro_think', title: 'Think it through, out loud' },
  { id: 'intro_private', title: 'Runs on your terms' },
  { id: 'intro_keep', title: 'Keep what works' },
  { id: 'account', title: 'Create your account' },
  { id: 'device_role', title: 'Where should MAVE live?' },
  { id: 'connect_host', title: 'Connect to a Main Computer' },
  { id: 'device_models', title: 'What fits your computer' },
  { id: 'personalize', title: 'Make MAVE yours' },
  { id: 'voice', title: 'Pick a voice' },
  { id: 'installing', title: 'Setting up your MAVE' },
];

const USAGE_OPTIONS = [
  'Work', 'Study', 'Writing', 'Coding', 'Everyday life', 'Creative projects', 'Health and fitness',
];

const ANSWER_STYLES = [
  { id: 'short', title: 'Short and direct', desc: 'The answer first, in a few lines' },
  { id: 'balanced', title: 'Balanced', desc: 'The answer, then the why' },
  { id: 'detailed', title: 'Detailed', desc: 'Steps, examples and the reasons' },
];

const VOICE_OPTIONS = [
  { id: 'nova', name: 'Nova', desc: 'Bright and warm', grad: 'linear-gradient(135deg, #6ee7b7, #93c5fd)' },
  { id: 'alloy', name: 'Alloy', desc: 'Balanced and calm', grad: 'linear-gradient(135deg, #93c5fd, #c4b5fd)' },
  { id: 'shimmer', name: 'Shimmer', desc: 'Soft and clear', grad: 'linear-gradient(135deg, #fbcfe8, #fde68a)' },
  { id: 'onyx', name: 'Onyx', desc: 'Deep and steady', grad: 'linear-gradient(135deg, #c4b5fd, #a5b4fc)' },
  { id: 'echo', name: 'Echo', desc: 'Quick and conversational', grad: 'linear-gradient(135deg, #fed7aa, #fca5a5)' },
  { id: 'bf_emma', name: 'Emma', desc: 'Light and articulate', grad: 'linear-gradient(135deg, #a7f3d0, #bfdbfe)' },
];

const RESOURCE_SAVING_OPTIONS = [
  {
    id: 'storage',
    title: 'Save Storage',
    badge: 'On-Demand Packages',
    icon: '💾',
    tag: 'Lean Disk',
    desc: 'If you want to save storage and do not have problem with network, MAVE will download skills and packages according to the need and will uninstall or remove them when they are of no use.',
    highlights: ['Downloads on-demand when requested', 'Auto-uninstalls & purges unused tool caches', 'Keeps your hard drive free'],
  },
  {
    id: 'network',
    title: 'Save Network',
    badge: 'Pre-cache & Offline',
    icon: '🌐',
    tag: 'Bandwidth Saver',
    desc: 'Pre-caches your selected AI models, neural voices, and core tool packages on disk so they are never re-downloaded. Zero repetitive data usage and fully offline-ready.',
    highlights: ['Keeps packages permanently on disk', 'Zero repeat downloads or surprise data spikes', 'Reliable offline operation'],
  },
  {
    id: 'compute',
    title: 'Save Compute Power',
    badge: 'Keep PC Fast & Cool',
    icon: '⚡',
    tag: 'Max Headroom',
    desc: 'Leaves maximum CPU & GPU headroom for your other apps and gaming. Prioritizes lightweight models and throttles heavy background daemons.',
    highlights: ['Leaves CPU/GPU free for games & work', 'Prioritizes lightweight AI models', 'Low background duty cycle'],
  },
  {
    id: 'electricity',
    title: 'Save Electricity',
    badge: 'Eco & Battery Saver',
    icon: '🔋',
    tag: 'Energy Efficient',
    desc: 'Optimizes power consumption and caps background wattage. Aggressively sleeps idle tasks to maximize laptop battery life and run quietly.',
    highlights: ['Aggressive idle sleep for GPU/VRAM', 'Caps background wattage for laptops', 'Silent & cool operation'],
  },
];

const FEATURE_FOOTPRINTS = {
  personalNas: {
    label: 'Personal NAS & Private Cloud',
    desc: 'Access this PC\'s drives, files & vault from any device or browser.',
    storageGB: 0.1, ramGB: 0.2, cpuNote: 'Low CPU',
  },
  multiOsHost: {
    label: 'Multi-OS Virtual Computers',
    desc: 'Host isolated Linux, Ubuntu & Windows VMs without touching your mouse.',
    storageGB: 1.2, ramGB: 1.5, cpuNote: 'Medium RAM',
  },
  multiAgentDeploy: {
    label: 'Multi-Agent Swarm & Daemons',
    desc: 'Deploy parallel AI agents, background jobs & automated workflows.',
    storageGB: 0.05, ramGB: 0.3, cpuNote: 'Low CPU',
  },
  remoteAnywhere: {
    label: 'Access From Anywhere',
    desc: 'Secure Web Portal, QR Phone Bridge, Cloudflare Tunnel, Telegram & API.',
    storageGB: 0.0, ramGB: 0.1, cpuNote: 'Minimal',
  },
  voiceAndHud: {
    label: 'Voice & Dynamic Island Notch',
    desc: 'Offline Whisper speech, neural voices & macOS-style Dynamic Notch.',
    storageGB: 0.26, ramGB: 0.3, cpuNote: 'Low CPU',
  },
  gpuComputeCluster: {
    label: 'GPU Mesh & Dev CLI Bridge',
    desc: 'Pool GPUs across your PCs (Exo Cluster) & bridge local developer CLIs.',
    storageGB: 0.0, ramGB: 0.2, cpuNote: 'Minimal',
  },
};

function formatGB(gb) {
  if (!gb || gb <= 0) return '0 MB';
  if (gb < 1) return `~${Math.round(gb * 1024)} MB`;
  return `~${gb.toFixed(1)} GB`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class OnboardingWizard {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' && typeof document !== 'undefined'
      ? document.getElementById(container)
      : container;
    this.options = options;
    this.api = options.api || (typeof window !== 'undefined' ? window.buddy : null);

    this.stepId = 'intro_think';
    this.authMode = 'create'; // 'create' | 'signin'
    this.showPassword = false;
    this.authStatus = { type: '', message: '' };
    this.user = null;

    this.state = {
      userName: '',
      email: '',
      password: '',
      usageTags: ['Work', 'Everyday life'],
      responseStyle: 'balanced',
      resourceSavingGoal: 'storage', // 'storage' | 'network' | 'compute' | 'electricity'
      voice: 'nova',
      deviceRole: 'host', // 'host' | 'companion'
      selectedModels: ['phi-4-mini'],
      autoModelRouting: true,
      airllmEnabled: false,
      cloudFallback: true,
      localModel: 'phi-4-mini',
      features: {
        personalNas: true,
        multiOsHost: true,
        multiAgentDeploy: true,
        remoteAnywhere: true,
        voiceAndHud: true,
        gpuComputeCluster: true,
      },
      installedSkills: ['windows-ops', 'git-ops', 'docker-ops', 'debug-ops'],
      knowledgeVaultDir: '',
      hostAddress: '',
      hostPin: '',
      hostOwnerGmail: '',
    };

    this.hwScan = null;
    this.localStatus = null;
    this.compatibleCatalog = [];
    this.onlineSearchQuery = '';
    this.showCompatibleCatalog = false;
    this.onlineSearchResults = [];
    this.onlineSearchLoading = false;
    this.onlineSearchError = '';
    this.addedOnlineModels = [];
    this.skillsCatalog = [];
    this.skillSearchQuery = '';
    this.vaultDocsCount = 0;
    this.kbNoteText = '';
    this.kbStatusMsg = '';
    this.meshDevices = [];
    this.lanPeers = [];
    this.previewingVoice = null;
    this.qrStream = null;
    this.qrTimer = null;
    this.installLog = [];
    this.installDone = false;
    this.installError = '';
    this.downloadPct = 0;
    this.downloadDetail = '';
    this.isCellular = false;
    this.cellularChoice = null; // null | 'wait_wifi' | 'download_now'
    this.waitingForWifi = false;
    this.bgDownloadStarted = false;
    this.bgDownloadStatus = '';
    this._wifiListenerActive = false;
    this._wifiInterval = null;
  }

  _isSignedIn(u = this.user) {
    return Boolean(u && u.uid && !u.isAnonymous && (u.email || u.providerId === 'google.com' || u.displayName));
  }

  async init() {
    if (this.api && this.api.invoke) {
      try {
        const [s, u] = await Promise.all([
          this.api.invoke('settings:get').catch(() => null),
          this.api.invoke('firebase:get-user').catch(() => null),
        ]);
        if (s) {
          if (s.userName) this.state.userName = s.userName;
          if (Array.isArray(s.usageTags) && s.usageTags.length) this.state.usageTags = s.usageTags;
          if (s.responseStyle) this.state.responseStyle = s.responseStyle;
          if (s.voice && VOICE_OPTIONS.some((v) => v.id === s.voice)) this.state.voice = s.voice;
          if (s.deviceRole) this.state.deviceRole = s.deviceRole;
          if (typeof s.airllmEnabled === 'boolean') this.state.airllmEnabled = s.airllmEnabled;
          if (s.hostAddress) this.state.hostAddress = s.hostAddress;
          if (s.hostEmail) this.state.hostOwnerGmail = s.hostEmail;
        }
        const activeUser = this._isSignedIn(u) ? u : (s && this._isSignedIn(s.authUser) ? s.authUser : null);
        if (activeUser) {
          this.user = activeUser;
          this.state.email = activeUser.email || (s && s.userEmail) || '';
          if (!this.state.userName) this.state.userName = activeUser.displayName || (this.state.email ? this.state.email.split('@')[0] : '');
          // Already logged in: skip intro and role/model steps, jump straight to calibrating & background setup
          this.stepId = 'calibrating';
          this._startBackgroundModelCalibration();
        }
      } catch {}
    }
    this.render();
  }

  _stopCamera() {
    if (this.qrTimer) { clearInterval(this.qrTimer); this.qrTimer = null; }
    if (this.qrStream) {
      try { this.qrStream.getTracks().forEach((t) => t.stop()); } catch {}
      this.qrStream = null;
    }
  }

  _progressIndex() {
    if (this.stepId === 'account') return 0;
    if (['calibrating', 'device_role', 'connect_host', 'device_models'].includes(this.stepId)) return 1;
    if (this.stepId === 'personalize') return 2;
    if (['voice', 'installing'].includes(this.stepId)) return 3;
    return 0;
  }

  _go(nextStepId) {
    if (this._isSignedIn() && (nextStepId === 'account' || nextStepId.startsWith('intro_'))) {
      nextStepId = 'calibrating';
    }
    // Streamlined flow: skip manual model picker & device role steps
    if (nextStepId === 'device_role' || nextStepId === 'device_models') {
      nextStepId = 'calibrating';
    }
    this._stopCamera();
    this.stepId = nextStepId;
    if (nextStepId === 'calibrating') {
      this._startBackgroundModelCalibration();
      this.render();
      return;
    }
    if (nextStepId === 'connect_host') {
      this._loadAuthorizedHosts();
    }
    if (nextStepId === 'installing') {
      this.render();
      this._runInstallation();
      return;
    }
    this.render();
  }

  async _detectCellularConnection() {
    if (typeof window !== 'undefined' && typeof window.__MAVE_SIMULATE_CELLULAR__ === 'boolean') {
      return window.__MAVE_SIMULATE_CELLULAR__;
    }
    if (typeof this.simulateCellular === 'boolean') {
      return this.simulateCellular;
    }

    if (typeof navigator !== 'undefined' && navigator.connection) {
      const conn = navigator.connection;
      if (
        conn.type === 'cellular' ||
        Boolean(conn.saveData) ||
        (conn.effectiveType && ['2g', '3g', 'slow-2g'].includes(conn.effectiveType))
      ) {
        return true;
      }
    }

    if (this.api && this.api.invoke) {
      try {
        const netStatus = await this.api.invoke('network:status');
        if (netStatus && netStatus.isCellular) {
          return true;
        }
      } catch {}
    }

    return false;
  }

  async _startBackgroundModelCalibration() {
    if (!this.hwScan) {
      await this._scanDevice();
    }

    // Select single certified core brain (Phi-4-mini 3.8B or tier-matched model)
    const opts = (this.hwScan && Array.isArray(this.hwScan.options)) ? this.hwScan.options : [];
    const bestModel = opts.find((o) => o.id === 'phi-4-mini') || opts[0] || {
      id: 'phi-4-mini',
      label: 'Phi-4-mini 3.8B Sovereign Brain',
      bytes: 2.49 * (1024 ** 3),
      memoryGB: 4.2,
    };
    this.state.selectedModels = [bestModel.id];
    this.state.localModel = bestModel.id;
    this.state.autoModelRouting = true;
    this.state.deviceRole = 'host';

    // Check if already installed
    const installed = new Set(
      Array.isArray(this.localStatus?.installedModels)
        ? this.localStatus.installedModels
        : (this.localStatus?.installed ? [this.localStatus.installed] : [])
    );
    if (installed.has(bestModel.id)) {
      this.bgDownloadStatus = 'Installed on disk';
      this.downloadPct = 100;
      this.downloadDetail = 'Brain verified and ready locally.';
      this.render();
      return;
    }

    // Cellular internet check before downloading
    const isCell = await this._detectCellularConnection();
    this.isCellular = isCell;

    if (isCell && !this.cellularChoice) {
      this.render();
      return;
    }

    if (this.cellularChoice === 'wait_wifi') {
      this.waitingForWifi = true;
      this.bgDownloadStatus = 'Waiting for Wi-Fi connection...';
      this._setupWifiListener();
      this.render();
      return;
    }

    this._triggerModelDownload(bestModel.id);
  }

  _setupWifiListener() {
    if (this._wifiListenerActive) return;
    this._wifiListenerActive = true;

    const checkWifiAndResume = async () => {
      if (!this.waitingForWifi) return;
      const isCell = await this._detectCellularConnection();
      if (!isCell) {
        this.waitingForWifi = false;
        this.cellularChoice = 'download_now';
        const bestModelId = this.state.selectedModels[0] || 'phi-4-mini';
        this._triggerModelDownload(bestModelId);
        this.render();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', checkWifiAndResume);
      if (typeof navigator !== 'undefined' && navigator.connection) {
        navigator.connection.addEventListener('change', checkWifiAndResume);
      }
      this._wifiInterval = setInterval(checkWifiAndResume, 2500);
    }
  }

  async _triggerModelDownload(modelId) {
    if (this.bgDownloadStarted) return;
    this.bgDownloadStarted = true;
    this.bgDownloadStatus = `Downloading MAVE Core Brain (${modelId})...`;
    if (this.downloadPct < 5) this.downloadPct = 5;
    this.downloadDetail = 'Connecting to model repository (~2.5 GB)...';
    this.render();

    if (this.api && this.api.on) {
      this.api.on('local:progress', (st) => {
        if (st && (!st.modelId || st.modelId === modelId) && typeof st.percent === 'number') {
          this.downloadPct = Math.max(0, Math.min(100, Math.round(st.percent)));
          const bytesStr = st.downloadedBytes && st.totalBytes
            ? `${(st.downloadedBytes / (1024 ** 2)).toFixed(0)} MB / ${(st.totalBytes / (1024 ** 2)).toFixed(0)} MB`
            : `${this.downloadPct}%`;
          this.downloadDetail = st.installed ? 'Installed and verified on disk' : `Downloading: ${bytesStr}`;
          this.bgDownloadStatus = st.installed ? 'Core Brain ready' : `Downloading ${modelId} (${this.downloadPct}%)`;
          this._updateProgressDOM();
        }
      });
    }

    if (this.api && this.api.invoke) {
      await this.api.invoke('local:start', modelId, { airllmEnabled: Boolean(this.state.airllmEnabled) }).catch(() => {
        this.bgDownloadStatus = 'Download queued';
      });
    }
  }

  _updateProgressDOM() {
    const fill = document.getElementById('onb-calib-fill');
    if (fill) fill.style.width = `${this.downloadPct}%`;
    const fillBg = document.getElementById('onb-bg-fill');
    if (fillBg) fillBg.style.width = `${this.downloadPct}%`;
    const pct = document.getElementById('onb-calib-pct');
    if (pct) pct.textContent = `${this.downloadPct}%`;
    const det = document.getElementById('onb-calib-detail');
    if (det) det.textContent = this.downloadDetail;
    const bgText = document.getElementById('onb-bg-text');
    if (bgText) bgText.textContent = `Installing MAVE Brain in background: ${this.downloadPct}%`;
  }

  async _scanDevice() {
    if (!this.api || !this.api.invoke) return;
    try {
      const [hwRes, stRes] = await Promise.all([
        this.api.invoke('local:hardware').catch(() => null),
        this.api.invoke('local:status').catch(() => null),
      ]);
      this.hwScan = hwRes || { hardware: { ramGB: 8, gpu: 'Integrated', freeDiskGB: null, cpu: '' }, pick: 'qwen3-vl-4b', options: [], compatibleCatalog: [] };
      this.localStatus = stRes || {};
      this.compatibleCatalog = Array.isArray(this.hwScan.compatibleCatalog) ? this.hwScan.compatibleCatalog : [];
      const opts = Array.isArray(this.hwScan.options) ? this.hwScan.options : [];
      const certifiedIds = new Set([...opts, ...this.compatibleCatalog].map((o) => o.id));
      const rawInstalled = Array.isArray(this.localStatus.installedModels)
        ? this.localStatus.installedModels
        : (this.localStatus.installed ? [this.localStatus.installed] : []);
      const installed = rawInstalled.filter((id) => certifiedIds.has(id));
      const freeDisk = this.hwScan.hardware?.freeDiskGB;
      const ram = Number(this.hwScan.hardware?.ramGB) || 0;

      if (installed.length) {
        this.state.selectedModels = [...installed];
        // Pre-populate extra certified models if already installed on disk
        for (const id of installed) {
          const extra = this.compatibleCatalog.find((c) => c.id === id && !c.default);
          if (extra && !this.addedOnlineModels.some((a) => a.id === extra.id)) {
            this.addedOnlineModels.push(extra);
          }
        }
      } else {
        const rec = opts.find((o) => o.recommended && o.available) || opts.find((o) => o.available);
        this.state.selectedModels = rec ? [rec.id] : [];
      }
      this.state.localModel = this.state.selectedModels[0] || 'cloud';

      // Auto-tune heavy features gently for constrained PCs while leaving user in full control
      if (ram > 0 && ram < 8) this.state.features.multiOsHost = false;
      if (freeDisk != null && freeDisk < 4) this.state.selectedModels = [];
    } catch {}
    // device_features and skills consolidated into device_models
    if (this.stepId === 'device_models') this.render();
  }

  async _loadSkillsCatalog() {
    if (!this.api || !this.api.invoke) return;
    try {
      const res = await this.api.invoke('skills:catalog').catch(() => null);
      if (res && res.ok) {
        this.skillsCatalog = Array.isArray(res.skills) ? res.skills : [];
        if (Array.isArray(res.installed) && res.installed.length) {
          this.state.installedSkills = [...res.installed];
        }
        if (res.vaultDir && !this.state.knowledgeVaultDir) {
          this.state.knowledgeVaultDir = res.vaultDir;
        }
        this.vaultDocsCount = Number(res.vaultDocsCount) || 0;
      }
    } catch {}
    if (this.stepId === 'device_models') this.render();
  }

  _isModelAvailable(m) {
    if (!m) return false;
    if (m.diskOk === false) return false;
    return this.state.airllmEnabled
      ? Boolean(m.fitsWithAirllm ?? m.fitsWithoutAirllm ?? m.available)
      : Boolean(m.fitsWithoutAirllm ?? (m.airllmOnly ? false : m.available));
  }

  _modelBlockedReason(m) {
    if (!m) return 'Incompatible with this PC';
    if (m.diskOk === false && m.blockedReason) return m.blockedReason;
    if (m.airllmOnly && !this.state.airllmEnabled) {
      return m.fitsWithAirllm ? 'Enable AirLLM to unlock' : (m.blockedReason || 'Not enough disk/RAM');
    }
    return this.state.airllmEnabled
      ? (m.blockedWithAirllm || m.blockedReason || 'Cannot run on this PC')
      : (m.blockedWithoutAirllm || m.blockedReason || 'Requires more memory/disk');
  }

  _pruneUnavailableSelectedModels() {
    const pool = [
      ...((this.hwScan && Array.isArray(this.hwScan.options)) ? this.hwScan.options : []),
      ...(this.compatibleCatalog || []),
      ...(this.addedOnlineModels || []),
    ];
    this.state.selectedModels = (this.state.selectedModels || []).filter((id) => {
      const m = pool.find((x) => x.id === id);
      return m ? this._isModelAvailable(m) : false;
    });
    this.addedOnlineModels = (this.addedOnlineModels || []).filter((m) => this._isModelAvailable(m));
    this.state.localModel = this.state.selectedModels[0] || 'cloud';
  }

  _selectedModelLabels() {
    const pool = [
      ...((this.hwScan && Array.isArray(this.hwScan.options)) ? this.hwScan.options : []),
      ...(this.compatibleCatalog || []),
      ...(this.addedOnlineModels || []),
    ];
    return (this.state.selectedModels || []).map((id) => {
      const m = pool.find((x) => x.id === id);
      return m ? (m.label || m.name || id) : id;
    });
  }

  async _loadAuthorizedHosts() {
    if (!this.api || !this.api.invoke) return;
    try {
      const [devRes, topoRes] = await Promise.all([
        this.api.invoke('firebase:get-devices').catch(() => null),
        this.api.invoke('mesh:get-topology').catch(() => null),
      ]);
      this.meshDevices = (devRes && Array.isArray(devRes.devices)) ? devRes.devices : [];
      this.lanPeers = (topoRes && Array.isArray(topoRes.contributors)) ? topoRes.contributors : [];
    } catch {}
    if (this.stepId === 'connect_host') this.render();
  }

  render() {
    if (!this.container) return;
    const prog = this._progressIndex();
    const isIntro = ['intro_think', 'intro_private', 'intro_keep'].includes(this.stepId);
    const showBack = this.stepId !== 'intro_think' && this.stepId !== 'installing' && !(this.stepId === 'device_role' && this._isSignedIn());

    const topRight = isIntro
      ? `<button type="button" class="onb-skip-btn" id="onb-skip-intro">Skip</button>`
      : this.stepId === 'voice'
        ? `<button type="button" class="onb-skip-btn" id="onb-skip-voice">Skip</button>`
        : `<span></span>`;

    const topLeft = this.stepId === 'intro_think'
      ? `<span class="onb-wordmark">mave</span>`
      : showBack
        ? `<button type="button" class="onb-back-btn" id="onb-back-btn" aria-label="Back">
             <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 12L6 8l4-4"/></svg>
           </button>`
        : `<span class="onb-wordmark">mave</span>`;

    const segBar = prog > 0
      ? `<div class="onb-seg-track">
           <div class="onb-seg ${prog >= 1 ? 'done' : ''}"></div>
           <div class="onb-seg ${prog >= 2 ? 'done' : ''}"></div>
           <div class="onb-seg ${prog >= 3 ? 'done' : ''}"></div>
         </div>`
      : '';

    this.container.innerHTML = `
      <div class="onb-shell">
        <header class="onb-topbar">
          ${topLeft}
          ${topRight}
        </header>
        ${segBar}
        <main class="onb-main">
          ${this._renderBody()}
        </main>
        ${this._renderBottomDock()}
      </div>
    `;
    this._bindEvents();
  }

  _renderBottomDock() {
    switch (this.stepId) {
      case 'intro_think':
      case 'intro_private':
      case 'intro_keep':
        return `
          <footer class="onb-bottom-dock">
            <div class="onb-dots">
              <span class="onb-dot ${this.stepId === 'intro_think' ? 'on' : ''}"></span>
              <span class="onb-dot ${this.stepId === 'intro_private' ? 'on' : ''}"></span>
              <span class="onb-dot ${this.stepId === 'intro_keep' ? 'on' : ''}"></span>
            </div>
            <button type="button" class="onb-btn-pill" id="onb-intro-next">Get started</button>
            <button type="button" class="onb-link-muted" id="onb-have-account">I have an account</button>
          </footer>
        `;

      case 'account': {
        const signedIn = this._isSignedIn();
        if (signedIn) {
          return `
            <footer class="onb-bottom-dock">
              <button type="button" class="onb-btn-pill" id="onb-auth-continue">Continue</button>
              <button type="button" class="onb-link-muted" id="onb-auth-switch">Use a different Gmail account</button>
            </footer>
          `;
        }
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-link-muted" id="onb-toggle-auth-mode" style="margin-top:0;">
              ${this.authMode === 'create' ? 'Already have an account? <strong>Sign in</strong>' : 'Need an account? <strong>Create account</strong>'}
            </button>
          </footer>
        `;
      }

      case 'personalize':
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-btn-pill" id="onb-personalize-next">Continue</button>
          </footer>
        `;

      case 'calibrating':
        return '';

      case 'voice':
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-btn-pill" id="onb-voice-next">Set up MAVE</button>
          </footer>
        `;

      case 'device_role':
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-btn-pill" id="onb-role-next">Continue</button>
          </footer>
        `;

      case 'connect_host':
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-btn-pill" id="onb-connect-next">Continue</button>
          </footer>
        `;

      case 'device_models': {
        if (!this.hwScan) return '';
        const totals = this._computeFootprint();
        const freeDisk = this.hwScan.hardware?.freeDiskGB;
        const diskExceeded = freeDisk != null && totals.downloadGB > freeDisk;
        const selectedNames = this._selectedModelLabels();
        const namesText = selectedNames.length ? selectedNames.join(', ') : 'Cloud AI only';
        return `
          <footer class="onb-bottom-dock">
            <div class="onb-summary-bar" style="align-items:flex-start; gap:10px;">
              <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(namesText)}"><strong>Selected (${selectedNames.length}):</strong> ${escapeHtml(namesText)}</span>
              <strong style="flex:none; ${diskExceeded ? 'color:#dc2626;' : ''}">${formatGB(totals.downloadGB)}${freeDisk != null ? ` / ${Math.round(freeDisk)} GB free` : ''}</strong>
            </div>
            <button type="button" class="onb-btn-pill" id="onb-models-next" ${diskExceeded ? 'disabled' : ''}>Continue</button>
          </footer>
        `;
      }

      case 'installing':
        return `
          <footer class="onb-bottom-dock">
            <button type="button" class="onb-btn-pill" id="onb-finish-launch" ${!this.installDone && this.installLog.length === 0 ? 'disabled' : ''}>
              ${this.installDone ? 'Start chatting' : 'Continue into MAVE'}
            </button>
          </footer>
        `;

      default:
        return '';
    }
  }

  _renderBody() {
    switch (this.stepId) {
      case 'intro_think':
        return `
          <div class="onb-hero-stage">
            <div class="onb-orb"></div>
            <h1 class="onb-h1">Think it through, out loud</h1>
            <p class="onb-sub" style="margin-bottom:0;">Ask anything by typing or talking. MAVE shows its thinking and answers step by step.</p>
          </div>
        `;

      case 'intro_private':
        return `
          <div class="onb-hero-stage">
            <div class="onb-pillar-card">
              <div class="onb-pillar-row"><span>On-device AI &amp; voice</span><span class="onb-pillar-meta">Local-first</span></div>
              <div class="onb-pillar-row"><span>Isolated workspace</span><span class="onb-pillar-meta">Virtual PC</span></div>
              <div class="onb-pillar-row"><span>Connect your devices</span><span class="onb-pillar-meta">Gmail sync</span></div>
            </div>
            <h1 class="onb-h1">Runs on your terms</h1>
            <p class="onb-sub" style="margin-bottom:0;">Use your PC as MAVE's main home, or connect another laptop in seconds — installing only what you pick.</p>
          </div>
        `;

      case 'intro_keep':
        return `
          <div class="onb-hero-stage">
            <div class="onb-preview-card">
              <div class="onb-preview-banner">
                <div class="onb-preview-banner-head">
                  <span>MAVE</span>
                  <span>Workspace</span>
                </div>
              </div>
              <div class="onb-preview-title">
                <span>Review a workspace folder</span>
                <span class="onb-preview-uses">Saved workflow</span>
              </div>
              <div class="onb-preview-body">Check <span class="onb-hl">key files</span> inside <span class="onb-hl">my project</span><br>for clarity, bugs and<br><span class="onb-hl">clean next steps</span></div>
            </div>
            <h1 class="onb-h1">Keep what works</h1>
            <p class="onb-sub" style="margin-bottom:0;">Save instructions, meet specialist tools and keep your work organized across sessions.</p>
          </div>
        `;

      case 'account': {
        const isCreate = this.authMode === 'create';
        const signedIn = this._isSignedIn();
        if (signedIn) {
          return `
            <div class="onb-page">
              <h1 class="onb-h1">Signed in with Gmail</h1>
              <p class="onb-sub">Your chats, prompts and connected computers sync to <strong>${escapeHtml(this.user.email)}</strong>.</p>
              <div class="onb-card selected" style="cursor:default;">
                <div class="onb-card-main">
                  <div class="onb-card-title">${escapeHtml(this.user.displayName || this.user.email.split('@')[0])} <span class="onb-tag good">Verified Gmail</span></div>
                  <div class="onb-card-desc">${escapeHtml(this.user.email)}</div>
                </div>
              </div>
            </div>
          `;
        }
        return `
          <div class="onb-page">
            <h1 class="onb-h1">${isCreate ? 'Create your account' : 'Sign in to MAVE'}</h1>
            <p class="onb-sub">Your chats, prompts and voice settings, on every device.</p>

            ${isCreate ? `
              <div style="margin-bottom:10px;">
                <input type="text" class="onb-input" id="onb-auth-name" placeholder="Your name" value="${escapeHtml(this.state.userName)}">
              </div>
            ` : ''}

            <div style="margin-bottom:10px;">
              <input type="email" class="onb-input" id="onb-auth-email" placeholder="Gmail address" value="${escapeHtml(this.state.email)}">
            </div>

            <div class="onb-input-wrap" style="margin-bottom:16px;">
              <input type="${this.showPassword ? 'text' : 'password'}" class="onb-input" id="onb-auth-pass" placeholder="Password" value="${escapeHtml(this.state.password)}">
              <button type="button" class="onb-eye-btn" id="onb-toggle-pw" aria-label="Toggle password visibility">
                ${this.showPassword
                  ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                  : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                }
              </button>
            </div>

            <button type="button" class="onb-btn-pill" id="onb-auth-submit">${isCreate ? 'Create account' : 'Sign in'}</button>

            <div class="onb-divider">or</div>

            <button type="button" class="onb-btn-soft" id="onb-google-btn">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              <span>Continue with Google</span>
            </button>

            <div style="text-align:center; font-size:11.5px; color:#6b7280; margin-top:14px;">Sign in with your Gmail / Google account to keep everything synced across devices.</div>
            <div class="onb-status-msg ${this.authStatus.type}" id="onb-auth-status" style="text-align:center;">${escapeHtml(this.authStatus.message)}</div>
          </div>
        `;
      }

      case 'personalize':
        return `
          <div class="onb-page">
            <h1 class="onb-h1">Make MAVE yours</h1>
            <p class="onb-sub">Customize how MAVE speaks, behaves, and manages your computer's resources.</p>

            ${(this.bgDownloadStarted || this.waitingForWifi) ? `
              <div class="onb-bg-install-bar">
                <div class="onb-bg-install-info">
                  <span class="onb-bg-install-icon">${this.waitingForWifi ? '📶' : '🧠'}</span>
                  <span id="onb-bg-text">
                    ${this.waitingForWifi
                      ? 'Waiting for Wi-Fi to install MAVE Brain (~2.5 GB) · Auto-downloads on Wi-Fi'
                      : `Installing MAVE Brain in background: ${this.downloadPct || 0}%`}
                  </span>
                </div>
                <div class="onb-bg-install-track">
                  <div class="onb-bg-install-fill" id="onb-bg-fill" style="width:${this.waitingForWifi ? 0 : (this.downloadPct || 0)}%;"></div>
                </div>
              </div>
            ` : ''}

            <label class="onb-label" for="onb-call-name" style="margin-top:4px;">What should MAVE call you?</label>
            <input type="text" class="onb-input" id="onb-call-name" placeholder="Your name" value="${escapeHtml(this.state.userName)}">

            <label class="onb-label">What will you use it for?</label>
            <div class="onb-chips">
              ${USAGE_OPTIONS.map((tag) => `
                <button type="button" class="onb-chip ${this.state.usageTags.includes(tag) ? 'selected' : ''}" data-usage="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
              `).join('')}
            </div>

            <label class="onb-label">How should it answer?</label>
            <div class="onb-stack">
              ${ANSWER_STYLES.map((st) => `
                <button type="button" class="onb-card ${this.state.responseStyle === st.id ? 'selected' : ''}" data-style="${st.id}">
                  <span class="onb-radio"></span>
                  <span class="onb-card-main">
                    <span class="onb-card-title">${escapeHtml(st.title)}</span>
                    <span class="onb-card-desc">${escapeHtml(st.desc)}</span>
                  </span>
                </button>
              `).join('')}
            </div>

            <label class="onb-label" style="margin-top:20px;">What do you want to save more?</label>
            <div class="onb-grid-2">
              ${RESOURCE_SAVING_OPTIONS.map((opt) => {
                const selected = this.state.resourceSavingGoal === opt.id;
                return `
                  <button type="button" class="onb-card onb-save-card ${selected ? 'selected' : ''}" data-save-goal="${opt.id}">
                    <span class="onb-radio"></span>
                    <span class="onb-card-main">
                      <span class="onb-card-title">${opt.icon} ${escapeHtml(opt.title)}</span>
                      <span class="onb-tag ${selected ? 'good' : ''}" style="margin-top:2px;">${escapeHtml(opt.tag)}</span>
                    </span>
                  </button>
                `;
              }).join('')}
            </div>

            ${(() => {
              const activeOpt = RESOURCE_SAVING_OPTIONS.find((o) => o.id === this.state.resourceSavingGoal) || RESOURCE_SAVING_OPTIONS[0];
              return `
                <div class="onb-save-detail-card">
                  <div class="onb-save-detail-head">
                    <span class="onb-save-detail-badge">${activeOpt.icon} ${escapeHtml(activeOpt.badge)}</span>
                    <span class="onb-tag good">Active Policy</span>
                  </div>
                  <div class="onb-save-detail-desc">
                    ${escapeHtml(activeOpt.desc)}
                  </div>
                  <div class="onb-save-detail-meta">
                    ${activeOpt.highlights.map((h) => `<span>✓ ${escapeHtml(h)}</span>`).join('')}
                  </div>
                </div>
              `;
            })()}
          </div>
        `;

      case 'voice':
        return `
          <div class="onb-page">
            <h1 class="onb-h1">Pick a voice</h1>
            <p class="onb-sub">Tap play to hear each one. MAVE uses it in voice mode and when it reads aloud.</p>

            ${(this.bgDownloadStarted || this.waitingForWifi) ? `
              <div class="onb-bg-install-bar">
                <div class="onb-bg-install-info">
                  <span class="onb-bg-install-icon">${this.waitingForWifi ? '📶' : '🧠'}</span>
                  <span id="onb-bg-text">
                    ${this.waitingForWifi
                      ? 'Waiting for Wi-Fi to install MAVE Brain (~2.5 GB) · Auto-downloads on Wi-Fi'
                      : `Installing MAVE Brain in background: ${this.downloadPct || 0}%`}
                  </span>
                </div>
                <div class="onb-bg-install-track">
                  <div class="onb-bg-install-fill" id="onb-bg-fill" style="width:${this.waitingForWifi ? 0 : (this.downloadPct || 0)}%;"></div>
                </div>
              </div>
            ` : ''}

            <div class="onb-stack">
              ${VOICE_OPTIONS.map((v) => `
                <div class="onb-card ${this.state.voice === v.id ? 'selected' : ''}" data-voice-row="${v.id}">
                  <div class="onb-voice-sphere" style="background: ${v.grad};">
                    <span class="onb-voice-check">✓</span>
                  </div>
                  <div class="onb-card-main">
                    <div class="onb-card-title">${escapeHtml(v.name)}</div>
                    <div class="onb-card-desc">${escapeHtml(v.desc)}</div>
                  </div>
                  <button type="button" class="onb-play-btn ${this.previewingVoice === v.id ? 'playing' : ''}" data-preview-voice="${v.id}" aria-label="Preview ${escapeHtml(v.name)}">
                    ${this.previewingVoice === v.id
                      ? '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>'
                      : '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="5,3.5 12.5,8 5,12.5"/></svg>'
                    }
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        `;

      case 'device_role':
        return `
          <div class="onb-page">
            <h1 class="onb-h1">Where should MAVE live?</h1>
            <p class="onb-sub">Choose whether MAVE runs directly on this computer, or connects to another computer you already set up.</p>
            ${this._isSignedIn() ? `
              <div class="onb-signed-pill">
                <span>Signed in as <strong>${escapeHtml(this.user.email || this.user.displayName || 'Gmail account')}</strong></span>
                <span>·</span>
                <button type="button" class="onb-inline-link" id="onb-role-switch-account">Switch account</button>
              </div>
            ` : ''}

            <div class="onb-explain">
              <strong>What does Main Computer mean?</strong> Think of it as MAVE's home base. It keeps your files, runs AI models using your computer's power, and stays available to your other devices. Connecting a second laptop keeps that laptop fast with almost zero storage used.
            </div>

            <div class="onb-stack">
              <button type="button" class="onb-card ${this.state.deviceRole === 'host' ? 'selected' : ''}" data-role="host">
                <span class="onb-radio"></span>
                <span class="onb-card-main">
                  <span class="onb-card-title">Make this my Main Computer <span class="onb-tag good">Recommended</span></span>
                  <span class="onb-card-desc">We will scan your PC first, show what fits safely, and let you pick only the features you want installed.</span>
                </span>
              </button>

              <button type="button" class="onb-card ${this.state.deviceRole === 'companion' ? 'selected' : ''}" data-role="companion">
                <span class="onb-radio"></span>
                <span class="onb-card-main">
                  <span class="onb-card-title">Connect to a Main Computer</span>
                  <span class="onb-card-desc">Pair with another computer by scanning its QR code or using your Gmail to switch between hosts anytime.</span>
                </span>
              </button>
            </div>
          </div>
        `;

      case 'connect_host':
        return `
          <div class="onb-page">
            <h1 class="onb-h1">Connect to a Main Computer</h1>
            <p class="onb-sub">Scan the QR code from your Main Computer, or switch using your Gmail permission.</p>

            <div class="onb-explain">
              <strong>1. Scan QR Code or Enter Pair Code</strong>
              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="onb-chip" id="onb-qr-cam-btn">Scan QR with Camera</button>
                <button type="button" class="onb-chip" id="onb-scan-wifi-btn">Find on Wi-Fi</button>
              </div>
              <video id="onb-qr-video" class="onb-qr-video" hidden autoplay muted playsinline></video>
              <div class="onb-status-msg" id="onb-qr-status"></div>
              <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-top:8px;">
                <input type="text" class="onb-input" id="onb-host-addr" placeholder="Main PC address (e.g. 192.168.1.25:4040)" value="${escapeHtml(this.state.hostAddress)}">
                <input type="text" class="onb-input" id="onb-host-pin" placeholder="PIN (e.g. 8080)" value="${escapeHtml(this.state.hostPin)}">
              </div>
            </div>

            ${this.lanPeers.length ? `
              <div style="margin-bottom:16px;">
                <div class="onb-label" style="margin-top:0;">Found on this Wi-Fi</div>
                <div class="onb-stack">
                  ${this.lanPeers.map((p) => `
                    <button type="button" class="onb-card ${this.state.hostAddress === p.address ? 'selected' : ''}" data-lan-addr="${escapeHtml(p.address || '')}">
                      <span class="onb-radio"></span>
                      <span class="onb-card-main">
                        <span class="onb-card-title">${escapeHtml(p.hostname || p.deviceId || p.address)}</span>
                        <span class="onb-card-desc">${escapeHtml(p.address || 'Local Network')}</span>
                      </span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div class="onb-explain">
              <strong>2. Switch via Gmail Anytime</strong>
              <p style="margin:4px 0 10px; color:#64748b;">Any Main Computer linked to your Gmail (${escapeHtml(this.state.email || 'signed in')}) or approved by another owner appears here.</p>
              ${this.meshDevices.length ? `
                <div class="onb-stack" style="margin-bottom:10px;">
                  ${this.meshDevices.map((d) => `
                    <button type="button" class="onb-card ${this.state.hostAddress === d.lanAddress ? 'selected' : ''}" data-gmail-host="${escapeHtml(d.lanAddress || d.id)}">
                      <span class="onb-radio"></span>
                      <span class="onb-card-main">
                        <span class="onb-card-title">${escapeHtml(d.name || d.platform || 'Linked PC')} <span class="onb-tag good">Your Gmail</span></span>
                        <span class="onb-card-desc">${escapeHtml(d.lanAddress || 'Cloud synced')}</span>
                      </span>
                    </button>
                  `).join('')}
                </div>
              ` : ''}
              <input type="email" class="onb-input" id="onb-owner-gmail" placeholder="Or enter Main Computer owner's Gmail to request access" value="${escapeHtml(this.state.hostOwnerGmail)}">
            </div>

            <div class="onb-status-msg" id="onb-connect-err"></div>
          </div>
        `;

      case 'calibrating': {
        const hw = this.hwScan?.hardware || {};
        const gpuName = (hw.gpu || 'Hardware').replace(/^NVIDIA\s+GeForce\s+/i, '');
        const vram = hw.dedicated ? `${hw.vramGB || 0} GB VRAM` : 'Shared RAM';
        const bestModel = (this.hwScan?.options || []).find((o) => o.id === 'phi-4-mini') || (this.hwScan?.options || [])[0] || {
          id: 'phi-4-mini',
          label: 'Phi-4-mini 3.8B Sovereign Brain',
          bytes: 2.49 * (1024 ** 3),
        };
        const sizeGB = ((bestModel.bytes || 0) / (1024 ** 3)).toFixed(1) || '2.5';

        return `
          <div class="onb-hero-stage" style="max-width:480px; margin:0 auto; text-align:center;">
            <div class="onb-orb pulsing" style="width:104px; height:104px; margin:0 auto 22px auto;"></div>
            <h1 class="onb-h1" style="font-size:24px; margin-bottom:8px;">Calibrating MAVE Intelligence…</h1>
            <p class="onb-sub" style="margin-bottom:18px;">
              ${this.waitingForWifi
                ? 'MAVE is paused and waiting for Wi-Fi connection to download the core brain.'
                : 'Configuring your dedicated 25-year-old sovereign brain and specialist delegation network.'}
            </p>

            <div class="onb-calib-hw-pill">
              <span>⚡ ${escapeHtml(gpuName)} (${escapeHtml(vram)})</span>
              <span>·</span>
              <span>🧠 ${escapeHtml(bestModel.label || 'Phi-4-mini 3.8B')} (~${sizeGB} GB)</span>
            </div>

            ${this.isCellular && !this.cellularChoice ? `
              <div class="onb-cellular-alert">
                <div class="onb-cellular-icon">📶</div>
                <div class="onb-cellular-content">
                  <div class="onb-cellular-title">Cellphone / Mobile Internet Detected</div>
                  <div class="onb-cellular-desc">
                    To install MAVE's brain locally on your device, it will need <strong>~${sizeGB} GB</strong> of internet data.
                  </div>
                  <div class="onb-cellular-actions">
                    <button type="button" class="onb-btn onb-btn-primary" id="onb-wifi-wait-btn">
                      Install when I connect to Wi-Fi
                    </button>
                    <button type="button" class="onb-btn onb-btn-secondary" id="onb-cellular-continue-btn">
                      Download now on mobile data
                    </button>
                  </div>
                </div>
              </div>
            ` : this.waitingForWifi ? `
              <div class="onb-wifi-waiting-card">
                <div class="onb-wifi-waiting-head">
                  <span class="onb-pulse-dot" style="background:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,0.25);"></span>
                  <span style="font-weight:600; font-size:13px; color:#d97706;">Waiting for Wi-Fi Connection</span>
                </div>
                <div style="font-size:12px; color:var(--onb-muted); margin-top:6px; line-height:1.45;">
                  MAVE will automatically start downloading the local brain as soon as this device connects to Wi-Fi. In the meantime, you can customize your preferences!
                </div>
              </div>
              <button type="button" class="onb-btn onb-btn-primary" id="onb-calib-continue-btn" style="width:100%; margin-top:18px;">
                Continue to Make MAVE Yours →
              </button>
            ` : `
              <div class="onb-calib-progress-card">
                <div class="onb-calib-progress-meta">
                  <span class="onb-calib-progress-title">Installing MAVE Core Brain in Background</span>
                  <span class="onb-calib-progress-pct" id="onb-calib-pct">${this.downloadPct || 0}%</span>
                </div>
                <div class="onb-progress-bar">
                  <div class="onb-progress-fill" id="onb-calib-fill" style="width:${this.downloadPct || 0}%;"></div>
                </div>
                <div class="onb-calib-progress-detail" id="onb-calib-detail">
                  ${escapeHtml(this.downloadDetail || 'Downloading ~2.5 GB · Zero cloud dependency once installed')}
                </div>
              </div>
              <button type="button" class="onb-btn onb-btn-primary" id="onb-calib-continue-btn" style="width:100%; margin-top:18px;">
                Continue to Make MAVE Yours →
              </button>
            `}
          </div>
        `;
      }

      case 'device_models': {
        if (!this.hwScan) {
          return `
            <div class="onb-hero-stage">
              <div class="onb-orb pulsing" style="width:104px; height:104px; margin-bottom:22px;"></div>
              <h1 class="onb-h1" style="font-size:24px;">Calibrating MAVE Intelligence…</h1>
              <p class="onb-sub" style="margin-bottom:0;">Scanning your GPU, VRAM and memory to match the optimal AI brain.</p>
            </div>
          `;
        }
        const hw = this.hwScan.hardware || {};
        const ramGB = Number(hw.ramGB) || 0;
        const vramGB = hw.dedicated ? Number(hw.vramGB) || 0 : 0;
        const freeDiskGB = hw.freeDiskGB;
        const options = Array.isArray(this.hwScan.options) ? this.hwScan.options : [];
        const installedSet = new Set(
          Array.isArray(this.localStatus?.installedModels)
            ? this.localStatus.installedModels
            : (this.localStatus?.installed ? [this.localStatus.installed] : [])
        );

        // Quality-Controlled Tier Selection: Phi-4-mini is MAVE's 25-year-old sovereign core brain
        const bestModel = options.find((o) => o.id === 'phi-4-mini' && o.available)
          || options.find((o) => o.id === (this.state.selectedModels[0] || this.hwScan.pick))
          || options.find((o) => o.recommended && o.available)
          || options.find((o) => o.available)
          || options[0]
          || { id: 'phi-4-mini', label: 'Phi-4-mini 3.8B Sovereign Brain', bytes: 2.49 * (1024 ** 3), capabilities: '25-year-old executive brain, screen control, everyday tasks & specialist model communication', memoryGB: 4.2 };

        if (!this.state.selectedModels.length || !this.state.selectedModels.includes(bestModel.id)) {
          this.state.selectedModels = [bestModel.id];
          this.state.localModel = bestModel.id;
          this.state.autoModelRouting = true;
        }

        const gpuTitle = (hw.gpu || 'Integrated Graphics').replace(/^NVIDIA\s+GeForce\s+/i, '');
        const gpuSub = vramGB > 0 ? `${vramGB} GB VRAM` : 'Shared RAM';
        const cpuShort = (hw.cpu || 'Multi-core CPU').split(' · ')[0].replace(/6-Core Processor|12-Core Processor/i, '').trim();
        const cpuThreads = (hw.cpu || '').includes('·') ? (hw.cpu.split(' · ')[1] || '').trim() : 'Ready';

        const sizeGB = (bestModel.bytes || 0) / (1024 ** 3);
        const memNeed = Number(bestModel.memoryGB) || (bestModel.id.includes('30b') ? 21 : bestModel.id.includes('8b') ? 7.2 : 4.2);
        const isInstalled = installedSet.has(bestModel.id);
        const tpsLabel = bestModel.tokensPerSecMin && bestModel.tokensPerSecMax
          ? `${bestModel.tokensPerSecMin}–${bestModel.tokensPerSecMax} tok/s`
          : '~32–50 tok/s';

        return `
          <div class="onb-page">
            <h1 class="onb-h1">Your MAVE Intelligence Setup</h1>
            <p class="onb-sub">MAVE analyzed your computer and configured the optimal local brain and specialist delegation network.</p>

            <div class="onb-hw-strip">
              <div class="onb-hw-pill">
                <div class="onb-hw-k">Graphics Card</div>
                <div class="onb-hw-v">${escapeHtml(gpuTitle)}</div>
                <div class="onb-hw-s">${escapeHtml(gpuSub)}</div>
              </div>
              <div class="onb-hw-pill">
                <div class="onb-hw-k">Memory</div>
                <div class="onb-hw-v">${ramGB ? `${ramGB} GB RAM` : 'Unknown'}</div>
                <div class="onb-hw-s">${ramGB >= 16 ? 'Multi-task ready' : 'Compact tier'}</div>
              </div>
              <div class="onb-hw-pill">
                <div class="onb-hw-k">Processor</div>
                <div class="onb-hw-v">${escapeHtml(cpuShort)}</div>
                <div class="onb-hw-s">${escapeHtml(cpuThreads)}</div>
              </div>
              <div class="onb-hw-pill">
                <div class="onb-hw-k">Free Disk</div>
                <div class="onb-hw-v">${freeDiskGB != null ? `${Math.round(freeDiskGB)} GB` : 'Available'}</div>
                <div class="onb-hw-s">${freeDiskGB != null && freeDiskGB < 10 ? 'Compact tier' : 'Ready'}</div>
              </div>
            </div>

            <label class="onb-label" style="margin-top:4px;">1. Certified Core Local Brain (Matched to your PC)</label>
            <div class="onb-stack">
              <div class="onb-card selected" style="cursor:default; border-color:var(--onb-ink);">
                <span class="onb-check" style="background:var(--onb-ink); border-color:var(--onb-ink); color:#ffffff;">✓</span>
                <span class="onb-card-main">
                  <span class="onb-card-title">${escapeHtml(bestModel.label)} <span class="onb-tag good">Core Sovereign Brain ✓</span></span>
                  <span class="onb-card-desc">MAVE's dedicated 25-year-old on-device executive brain. Operates screen reading, mouse and keyboard control, daily triage, and acts as the master communication hub directing specialist models.</span>
                  <span class="onb-card-meta-line">
                    <span>${isInstalled ? 'Installed on disk' : formatGB(sizeGB || bestModel.diskNeedGB)} · ${memNeed} GB VRAM/RAM</span>
                    ${bestModel.gpuLabel ? `<span>${escapeHtml(bestModel.gpuLabel)}</span>` : ''}
                    <span>~${escapeHtml(tpsLabel)}</span>
                    <span style="color:#059669; font-weight:600;">Zero Cloud Dependency</span>
                  </span>
                </span>
              </div>
            </div>

            <!-- Master Orchestrator: 25-Year-Old Executive Brain & Specialist Delegation -->
            <label class="onb-label" style="margin-top:16px;">2. Master Orchestrator &amp; Specialist AI Network</label>
            <div class="onb-orchestrator-card onb-router-info-card">
              <div class="onb-orchestrator-head">
                <div class="onb-orchestrator-badge">
                  <span class="onb-pulse-dot"></span>
                  <span>MAVE Master Conductor (Phi-4-mini 3.8B Brain)</span>
                </div>
                <span class="onb-tag good">Quality Controlled</span>
              </div>
              <div class="onb-orchestrator-desc">
                Phi-4-mini acts as MAVE's 25-year-old resident executive: controlling the screen, mouse, and keyboard, managing daily tasks, and seamlessly dispatching work to specialized AI models on-demand.
              </div>
              <div class="onb-specialist-grid">
                <div class="onb-specialist-row">
                  <div class="onb-specialist-icon">💻</div>
                  <div class="onb-specialist-content">
                    <div class="onb-specialist-title">Specialist Coding Engine <span class="onb-tag">Qwen 2.5-Coder · Gemini Hydrogen · Claude</span></div>
                    <div class="onb-specialist-desc">Phi-4-mini formulates exact technical specs, directs coding models, verifies syntax, runs unit tests in the sandbox, and learns from results.</div>
                  </div>
                </div>
                <div class="onb-specialist-row">
                  <div class="onb-specialist-icon">📐</div>
                  <div class="onb-specialist-content">
                    <div class="onb-specialist-title">Specialist Reasoning &amp; Logic <span class="onb-tag">DeepSeek-R1-Distill · OpenAI o1</span></div>
                    <div class="onb-specialist-desc">Dispatches complex math, logic proofs, and financial audits, capturing step-by-step thinking for verified conclusions.</div>
                  </div>
                </div>
                <div class="onb-specialist-row">
                  <div class="onb-specialist-icon">🔍</div>
                  <div class="onb-specialist-content">
                    <div class="onb-specialist-title">Specialist Deep Research Engine <span class="onb-tag">ChatGPT Deep Research · Perplexity</span></div>
                    <div class="onb-specialist-desc">Dispatches complex research queries, cross-verifies multi-source citations, and synthesizes structured notes.</div>
                  </div>
                </div>
                <div class="onb-specialist-row">
                  <div class="onb-specialist-icon">👁️</div>
                  <div class="onb-specialist-content">
                    <div class="onb-specialist-title">Specialist Document &amp; Vision Engine <span class="onb-tag">Qwen 2.5-VL</span></div>
                    <div class="onb-specialist-desc">Extracts dense tables, invoices, receipts, and spatial UI bounding boxes with pixel-level precision.</div>
                  </div>
                </div>
              </div>
            </div>

            <label class="onb-label" style="margin-top:18px;">3. MAVE Platform Features (NAS, Multi-OS, Agents, Remote)</label>
            <div class="onb-feat-grid">
              ${Object.entries(FEATURE_FOOTPRINTS).map(([key, meta]) => {
                const on = Boolean(this.state.features[key]);
                return `
                  <button type="button" class="onb-card ${on ? 'selected' : ''}" data-feature-toggle="${key}">
                    <span class="onb-card-main">
                      <span class="onb-card-title">${escapeHtml(meta.label)} <span class="onb-tag">${formatGB(meta.storageGB)} · ${escapeHtml(meta.cpuNote)}</span></span>
                      <span class="onb-card-desc">${escapeHtml(meta.desc)}</span>
                    </span>
                    <span class="onb-switch"></span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      case 'installing':
        return `
          <div class="onb-hero-stage">
            <div class="onb-orb ${this.installDone ? '' : 'pulsing'}" style="width:116px; height:116px; margin-bottom:22px;"></div>
            <h1 class="onb-h1">${this.installDone ? 'MAVE is ready' : 'Setting up your MAVE'}</h1>
            <p class="onb-sub" style="margin-bottom:8px;">${this.installDone ? 'Everything you selected is configured.' : 'Installing only the features you picked…'}</p>

            <div class="onb-install-list">
              ${this.installLog.map((item) => `
                <div class="onb-install-row">
                  <span>${escapeHtml(item.label)}</span>
                  <span class="onb-tag ${item.state === 'done' ? 'good' : item.state === 'error' ? 'bad' : 'warn'}">${escapeHtml(item.detail)}</span>
                </div>
              `).join('')}
            </div>

            ${this.state.deviceRole === 'host' && this.state.selectedModels.length > 0 && !this.installDone ? `
              <div class="onb-prog-track"><div class="onb-prog-fill" id="onb-dl-fill" style="width:${this.downloadPct}%"></div></div>
            ` : ''}

            ${this.installError ? `<div class="onb-status-msg error">${escapeHtml(this.installError)}</div>` : ''}
          </div>
        `;

      default:
        return '';
    }
  }

  _computeFootprint() {
    let downloadGB = 0;
    let ramGB = 0.6;
    if (this.state.deviceRole === 'host') {
      const opts = [...((this.hwScan && Array.isArray(this.hwScan.options)) ? this.hwScan.options : []), ...(this.addedOnlineModels || [])];
      const installed = new Set(
        Array.isArray(this.localStatus?.installedModels)
          ? this.localStatus.installedModels
          : (this.localStatus?.installed ? [this.localStatus.installed] : [])
      );
      for (const id of (this.state.selectedModels || [])) {
        const pick = opts.find((o) => o.id === id);
        if (pick && !installed.has(pick.id)) downloadGB += (pick.bytes || 0) / (1024 ** 3);
        const mem = Number(pick?.memoryGB) || (id.includes('30b') ? 21 : id.includes('8b') ? 7.2 : 4.2);
        ramGB = Math.max(ramGB, mem + 0.6); // models swap active slots cleanly, so peak RAM tracks the largest selected model
      }
    }
    for (const [k, meta] of Object.entries(FEATURE_FOOTPRINTS)) {
      if (this.state.features[k]) {
        downloadGB += meta.storageGB;
        ramGB = Math.max(ramGB, meta.ramGB + 0.6);
      }
    }
    return { downloadGB, storageGB: downloadGB, ramGB };
  }

  async _runInstallation() {
    this.installDone = false;
    this.installError = '';
    const modelsToInstall = this.state.deviceRole === 'host' ? [...(this.state.selectedModels || [])] : [];
    const tasks = [
      { key: 'prefs', label: 'Save Gmail profile & enabled feature packs', state: 'running', detail: 'Working' },
    ];
    if (this.state.deviceRole === 'companion') {
      tasks.push({ key: 'connect', label: 'Link to Main Computer', state: 'pending', detail: 'Queued' });
    } else {
      if (this.state.features.remoteAnywhere) {
        tasks.push({ key: 'host', label: 'Enable Personal NAS & Remote Access under your Gmail', state: 'pending', detail: 'Queued' });
      }
      modelsToInstall.forEach((mId) => {
        tasks.push({ key: `model:${mId}`, label: `Prepare ${mId}`, state: 'pending', detail: 'Queued' });
      });
    }
    this.installLog = tasks;
    this.render();

    const setTask = (key, state, detail) => {
      const t = this.installLog.find((x) => x.key === key);
      if (t) { t.state = state; t.detail = detail; }
      this.render();
    };

    try {
      if (this.api && this.api.invoke) {
        const primaryLocal = modelsToInstall[0] || '';
        const provider = this.state.deviceRole === 'host' && !primaryLocal ? 'openai' : 'local';
        await this.api.invoke('settings:update', {
          userName: this.state.userName,
          usageTags: this.state.usageTags,
          responseStyle: this.state.responseStyle,
          resourceSavingGoal: this.state.resourceSavingGoal,
          onDemandAssets: this.state.resourceSavingGoal === 'storage',
          autoPruneUnused: this.state.resourceSavingGoal === 'storage',
          precacheAssets: this.state.resourceSavingGoal === 'network',
          lowComputeMode: this.state.resourceSavingGoal === 'compute',
          ecoMode: this.state.resourceSavingGoal === 'electricity',
          voice: this.state.voice,
          speakResponses: this.state.deviceRole === 'host' ? Boolean(this.state.features.voiceAndHud) : true,
          deviceRole: this.state.deviceRole,
          enabledFeatures: this.state.deviceRole === 'host'
            ? this.state.features
            : { personalNas: false, multiOsHost: false, multiAgentDeploy: false, remoteAnywhere: true, voiceAndHud: true, gpuComputeCluster: false },
          installedSkills: this.state.installedSkills || [],
          knowledgeVaultDir: this.state.knowledgeVaultDir || '',
          provider,
          localModel: primaryLocal,
          preferredLocalModels: modelsToInstall,
          autoModelRouting: Boolean(this.state.autoModelRouting),
          airllmEnabled: Boolean(this.state.airllmEnabled),
          hostAddress: this.state.hostAddress,
          hostEmail: this.state.hostOwnerGmail || this.state.email,
        }).catch(() => {});

        await this.api.invoke('personalization:update', {
          responseStyle: this.state.responseStyle,
          usageTags: this.state.usageTags,
          resourceSavingGoal: this.state.resourceSavingGoal,
        }).catch(() => {});

        await this.api.invoke('firebase:sync-device', {
          name: `${this.state.userName || 'My'} PC (${this.state.deviceRole === 'host' ? 'Main Computer' : 'Companion'})`,
          role: this.state.deviceRole,
          email: this.state.email,
          airllmEnabled: Boolean(this.state.airllmEnabled),
          resourceSavingGoal: this.state.resourceSavingGoal,
          hardware: this.hwScan?.hardware || null,
          deviceCapabilities: this.hwScan?.capacitySummary || null,
        }).catch(() => {});
      }
      setTask('prefs', 'done', 'Saved');

      if (this.state.deviceRole === 'companion') {
        setTask('connect', 'running', 'Linking…');
        if (this.api && this.api.invoke) {
          if (this.state.hostAddress) {
            await this.api.invoke('mesh:connect-worker', {
              address: this.state.hostAddress,
              pin: this.state.hostPin || '8080',
              ownerEmail: this.state.hostOwnerGmail || this.state.email,
            }).catch(() => {});
          } else if (this.state.hostOwnerGmail) {
            await this.api.invoke('mesh:auto-join', {
              ownerEmail: this.state.hostOwnerGmail,
              requesterEmail: this.state.email,
            }).catch(() => {});
          }
        }
        setTask('connect', 'done', 'Linked');
      } else {
        if (this.state.features.remoteAnywhere) {
          setTask('host', 'running', 'Configuring…');
          if (this.api && this.api.invoke) {
            await this.api.invoke('mesh:set-primary-host', { isPrimary: true }).catch(() => {});
          }
          setTask('host', 'done', 'Ready');
        }
        const installed = new Set(
          Array.isArray(this.localStatus?.installedModels)
            ? this.localStatus.installedModels
            : (this.localStatus?.installed ? [this.localStatus.installed] : [])
        );
        for (const mId of modelsToInstall) {
          const tKey = `model:${mId}`;
          if (installed.has(mId)) {
            setTask(tKey, 'done', 'Installed');
            continue;
          }
          if (this.waitingForWifi) {
            setTask(tKey, 'done', 'Queued for Wi-Fi (auto-downloads on Wi-Fi)');
            continue;
          }
          if (this.bgDownloadStarted && this.downloadPct >= 100) {
            setTask(tKey, 'done', 'Installed');
            continue;
          }
          setTask(tKey, 'running', this.downloadPct > 0 ? `${this.downloadPct}%` : 'Starting download…');
          if (this.api && this.api.invoke) {
            let activeUnSub = null;
            if (this.api.on) {
              activeUnSub = this.api.on('local:progress', (st) => {
                if (st && st.modelId === mId && typeof st.percent === 'number') {
                  this.downloadPct = Math.max(0, Math.min(100, Math.round(st.percent)));
                  const fill = document.getElementById('onb-dl-fill');
                  if (fill) fill.style.width = `${this.downloadPct}%`;
                  const t = this.installLog.find((x) => x.key === tKey);
                  if (t) t.detail = st.installed ? 'Installed' : `${this.downloadPct}%`;
                }
              });
            }
            if (!this.bgDownloadStarted) {
              await this.api.invoke('local:start', mId, { airllmEnabled: Boolean(this.state.airllmEnabled) }).catch(() => {});
            }
            if (activeUnSub) activeUnSub();
          }
          const tDone = this.installLog.find((x) => x.key === tKey);
          if (tDone && tDone.state !== 'done') {
            tDone.state = 'done';
            tDone.detail = this.downloadPct >= 100 ? 'Installed' : 'Downloading in background';
            this.render();
          }
        }
      }

      this.installDone = true;
      this.render();
    } catch (err) {
      this.installError = err.message || 'Setup encountered an issue.';
      this.installDone = true;
      this.render();
    }
  }

  async _completeOnboarding() {
    if (this.api && this.api.invoke) {
      await this.api.invoke('onboarding:finish', {
        launchAtLogin: true,
        userName: this.state.userName,
        usageTags: this.state.usageTags,
        responseStyle: this.state.responseStyle,
        resourceSavingGoal: this.state.resourceSavingGoal,
        onDemandAssets: this.state.resourceSavingGoal === 'storage',
        autoPruneUnused: this.state.resourceSavingGoal === 'storage',
        precacheAssets: this.state.resourceSavingGoal === 'network',
        lowComputeMode: this.state.resourceSavingGoal === 'compute',
        ecoMode: this.state.resourceSavingGoal === 'electricity',
        voice: this.state.voice,
        deviceRole: this.state.deviceRole,
        enabledFeatures: this.state.features,
        installedSkills: this.state.installedSkills || [],
        knowledgeVaultDir: this.state.knowledgeVaultDir || '',
        preferredLocalModels: this.state.selectedModels,
        autoModelRouting: Boolean(this.state.autoModelRouting),
        airllmEnabled: Boolean(this.state.airllmEnabled),
        localModel: (this.state.selectedModels && this.state.selectedModels[0]) || '',
        hostAddress: this.state.hostAddress,
        hostEmail: this.state.hostOwnerGmail || this.state.email,
        hostPin: this.state.hostPin,
      }).catch(() => {});
    }
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = 'app.html?section=home';
    }
  }

  _bindEvents() {
    const $ = (id) => document.getElementById(id);

    if ($('onb-back-btn')) {
      $('onb-back-btn').onclick = () => {
        const prev = {
          intro_private: 'intro_think',
          intro_keep: 'intro_private',
          account: 'intro_keep',
          calibrating: 'account',
          device_role: 'account',
          connect_host: 'device_role',
          device_models: 'device_role',
          personalize: 'calibrating',
          voice: 'personalize',
        }[this.stepId];
        if (prev) this._go(prev);
      };
    }

    if ($('onb-skip-intro')) {
      $('onb-skip-intro').onclick = () => this._go('account');
    }
    if ($('onb-skip-voice')) {
      $('onb-skip-voice').onclick = () => this._go('installing');
    }
    if ($('onb-have-account')) {
      $('onb-have-account').onclick = () => {
        this.authMode = 'signin';
        this._go('account');
      };
    }
    if ($('onb-intro-next')) {
      $('onb-intro-next').onclick = () => {
        const nextIntro = {
          intro_think: 'intro_private',
          intro_keep: 'account',
        }[this.stepId] || 'account';
        this._go(nextIntro);
      };
    }

    // Account Step (Gmail Only) -> goes straight to calibrating and background installation
    if ($('onb-auth-continue')) {
      $('onb-auth-continue').onclick = () => this._go('calibrating');
    }
    if ($('onb-auth-switch')) {
      $('onb-auth-switch').onclick = async () => {
        if (this.api && this.api.invoke) {
          await this.api.invoke('firebase:sign-out').catch(() => {});
          await this.api.invoke('settings:update', { authUser: null, userEmail: '' }).catch(() => {});
        }
        this.user = null;
        this.state.email = '';
        this.authStatus = { type: '', message: '' };
        this.render();
      };
    }
    if ($('onb-role-switch-account')) {
      $('onb-role-switch-account').onclick = async () => {
        if (this.api && this.api.invoke) {
          await this.api.invoke('firebase:sign-out').catch(() => {});
          await this.api.invoke('settings:update', { authUser: null, userEmail: '' }).catch(() => {});
        }
        this.user = null;
        this.state.email = '';
        this.authMode = 'signin';
        this.authStatus = { type: '', message: '' };
        this._go('account');
      };
    }
    if ($('onb-toggle-auth-mode')) {
      $('onb-toggle-auth-mode').onclick = () => {
        this.authMode = this.authMode === 'create' ? 'signin' : 'create';
        this.authStatus = { type: '', message: '' };
        this.render();
      };
    }
    if ($('onb-toggle-pw')) {
      $('onb-toggle-pw').onclick = () => {
        this.showPassword = !this.showPassword;
        this.render();
      };
    }
    if ($('onb-auth-name')) $('onb-auth-name').oninput = (e) => { this.state.userName = e.target.value; };
    if ($('onb-auth-email')) $('onb-auth-email').oninput = (e) => { this.state.email = e.target.value; };
    if ($('onb-auth-pass')) $('onb-auth-pass').oninput = (e) => { this.state.password = e.target.value; };

    if ($('onb-google-btn')) {
      $('onb-google-btn').onclick = async () => {
        this.authStatus = { type: '', message: 'Opening Google sign-in…' };
        this.render();
        try {
          const res = await this.api.invoke('firebase:google-oauth');
          if (res && res.ok && res.user && !res.user.isAnonymous) {
            this.user = res.user;
            this.state.email = res.user.email || '';
            if (!this.state.userName) this.state.userName = res.user.displayName || this.state.email.split('@')[0];
            this.authStatus = { type: 'ok', message: `Signed in as ${this.state.email}` };
            if (this.api && this.api.invoke) {
              await this.api.invoke('settings:update', {
                userName: this.state.userName,
                userEmail: this.state.email,
                hostEmail: this.state.email,
                authUser: {
                  uid: res.user.uid,
                  email: res.user.email,
                  displayName: res.user.displayName,
                  photoUrl: res.user.photoUrl || '',
                  providerId: res.user.providerId || 'google.com',
                  isAnonymous: false,
                },
              }).catch(() => {});
            }
            this._go('calibrating');
          } else {
            this.authStatus = { type: 'error', message: res?.error || res?.message || 'Google sign-in did not complete.' };
            this.render();
          }
        } catch (err) {
          this.authStatus = { type: 'error', message: err.message || 'Google sign-in failed.' };
          this.render();
        }
      };
    }

    if ($('onb-auth-submit')) {
      $('onb-auth-submit').onclick = async () => {
        const email = this.state.email.trim();
        const password = this.state.password;
        const name = this.state.userName.trim();
        if (!/^[^\s@]+@(gmail|googlemail)\.com$/i.test(email)) {
          this.authStatus = { type: 'error', message: 'Please use a Gmail address (@gmail.com) or click Continue with Google.' };
          this.render();
          return;
        }
        if (!password || password.length < 6) {
          this.authStatus = { type: 'error', message: 'Password must be at least 6 characters.' };
          this.render();
          return;
        }
        this.authStatus = { type: '', message: 'Signing in…' };
        this.render();
        try {
          const ch = this.authMode === 'create' ? 'firebase:sign-up' : 'firebase:sign-in';
          const res = await this.api.invoke(ch, { email, password, displayName: name || email.split('@')[0] });
          if (res && res.ok && res.user) {
            this.user = res.user;
            this.state.email = res.user.email || email;
            if (!this.state.userName) this.state.userName = res.user.displayName || email.split('@')[0];
            if (this.api && this.api.invoke) {
              await this.api.invoke('settings:update', {
                userName: this.state.userName,
                userEmail: this.state.email,
                hostEmail: this.state.email,
                authUser: {
                  uid: res.user.uid,
                  email: res.user.email || email,
                  displayName: res.user.displayName || this.state.userName,
                  photoUrl: res.user.photoUrl || '',
                  providerId: 'password',
                  isAnonymous: false,
                },
              }).catch(() => {});
            }
            this._go('calibrating');
          } else {
            this.authStatus = { type: 'error', message: res?.error || 'Could not sign in with that Gmail account.' };
            this.render();
          }
        } catch (err) {
          this.authStatus = { type: 'error', message: err.message || 'Authentication failed.' };
          this.render();
        }
      };
    }

    // Calibrating & Cellular Wi-Fi events
    if ($('onb-wifi-wait-btn')) {
      $('onb-wifi-wait-btn').onclick = () => {
        this.cellularChoice = 'wait_wifi';
        this.waitingForWifi = true;
        this._setupWifiListener();
        this.render();
      };
    }
    if ($('onb-cellular-continue-btn')) {
      $('onb-cellular-continue-btn').onclick = () => {
        this.cellularChoice = 'download_now';
        this.waitingForWifi = false;
        const bestModelId = this.state.selectedModels[0] || 'phi-4-mini';
        this._triggerModelDownload(bestModelId);
        this.render();
      };
    }
    if ($('onb-calib-continue-btn')) {
      $('onb-calib-continue-btn').onclick = () => {
        this._go('personalize');
      };
    }

    // Step 1: Personalize
    if ($('onb-call-name')) $('onb-call-name').oninput = (e) => { this.state.userName = e.target.value; };
    this.container.querySelectorAll('[data-usage]').forEach((btn) => {
      btn.onclick = () => {
        const tag = btn.getAttribute('data-usage');
        const idx = this.state.usageTags.indexOf(tag);
        if (idx >= 0) this.state.usageTags.splice(idx, 1);
        else this.state.usageTags.push(tag);
        this.render();
      };
    });
    this.container.querySelectorAll('[data-style]').forEach((btn) => {
      btn.onclick = () => {
        this.state.responseStyle = btn.getAttribute('data-style');
        this.render();
      };
    });
    this.container.querySelectorAll('[data-save-goal]').forEach((btn) => {
      btn.onclick = () => {
        const goal = btn.getAttribute('data-save-goal');
        if (goal) {
          this.state.resourceSavingGoal = goal;
          this.render();
        }
      };
    });
    if ($('onb-personalize-next')) {
      $('onb-personalize-next').onclick = () => {
        if (!this.state.userName.trim()) this.state.userName = (this.state.email.split('@')[0] || 'Friend');
        this._go('voice');
      };
    }

    // Step 2: Voice
    this.container.querySelectorAll('[data-voice-row]').forEach((row) => {
      row.onclick = () => {
        this.state.voice = row.getAttribute('data-voice-row');
        this.render();
      };
    });
    this.container.querySelectorAll('[data-preview-voice]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const vid = btn.getAttribute('data-preview-voice');
        this.previewingVoice = vid;
        this.state.voice = vid;
        this.render();
        if (this.api && this.api.invoke) {
          this.api.invoke('voice:preview', vid).catch(() => {});
        }
        setTimeout(() => {
          if (this.previewingVoice === vid) {
            this.previewingVoice = null;
            this.render();
          }
        }, 2200);
      };
    });
    if ($('onb-voice-next')) $('onb-voice-next').onclick = () => this._go('installing');

    // Step 3: Device Role (Main Computer vs Connect)
    this.container.querySelectorAll('[data-role]').forEach((btn) => {
      btn.onclick = () => {
        this.state.deviceRole = btn.getAttribute('data-role');
        this.render();
      };
    });
    if ($('onb-role-next')) {
      $('onb-role-next').onclick = () => {
        this._go(this.state.deviceRole === 'companion' ? 'connect_host' : 'device_models');
      };
    }

    // Branch A: Connect to Host (QR / Wi-Fi / Gmail)
    if ($('onb-host-addr')) $('onb-host-addr').oninput = (e) => { this.state.hostAddress = e.target.value; };
    if ($('onb-host-pin')) $('onb-host-pin').oninput = (e) => { this.state.hostPin = e.target.value; };
    if ($('onb-owner-gmail')) $('onb-owner-gmail').oninput = (e) => { this.state.hostOwnerGmail = e.target.value; };

    this.container.querySelectorAll('[data-lan-addr]').forEach((btn) => {
      btn.onclick = () => {
        this.state.hostAddress = btn.getAttribute('data-lan-addr') || '';
        this.render();
      };
    });
    this.container.querySelectorAll('[data-gmail-host]').forEach((btn) => {
      btn.onclick = () => {
        this.state.hostAddress = btn.getAttribute('data-gmail-host') || '';
        this.render();
      };
    });
    if ($('onb-scan-wifi-btn')) {
      $('onb-scan-wifi-btn').onclick = () => this._loadAuthorizedHosts();
    }
    if ($('onb-qr-cam-btn')) {
      $('onb-qr-cam-btn').onclick = async () => {
        const video = $('onb-qr-video');
        const qrSt = $('onb-qr-status');
        if (this.qrStream) {
          this._stopCamera();
          if (video) video.hidden = true;
          if (qrSt) qrSt.textContent = '';
          return;
        }
        try {
          this.qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (video) {
            video.srcObject = this.qrStream;
            video.hidden = false;
          }
          if (typeof window.BarcodeDetector === 'function') {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            if (qrSt) qrSt.textContent = 'Point your camera at the QR code on your Main Computer…';
            this.qrTimer = setInterval(async () => {
              if (!video || video.readyState < 2) return;
              try {
                const codes = await detector.detect(video);
                if (codes && codes.length) {
                  const raw = codes[0].rawValue || '';
                  try {
                    const parsed = JSON.parse(raw);
                    if (parsed.url || parsed.address) this.state.hostAddress = parsed.url || parsed.address;
                    if (parsed.pin) this.state.hostPin = parsed.pin;
                  } catch {
                    this.state.hostAddress = raw;
                  }
                  this._stopCamera();
                  this.render();
                }
              } catch {}
            }, 400);
          } else if (qrSt) {
            qrSt.textContent = 'Camera preview active. Enter the address and PIN shown on your Main Computer.';
          }
        } catch {
          if (qrSt) qrSt.textContent = 'No camera permission or webcam detected. Enter your Main Computer address & PIN or use Gmail below.';
        }
      };
    }
    if ($('onb-connect-next')) {
      $('onb-connect-next').onclick = () => {
        const errEl = $('onb-connect-err');
        if (!this.state.hostAddress.trim() && !this.state.hostOwnerGmail.trim()) {
          if (errEl) {
            errEl.className = 'onb-status-msg error';
            errEl.textContent = 'Scan a QR code, choose a device, or enter a Main Computer address or owner Gmail.';
          }
          return;
        }
        this._go('personalize');
      };
    }

    // Branch B: Multi-Model Picker & Full Feature Packs
    this.container.querySelectorAll('[data-model-toggle]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const id = btn.getAttribute('data-model-toggle');
        const idx = this.state.selectedModels.indexOf(id);
        if (idx >= 0) this.state.selectedModels.splice(idx, 1);
        else this.state.selectedModels.push(id);
        this.state.localModel = this.state.selectedModels[0] || 'cloud';
        // Smart router is ALWAYS enabled by default, especially when multiple models are selected
        this.state.autoModelRouting = true;
        this.render();
      };
    });
    this.container.querySelectorAll('[data-setting-toggle]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-setting-toggle');
        // Smart router cannot be disabled by user
        if (key === 'autoModelRouting') return;
        this.state[key] = !this.state[key];
        if (key === 'airllmEnabled') {
          this._pruneUnavailableSelectedModels();
        }
        this.render();
      };
    });
    this.container.querySelectorAll('[data-feature-toggle]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-feature-toggle');
        this.state.features[key] = !this.state.features[key];
        this.render();
      };
    });
    if ($('onb-llm-search-input')) {
      $('onb-llm-search-input').oninput = (e) => {
        this.onlineSearchQuery = e.target.value;
        this.onlineSearchResults = [];
        this.showCompatibleCatalog = Boolean(this.onlineSearchQuery.trim());
        this.render();
        const el = document.getElementById('onb-llm-search-input');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      };
      $('onb-llm-search-input').onkeydown = (e) => {
        if (e.key === 'Enter' && $('onb-llm-search-btn')) $('onb-llm-search-btn').click();
      };
    }
    if ($('onb-llm-search-btn')) {
      $('onb-llm-search-btn').onclick = async () => {
        const q = (this.onlineSearchQuery || '').trim();
        if (!q) {
          this.showCompatibleCatalog = !this.showCompatibleCatalog;
          if (this.showCompatibleCatalog && !this.compatibleCatalog.length && this.api?.invoke) {
            const res = await this.api.invoke('local:search-compatible', '').catch(() => null);
            if (res && res.ok && Array.isArray(res.results)) this.compatibleCatalog = res.results;
          }
          this.render();
          return;
        }
        if (this.api?.invoke) {
          const res = await this.api.invoke('local:search-compatible', q).catch(() => null);
          if (res && res.ok && Array.isArray(res.results)) {
            this.onlineSearchResults = res.results;
          }
        }
        this.showCompatibleCatalog = true;
        this.render();
      };
    }
    this.container.querySelectorAll('[data-online-add]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-online-add');
        const entry = (this.compatibleCatalog || []).find((r) => r.id === id)
          || (this.onlineSearchResults || []).find((r) => r.id === id);
        if (!entry || !this._isModelAvailable(entry)) return;
        const alreadySelected = this.state.selectedModels.includes(entry.id);
        if (alreadySelected) {
          this.state.selectedModels = this.state.selectedModels.filter((x) => x !== entry.id);
          this.addedOnlineModels = this.addedOnlineModels.filter((m) => m.id !== entry.id);
        } else {
          if (!this.addedOnlineModels.some((m) => m.id === entry.id)) {
            this.addedOnlineModels.push(entry);
          }
          this.state.selectedModels.push(entry.id);
        }
        this.state.localModel = this.state.selectedModels[0] || 'cloud';
        // Smart router is ALWAYS enabled by default
        this.state.autoModelRouting = true;
        this.render();
      };
    });
    if ($('onb-models-next')) {
      $('onb-models-next').onclick = () => this._go('personalize');
    }

    // Installing Finish
    if ($('onb-finish-launch')) {
      $('onb-finish-launch').onclick = () => this._completeOnboarding();
    }
  }
}

if (typeof window !== 'undefined') {
  window.OnboardingWizard = OnboardingWizard;
  window.ONBOARDING_STEPS = ONBOARDING_STEPS;
  window.RESOURCE_SAVING_OPTIONS = RESOURCE_SAVING_OPTIONS;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OnboardingWizard, ONBOARDING_STEPS, FEATURE_FOOTPRINTS, VOICE_OPTIONS, RESOURCE_SAVING_OPTIONS };
}
