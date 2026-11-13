'use strict';

/**
 * MAVE Brain Mesh Dashboard & Distributed Compute Ecosystem Controller
 * Integrates into MAVE's ChatGPT-class desktop interface.
 * Controls Primary Host orchestration, P2P KV offload, cluster topology,
 * real-time device telemetry, energy/resource policies, and distributed jobs.
 */

class MeshDashboardController {
  constructor() {
    this.container = null;
    this.settingsContainer = null;
    this.isPrimaryHost = true;
    this.primaryDeviceId = 'host-workstation-01';
    this.activeFilter = 'all'; // 'all' | 'compute' | 'mobile'
    this.lastCommandFeedback = null;
    this.feedbackTimer = null;
    this._unsubscribers = [];
    this.initialized = false;

    // Cluster Topology State (populated exclusively from live backend telemetry)
    this.topology = {
      connectedDevicesCount: 0,
      availableCpuCores: 0,
      totalClusterRamGb: 0,
      vramPoolGb: 0,
      activeJobsCount: 0,
      networkEncryption: 'Ed25519 + HMAC-SHA256 Zero-Trust LAN',
      clusterStatus: 'standby', // 'healthy' | 'degraded' | 'syncing' | 'standby'
      lastSync: null
    };

    // Paired Devices Ecosystem (empty until live backend topology is loaded)
    this.devices = [];

    // Resource Sharing Policies (Governed by mesh_policies.js)
    this.policy = {
      enableComputeSharing: true,
      shareCpu: true,
      shareGpu: true,
      maxCpuPercent: 75,
      ramAllocationLimitGb: 8,
      minReservedRamGb: 4,
      vramBudgetGb: 6,
      shareOnlyWhileIdle: false,
      shareOnlyWhileCharging: true,
      minBatteryPercent: 25,
      thermalProtection: true,
      gamingPriority: true,
      maxBandwidthMbps: 100,
      localNetworkOnly: true,
      approvedWorkloadTypes: [
        'compilation',
        'testing',
        'data_processing',
        'ai_inference',
        'research'
      ],
      paused: false
    };

    // Active Distributed Jobs (empty until real tasks are dispatched)
    this.activeJobs = [];

    // Quick Action Voice Directives
    this.quickChips = [
      { label: 'Use my desktop for this task', command: 'route all active workloads to primary desktop workstation' },
      { label: 'Save my laptop battery', command: 'pause laptop compute sharing and reassign workloads to desktop' },
      { label: 'Stop sharing my GPU', command: 'disable GPU compute sharing and limit mesh to CPU only' },
      { label: 'Show which devices are working', command: 'list active worker devices and workload distribution' },
      { label: 'Distribute this coding task', command: 'distribute monorepo compilation and testing across all paired devices' }
    ];
  }

  /**
   * Initialize and attach to UI
   */
  async init() {
    this.container = document.getElementById('mesh-dashboard-container');
    this.settingsContainer = document.getElementById('mesh-settings-container');

    if (!this.initialized) {
      this._bindIpcListeners();
      this.initialized = true;
    }

    await this.refreshState();
    this.render();
  }

  /**
   * Fetch live state from backend IPC
   */
  async refreshState() {
    if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
      try {
        const top = await window.buddy.invoke('mesh:get-topology');
        if (top && typeof top === 'object') {
          this._applyTopologyData(top);
        }
      } catch (err) {
        // Fallback to mesh:status if get-topology is not yet mounted
        try {
          const st = await window.buddy.invoke('mesh:status');
          if (st && st.mesh) {
            this._applyMeshStatus(st);
          }
        } catch (_) {}
      }

      // Check current primary host status
      try {
        const hostInfo = await window.buddy.invoke('host:info');
        if (hostInfo && typeof hostInfo.isPrimary === 'boolean') {
          this.isPrimaryHost = hostInfo.isPrimary;
        }
      } catch (_) {}
    }
  }

  _normalizeDeviceRecord(dev) {
    if (!dev || typeof dev !== 'object') return null;
    const res = dev.resources || {};
    const id = dev.deviceId || dev.id;
    const role = dev.role || (dev.isHost ? 'primary_host' : 'contributor');
    return {
      id,
      deviceId: id,
      name: dev.name || id || 'Unnamed Node',
      type: (dev.type || 'desktop').toLowerCase(),
      os: dev.os || dev.platform || 'Network Node',
      ip: dev.ip || '127.0.0.1',
      port: dev.port || null,
      isHost: role === 'primary_host' || Boolean(dev.isHost),
      role,
      status: dev.status || 'online',
      cpu: dev.cpu || (res.cpuCores ? `${res.cpuCores} Cores` : 'Not reported'),
      ram: dev.ram || (res.ramGb ? `${res.ramGb} GB RAM` : 'Not reported'),
      gpu: dev.gpu || (res.gpuModel ? `${res.gpuModel}${res.vramGb ? ` (${res.vramGb} GB VRAM)` : ''}` : 'None reported'),
      battery: dev.battery ?? res.batteryPct ?? null,
      isCharging: dev.isCharging ?? res.isCharging ?? true,
      temperatureC: dev.temperatureC ?? res.temperatureC ?? null,
      latencyMs: dev.latencyMs ?? null,
      cpuUsagePct: dev.cpuUsagePct ?? res.cpuUsagePercent ?? 0,
      activeWorkloads: Array.isArray(dev.activeWorkloads)
        ? dev.activeWorkloads
        : (dev.activeJobsCount > 0 ? [`${dev.activeJobsCount} Active Job(s)`] : ['Idle Standby']),
      resources: res,
    };
  }

  _applyTopologyData(top) {
    if (top.devices && Array.isArray(top.devices)) {
      this.devices = top.devices.map((d) => this._normalizeDeviceRecord(d)).filter(Boolean);
    }
    const onlineCount = top.onlineDevicesCount ?? this.devices.filter((d) => d.status !== 'offline').length;
    this.topology = {
      ...this.topology,
      ...(top.topology || {}),
      connectedDevicesCount: onlineCount,
      availableCpuCores: top.totalClusterCores ?? top.totalCores ?? this.topology.availableCpuCores,
      totalClusterRamGb: top.totalClusterRamGb ?? top.totalRamGb ?? this.topology.totalClusterRamGb,
      vramPoolGb: top.totalClusterVramGb ?? top.totalVramGb ?? this.topology.vramPoolGb,
      activeJobsCount: top.activeTasksCount ?? (Array.isArray(top.activeJobs) ? top.activeJobs.length : this.topology.activeJobsCount),
      clusterStatus: onlineCount > 0 ? 'healthy' : 'standby',
      lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    if (top.policy) {
      this.policy = { ...this.policy, ...top.policy };
    }
    if (typeof top.isPrimaryHost === 'boolean') {
      this.isPrimaryHost = top.isPrimaryHost;
    }
    if (top.activeJobs && Array.isArray(top.activeJobs)) {
      this.activeJobs = top.activeJobs;
    }
  }

  _applyMeshStatus(st) {
    const mesh = st.mesh || {};
    if (mesh.devices) {
      // Update device count
      this.topology.connectedDevicesCount = Array.isArray(mesh.devices) ? mesh.devices.length : Object.keys(mesh.devices).length;
    }
  }

  /**
   * Bind event listeners from backend
   */
  _bindIpcListeners() {
    if (typeof window === 'undefined' || !window.buddy || typeof window.buddy.on !== 'function') return;

    try {
      const unsubUpdate = window.buddy.on('mesh:update', (data) => {
        if (!data) return;
        if (data.topology) this.topology = { ...this.topology, ...data.topology };
        if (data.devices) this.devices = data.devices;
        if (data.policy) this.policy = { ...this.policy, ...data.policy };
        this.render();
      });
      this._unsubscribers.push(unsubUpdate);
    } catch (_) {}

    try {
      const unsubJob = window.buddy.on('mesh:job-update', (data) => {
        if (!data) return;
        if (data.jobs && Array.isArray(data.jobs)) {
          this.activeJobs = data.jobs;
        } else if (data.job) {
          const idx = this.activeJobs.findIndex((j) => j.id === data.job.id);
          if (idx >= 0) this.activeJobs[idx] = data.job;
          else this.activeJobs.unshift(data.job);
        }
        this._renderJobsView();
      });
      this._unsubscribers.push(unsubJob);
    } catch (_) {}

    try {
      const unsubTelemetry = window.buddy.on('mesh:device-telemetry', (data) => {
        if (!data || !data.deviceId) return;
        const dev = this.devices.find((d) => d.id === data.deviceId);
        if (dev) {
          Object.assign(dev, data);
          this._renderDevicesGrid();
        }
      });
      this._unsubscribers.push(unsubTelemetry);
    } catch (_) {}
  }

  /**
   * Toggle Primary Host designation
   */
  async togglePrimaryHost(isPrimary) {
    this.isPrimaryHost = isPrimary;
    const msg = isPrimary
      ? 'This device is now the Primary MAVE Host & Orchestrator.'
      : 'This device is set to Satellite Co-Processor mode.';
    this._showFeedback(msg, 'success');

    if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
      try {
        await window.buddy.invoke('mesh:set-primary-host', { isPrimary });
      } catch (err) {
        console.warn('mesh:set-primary-host fallback:', err);
      }
    }
    this.render();
  }

  /**
   * Update a resource policy parameter
   */
  async updatePolicy(patch) {
    this.policy = { ...this.policy, ...patch };
    if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
      try {
        await window.buddy.invoke('mesh:update-policy', patch);
      } catch (err) {
        console.warn('mesh:update-policy fallback:', err);
      }
    }
  }

  /**
   * Execute a Natural Language or Quick Chip Mesh Directive
   */
  async executeQuickAction(commandText) {
    this._showFeedback(`Executing: "${commandText}"...`, 'info');

    if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
      try {
        const res = await window.buddy.invoke('mesh:nl-command', { commandText, command: commandText });
        if (res && res.success === false) {
          this._showFeedback(res.message || 'Directive could not be applied.', 'error');
        } else if (res && res.message) {
          this._showFeedback(res.message, 'success');
        } else {
          this._showFeedback(`Cluster Directive "${commandText}" applied.`, 'success');
        }
        await this.refreshState();
      } catch (err) {
        this._showFeedback(`Mesh scheduler unavailable: ${err.message || 'IPC error'}`, 'error');
      }
    } else {
      this._showFeedback('Mesh scheduler IPC bridge is unavailable in standalone view.', 'error');
    }

    this.render();
  }

  _showFeedback(msg, type = 'info') {
    this.lastCommandFeedback = { msg, type, timestamp: Date.now() };
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.lastCommandFeedback = null;
      const el = document.getElementById('mesh-feedback-banner');
      if (el) el.hidden = true;
    }, 5500);

    const banner = document.getElementById('mesh-feedback-banner');
    if (banner) {
      banner.hidden = false;
      banner.className = `mesh-feedback-banner ${type}`;
      banner.innerHTML = `
        <span class="mesh-fb-icon">${type === 'success' ? '✓' : '⚡'}</span>
        <span class="mesh-fb-text">${this._escape(msg)}</span>
        <button type="button" class="mesh-fb-close" onclick="this.parentElement.hidden=true">✕</button>
      `;
    }
  }

  /**
   * Main Render Entrypoint
   */
  render() {
    if (this.container) {
      this._renderMainDashboard();
    }
    if (this.settingsContainer) {
      this._renderSettingsDashboard();
    }
  }

  /**
   * Render the dedicated Brain Mesh view in the main canvas pane
   */
  _renderMainDashboard() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="mesh-dashboard-inner">
        <!-- 1. Header & Live Cluster Ecosystem Banner -->
        <header class="mesh-header">
          <div class="mesh-header-left">
            <div class="mesh-title-wrap">
              <div class="mesh-title-badge-row">
                <h1 class="mesh-title">MAVE Brain Mesh</h1>
                <span class="mesh-status-badge ${this.topology.clusterStatus}">
                  <span class="mesh-pulse-dot"></span>
                  <span>Cluster Active</span>
                </span>
                <span class="mesh-sec-badge">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>Noise NNpsk0 • Zero Trust LAN</span>
                </span>
              </div>
              <p class="mesh-subtitle">Distributed Compute Ecosystem & P2P Paged Attention Co-Processing</p>
            </div>
          </div>
          <div class="mesh-header-right">
            <button type="button" class="mesh-btn mesh-btn-secondary" id="mesh-btn-refresh" title="Re-scan local network for MAVE nodes">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span>Scan Network</span>
            </button>
            <button type="button" class="mesh-btn mesh-btn-primary" id="mesh-btn-pair" title="Pair an iPhone, iPad, or secondary PC via QR / LAN token">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <span>Pair Device</span>
            </button>
          </div>
        </header>

        <!-- Dynamic Feedback / Toast Banner -->
        <div id="mesh-feedback-banner" class="mesh-feedback-banner" ${this.lastCommandFeedback ? '' : 'hidden'}>
          ${this.lastCommandFeedback ? `
            <span class="mesh-fb-icon">${this.lastCommandFeedback.type === 'success' ? '✓' : '⚡'}</span>
            <span class="mesh-fb-text">${this._escape(this.lastCommandFeedback.msg)}</span>
            <button type="button" class="mesh-fb-close" onclick="this.parentElement.hidden=true">✕</button>
          ` : ''}
        </div>

        <!-- 2. Primary Host Toggle Card -->
        <div class="mesh-primary-card ${this.isPrimaryHost ? 'is-primary' : 'is-satellite'}">
          <div class="mesh-primary-left">
            <div class="mesh-primary-icon-wrap">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
            <div class="mesh-primary-info">
              <div class="mesh-primary-headline-row">
                <h3 class="mesh-primary-headline">Make This Device My Primary MAVE Host</h3>
                <span class="mesh-role-pill ${this.isPrimaryHost ? 'pill-host' : 'pill-sat'}">
                  ${this.isPrimaryHost ? 'PRIMARY ORCHESTRATOR' : 'SATELLITE WORKER'}
                </span>
              </div>
              <p class="mesh-primary-desc">
                ${this.isPrimaryHost
                  ? 'This device commands the Brain Mesh: decomposing heavy tasks, receiving partial attention tensors from satellites, and dispatching multi-worker code/research jobs.'
                  : 'This device operates as a compute satellite: lending its CPU, unified RAM, and GPU/NPU to your Primary Host over encrypted zero-trust LAN.'
                }
              </p>
            </div>
          </div>
          <div class="mesh-primary-right">
            <label class="mesh-switch" title="Toggle Primary Host Status">
              <input type="checkbox" id="mesh-toggle-primary" ${this.isPrimaryHost ? 'checked' : ''}>
              <span class="mesh-slider"></span>
            </label>
          </div>
        </div>

        <!-- 3. Cluster Topology Stat Overview (5 Hallmark Tiles) -->
        <div class="mesh-stats-grid">
          <div class="mesh-stat-tile">
            <div class="mesh-stat-header">
              <span class="mesh-stat-label">Connected Devices</span>
              <span class="mesh-stat-icon">💻</span>
            </div>
            <div class="mesh-stat-value-row">
              <span class="mesh-stat-val">${this.devices.length}</span>
              <span class="mesh-stat-unit">Online Nodes</span>
            </div>
            <div class="mesh-stat-meta">
              <span class="mesh-stat-sub">${this.devices.filter(d => d.isHost).length} Host • ${this.devices.filter(d => !d.isHost).length} Contributors</span>
            </div>
          </div>

          <div class="mesh-stat-tile">
            <div class="mesh-stat-header">
              <span class="mesh-stat-label">Cluster CPU Cores</span>
              <span class="mesh-stat-icon">⚡</span>
            </div>
            <div class="mesh-stat-value-row">
              <span class="mesh-stat-val">${this.topology.availableCpuCores}</span>
              <span class="mesh-stat-unit">Total Cores</span>
            </div>
            <div class="mesh-stat-meta">
              <span class="mesh-stat-sub">Across ${this.devices.length} Node(s)</span>
            </div>
          </div>

          <div class="mesh-stat-tile">
            <div class="mesh-stat-header">
              <span class="mesh-stat-label">Reported Node RAM</span>
              <span class="mesh-stat-icon">🧠</span>
            </div>
            <div class="mesh-stat-value-row">
              <span class="mesh-stat-val">${this.topology.totalClusterRamGb}</span>
              <span class="mesh-stat-unit">GB Reported</span>
            </div>
            <div class="mesh-stat-meta">
              <span class="mesh-stat-sub">Discrete per-node RAM (not pooled)</span>
            </div>
          </div>

          <div class="mesh-stat-tile">
            <div class="mesh-stat-header">
              <span class="mesh-stat-label">Reported Node VRAM</span>
              <span class="mesh-stat-icon">🎮</span>
            </div>
            <div class="mesh-stat-value-row">
              <span class="mesh-stat-val">${this.topology.vramPoolGb}</span>
              <span class="mesh-stat-unit">GB VRAM</span>
            </div>
            <div class="mesh-stat-meta">
              <span class="mesh-stat-sub">Discrete GPUs (not pooled)</span>
            </div>
          </div>

          <div class="mesh-stat-tile">
            <div class="mesh-stat-header">
              <span class="mesh-stat-label">Active Mesh Jobs</span>
              <span class="mesh-stat-icon">🔄</span>
            </div>
            <div class="mesh-stat-value-row">
              <span class="mesh-stat-val">${this.activeJobs.length}</span>
              <span class="mesh-stat-unit">Distributing</span>
            </div>
            <div class="mesh-stat-meta">
              <span class="mesh-stat-sub">Zero-Loss Attention Merge</span>
            </div>
          </div>
        </div>

        <!-- 4. Quick Action / Voice Command Directives Bar -->
        <section class="mesh-section mesh-voice-bar-section">
          <div class="mesh-section-head">
            <div class="mesh-sec-title-wrap">
              <h2 class="mesh-section-title">Mesh Voice & Natural Directives</h2>
              <span class="mesh-section-desc">Tap a chip or enter a natural instruction to dynamically re-balance cluster workloads</span>
            </div>
          </div>
          <div class="mesh-chips-scroll">
            ${this.quickChips.map((c) => `
              <button type="button" class="mesh-chip" data-cmd="${this._escape(c.command)}">
                <span class="mesh-chip-icon">💬</span>
                <span class="mesh-chip-text">"${c.label}"</span>
              </button>
            `).join('')}
          </div>
          <form class="mesh-nl-form" id="mesh-nl-form">
            <div class="mesh-nl-input-wrap">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="mesh-nl-input" class="mesh-nl-input" placeholder="Give MAVE a mesh directive (e.g. 'Use iPhone for linting', 'Limit laptop CPU to 50%')..." spellcheck="false">
              <button type="submit" class="mesh-btn mesh-btn-primary small" id="mesh-nl-submit">Dispatch</button>
            </div>
          </form>
        </section>

        <!-- 5. Connected Devices Grid -->
        <section class="mesh-section">
          <div class="mesh-section-head">
            <div class="mesh-sec-title-wrap">
              <h2 class="mesh-section-title">Connected Devices & Compute Satellites</h2>
              <span class="mesh-section-desc">Real-time thermal health, battery telemetry, latency, and assigned roles</span>
            </div>
            <div class="mesh-filter-pills">
              <button type="button" class="mesh-filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${this.devices.length})</button>
              <button type="button" class="mesh-filter-pill ${this.activeFilter === 'compute' ? 'active' : ''}" data-filter="compute">Compute Nodes (${this.devices.filter(d => d.type === 'desktop' || d.type === 'laptop').length})</button>
              <button type="button" class="mesh-filter-pill ${this.activeFilter === 'mobile' ? 'active' : ''}" data-filter="mobile">Mobile & Tablets (${this.devices.filter(d => d.type === 'mobile' || d.type === 'tablet').length})</button>
            </div>
          </div>
          <div class="mesh-devices-grid" id="mesh-devices-grid">
            ${this._renderDeviceCardsHtml()}
          </div>
        </section>

        <!-- 6. Active Distributed Jobs View -->
        <section class="mesh-section">
          <div class="mesh-section-head">
            <div class="mesh-sec-title-wrap">
              <h2 class="mesh-section-title">Active Distributed Jobs & Task Splitting</h2>
              <span class="mesh-section-desc">Pipelined Split-Prefill and multi-worker execution tree</span>
            </div>
          </div>
          <div class="mesh-jobs-container" id="mesh-jobs-container">
            ${this._renderJobsHtml()}
          </div>
        </section>

        <!-- 7. Resource Policy Controls Panel -->
        <section class="mesh-section mesh-policy-section">
          <div class="mesh-section-head">
            <div class="mesh-sec-title-wrap">
              <h2 class="mesh-section-title">Resource Sharing & Energy Governance Policy</h2>
              <span class="mesh-section-desc">Enforce hard hardware bounds, battery guards, thermal protection, and gaming priority</span>
            </div>
            <button type="button" class="mesh-btn mesh-btn-secondary small" id="mesh-btn-save-policy">
              <span>Save Policy</span>
            </button>
          </div>
          <div class="mesh-policy-card">
            ${this._renderPolicyControlsHtml()}
          </div>
        </section>
      </div>
    `;

    this._bindEvents();
  }

  /**
   * Render the Settings Modal panel for Brain Mesh
   */
  _renderSettingsDashboard() {
    if (!this.settingsContainer) return;

    this.settingsContainer.innerHTML = `
      <div class="mesh-settings-pane-inner">
        <div class="title-2">Brain Mesh & Compute Sharing Policies</div>
        <div class="caption" style="margin-bottom:20px;">
          Govern how MAVE utilizes this computer when participating in your distributed multi-device cluster.
        </div>

        <!-- Primary Host Toggle in Settings -->
        <div class="mesh-primary-card ${this.isPrimaryHost ? 'is-primary' : 'is-satellite'}" style="margin-bottom:24px;">
          <div class="mesh-primary-left">
            <div class="mesh-primary-icon-wrap">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
            </div>
            <div class="mesh-primary-info">
              <div class="mesh-primary-headline-row">
                <span class="mesh-primary-headline">Make This Device My Primary MAVE Host</span>
                <span class="mesh-role-pill ${this.isPrimaryHost ? 'pill-host' : 'pill-sat'}">
                  ${this.isPrimaryHost ? 'PRIMARY HOST' : 'SATELLITE'}
                </span>
              </div>
              <p class="mesh-primary-desc" style="font-size:12.5px;">
                ${this.isPrimaryHost
                  ? 'Orchestrates the entire mesh, handles local LLM master weights, and splits jobs.'
                  : 'Acts as a worker satellite, receiving attention pages and subtasks over LAN.'
                }
              </p>
            </div>
          </div>
          <div class="mesh-primary-right">
            <label class="mesh-switch">
              <input type="checkbox" id="mesh-settings-toggle-primary" ${this.isPrimaryHost ? 'checked' : ''}>
              <span class="mesh-slider"></span>
            </label>
          </div>
        </div>

        <!-- Policy Sliders & Controls -->
        <div class="mesh-policy-card">
          ${this._renderPolicyControlsHtml('settings-')}
        </div>

        <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center;">
          <span id="mesh-settings-saved-indicator" style="font-size:13px; color:#10b981; opacity:0; transition:opacity 0.2s;">✓ Policy saved and active</span>
          <button type="button" class="btn primary small" id="mesh-settings-save-btn">Save Resource Policy</button>
        </div>
      </div>
    `;

    this._bindSettingsEvents();
  }

  /**
   * Generate HTML for device cards
   */
  _renderDeviceCardsHtml() {
    if (!this.devices || this.devices.length === 0) {
      return `
        <div class="mesh-empty-state">
          <div class="mesh-empty-icon">📡</div>
          <div class="mesh-empty-title">No Devices Paired Yet</div>
          <div class="mesh-empty-desc">Pair your secondary laptop, iPhone, or iPad via encrypted LAN or USB to start co-processing.</div>
          <button type="button" class="mesh-btn mesh-btn-primary" id="mesh-empty-pair-btn">+ Pair First Device</button>
        </div>
      `;
    }

    const filtered = this.devices.filter((d) => {
      if (this.activeFilter === 'compute') return d.type === 'desktop' || d.type === 'laptop';
      if (this.activeFilter === 'mobile') return d.type === 'mobile' || d.type === 'tablet';
      return true;
    });

    if (filtered.length === 0) {
      return `
        <div class="mesh-empty-state">
          <div class="mesh-empty-title">No Matching Devices in Filter</div>
          <div class="mesh-empty-desc">Switch filter to All or connect a compute contributor device.</div>
        </div>
      `;
    }

    return filtered.map((device) => {
      const isHost = device.isHost;
      const battery = typeof device.battery === 'number' ? device.battery : null;
      const isCharging = device.isCharging ?? true;
      const tempC = typeof device.temperatureC === 'number' ? device.temperatureC : null;
      const latency = typeof device.latencyMs === 'number' ? device.latencyMs : null;

      // Battery level color
      let batColorClass = 'bat-high';
      if (battery !== null && battery < 20) batColorClass = 'bat-critical';
      else if (battery !== null && battery < 50) batColorClass = 'bat-mid';

      // Thermal state class
      let thermalClass = 'thermal-normal';
      let thermalLabel = tempC === null ? 'Unavailable' : 'Normal';
      if (tempC !== null && tempC >= 75) {
        thermalClass = 'thermal-throttle';
        thermalLabel = 'Throttling';
      } else if (tempC !== null && tempC >= 60) {
        thermalClass = 'thermal-warm';
        thermalLabel = 'Warm';
      }

      // Device Icon
      let devIconSvg = '';
      if (device.type === 'desktop') {
        devIconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
      } else if (device.type === 'laptop') {
        devIconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><line x1="2" y1="19" x2="22" y2="19"/></svg>`;
      } else if (device.type === 'mobile') {
        devIconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
      } else {
        devIconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="18" r="1"/></svg>`;
      }

      return `
        <div class="mesh-device-card ${isHost ? 'card-host' : ''}" data-device-id="${device.id}">
          <div class="mesh-dev-card-head">
            <div class="mesh-dev-ident">
              <div class="mesh-dev-icon-badge ${device.type}">
                ${devIconSvg}
              </div>
              <div class="mesh-dev-title-wrap">
                <div class="mesh-dev-name-row">
                  <span class="mesh-dev-name">${this._escape(device.name)}</span>
                  ${isHost ? '<span class="mesh-host-tag">Host</span>' : ''}
                </div>
                <div class="mesh-dev-sub">${this._escape(device.os)} • ${this._escape(device.ip)}</div>
              </div>
            </div>
            <div class="mesh-dev-badges-right">
              <!-- Real-time Battery Pill -->
              <span class="mesh-telemetry-pill ${batColorClass}" title="${battery === null ? 'AC Mains Powered' : `Battery: ${battery}% (${isCharging ? 'Charging' : 'On Battery'})`}">
                <span class="mesh-bat-icon">${isCharging ? '⚡' : '🔋'}</span>
                <span>${battery === null ? 'AC' : `${battery}%`}</span>
              </span>

              <!-- Thermal Indicator -->
              <span class="mesh-telemetry-pill ${thermalClass}" title="Core Temperature: ${tempC === null ? 'Not measured' : `${tempC}°C (${thermalLabel})`}">
                <span class="mesh-dot-indicator"></span>
                <span>${tempC === null ? 'N/A' : `${tempC}°C`}</span>
              </span>

              <!-- Latency Pill -->
              <span class="mesh-telemetry-pill pill-latency" title="Round-trip LAN Ping">
                <span>${latency === null ? 'N/A' : `${latency} ms`}</span>
              </span>
            </div>
          </div>

          <!-- Hardware Specs Bar -->
          <div class="mesh-dev-specs-row">
            <div class="mesh-spec-item" title="CPU">
              <span class="mesh-spec-k">CPU:</span>
              <span class="mesh-spec-v">${this._escape(device.cpu)}</span>
            </div>
            <div class="mesh-spec-item" title="RAM">
              <span class="mesh-spec-k">RAM:</span>
              <span class="mesh-spec-v">${this._escape(device.ram)}</span>
            </div>
            <div class="mesh-spec-item" title="GPU/NPU">
              <span class="mesh-spec-k">Compute:</span>
              <span class="mesh-spec-v">${this._escape(device.gpu)}</span>
            </div>
          </div>

          <!-- Assigned Role & Active Workloads -->
          <div class="mesh-dev-workload-box">
            <div class="mesh-dev-workload-head">
              <span class="mesh-role-label">Assigned Role:</span>
              <span class="mesh-assigned-role">${this._escape(device.role)}</span>
              <span class="mesh-usage-tag">${device.cpuUsagePct}% CPU</span>
            </div>
            <div class="mesh-workload-chips">
              ${(device.activeWorkloads || ['Idle Standby']).map((w) => `
                <span class="mesh-workload-chip">
                  <span class="mesh-subtask-dot"></span>
                  <span>${this._escape(w)}</span>
                </span>
              `).join('')}
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="mesh-dev-foot-actions">
            <button type="button" class="mesh-card-btn mesh-btn-ping" data-id="${device.id}" title="Send ICMP/UDP handshake ping">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span>Ping</span>
            </button>
            <button type="button" class="mesh-card-btn mesh-btn-role" data-id="${device.id}" title="Change assigned role (KV Cache, Compilation, Inference)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Assign Role</span>
            </button>
            ${!isHost ? `
              <button type="button" class="mesh-card-btn mesh-btn-eject" data-id="${device.id}" title="Disconnect satellite from active cluster">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                <span>Eject</span>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Generate HTML for active distributed jobs
   */
  _renderJobsHtml() {
    if (!this.activeJobs || this.activeJobs.length === 0) {
      return `
        <div class="mesh-job-empty">
          <span>No active distributed jobs in progress. The cluster is standing by.</span>
        </div>
      `;
    }

    return this.activeJobs.map((job) => `
      <div class="mesh-job-card" data-job-id="${job.id}">
        <div class="mesh-job-head">
          <div class="mesh-job-title-group">
            <span class="mesh-job-icon">⚙️</span>
            <span class="mesh-job-title">${this._escape(job.title)}</span>
            <span class="mesh-job-split-tag">${this._escape(job.splitScheme)}</span>
          </div>
          <div class="mesh-job-status-group">
            <span class="mesh-job-pct">${job.overallProgress}%</span>
            <button type="button" class="mesh-btn-cancel-job" data-id="${job.id}" title="Cancel or reassign job">✕</button>
          </div>
        </div>

        <div class="mesh-job-main-bar">
          <div class="mesh-job-progress-fill" style="width: ${job.overallProgress}%"></div>
        </div>

        <!-- Distributed Subtask Breakdown Tree -->
        <div class="mesh-subtasks-tree">
          ${(job.subtasks || []).map((st) => `
            <div class="mesh-subtask-row">
              <div class="mesh-st-left">
                <span class="mesh-st-indicator ${st.status}"></span>
                <span class="mesh-st-name">${this._escape(st.name)}</span>
                <span class="mesh-st-device">→ ${this._escape(st.assignedDevice)}</span>
              </div>
              <div class="mesh-st-right">
                <div class="mesh-st-track">
                  <div class="mesh-st-fill" style="width: ${st.progress}%"></div>
                </div>
                <span class="mesh-st-pct">${st.progress}%</span>
                <span class="mesh-st-time">${st.elapsed || ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * Generate HTML for Resource Policy sliders and toggles
   */
  _renderPolicyControlsHtml(prefix = '') {
    const p = this.policy;
    const workloads = new Set(p.approvedWorkloadTypes || []);

    return `
      <!-- Master Compute Sharing Switch -->
      <div class="mesh-policy-row master-row">
        <div class="mesh-pr-label-wrap">
          <div class="mesh-pr-title">Enable Compute Sharing</div>
          <div class="mesh-pr-desc">Participate in distributed execution, paged attention merging, and remote worker clustering.</div>
        </div>
        <div class="mesh-pr-control">
          <label class="mesh-switch">
            <input type="checkbox" id="${prefix}policy-enable" ${p.enableComputeSharing ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>
      </div>

      <!-- CPU Sharing Slider -->
      <div class="mesh-policy-slider-group">
        <div class="mesh-slider-header">
          <span class="mesh-slider-title">Maximum Shared CPU Allocation</span>
          <span class="mesh-slider-val" id="${prefix}val-cpu">${p.maxCpuPercent}%</span>
        </div>
        <input type="range" class="mesh-range-input" id="${prefix}policy-cpu-slider" min="10" max="100" step="5" value="${p.maxCpuPercent}">
        <div class="mesh-slider-ticks">
          <span>10% (Low impact)</span>
          <span>50% (Balanced)</span>
          <span>100% (Full Power)</span>
        </div>
      </div>

      <!-- Memory & RAM Allocation Slider -->
      <div class="mesh-policy-slider-group">
        <div class="mesh-slider-header">
          <span class="mesh-slider-title">Shared Memory (RAM) Limit</span>
          <span class="mesh-slider-val" id="${prefix}val-ram">${p.ramAllocationLimitGb} GB (Reserved: ${p.minReservedRamGb} GB)</span>
        </div>
        <input type="range" class="mesh-range-input" id="${prefix}policy-ram-slider" min="1" max="32" step="1" value="${p.ramAllocationLimitGb}">
        <div class="mesh-slider-ticks">
          <span>1 GB</span>
          <span>8 GB (Recommended)</span>
          <span>32 GB</span>
        </div>
      </div>

      <!-- GPU & VRAM Allocation Budget Slider -->
      <div class="mesh-policy-slider-group">
        <div class="mesh-slider-header">
          <span class="mesh-slider-title">GPU & VRAM Allocation Budget</span>
          <span class="mesh-slider-val" id="${prefix}val-vram">${p.shareGpu ? `${p.vramBudgetGb} GB VRAM` : 'Disabled'}</span>
        </div>
        <input type="range" class="mesh-range-input" id="${prefix}policy-vram-slider" min="0" max="24" step="1" value="${p.shareGpu ? p.vramBudgetGb : 0}">
        <div class="mesh-slider-ticks">
          <span>0 (CPU Only)</span>
          <span>6 GB (Vulkan/Metal)</span>
          <span>24 GB (All VRAM)</span>
        </div>
      </div>

      <!-- Toggles Grid: Energy, Thermals, Gaming, Local Network -->
      <div class="mesh-toggles-grid">
        <div class="mesh-toggle-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Share Only While Idle</span>
            <span class="mesh-tt-sub">Pause compute when user inputs occur</span>
          </div>
          <label class="mesh-switch small">
            <input type="checkbox" id="${prefix}policy-idle" ${p.shareOnlyWhileIdle ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>

        <div class="mesh-toggle-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Share Only While Charging</span>
            <span class="mesh-tt-sub">Conserve laptop and phone battery</span>
          </div>
          <label class="mesh-switch small">
            <input type="checkbox" id="${prefix}policy-charging" ${p.shareOnlyWhileCharging ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>

        <div class="mesh-toggle-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Thermal Protection Gate</span>
            <span class="mesh-tt-sub">Auto-throttle if CPU/GPU exceeds 75°C</span>
          </div>
          <label class="mesh-switch small">
            <input type="checkbox" id="${prefix}policy-thermal" ${p.thermalProtection ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>

        <div class="mesh-toggle-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Gaming Priority Shield</span>
            <span class="mesh-tt-sub">Immediately suspend mesh if 3D game launches</span>
          </div>
          <label class="mesh-switch small">
            <input type="checkbox" id="${prefix}policy-gaming" ${p.gamingPriority ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>

        <div class="mesh-toggle-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Local Network Only</span>
            <span class="mesh-tt-sub">Restrict communication to LAN & USB (zero WAN)</span>
          </div>
          <label class="mesh-switch small">
            <input type="checkbox" id="${prefix}policy-local" ${p.localNetworkOnly ? 'checked' : ''}>
            <span class="mesh-slider"></span>
          </label>
        </div>

        <!-- Minimum Battery Slider -->
        <div class="mesh-toggle-tile battery-tile">
          <div class="mesh-tt-text">
            <span class="mesh-tt-title">Minimum Battery Guard</span>
            <span class="mesh-tt-sub">Stop sharing if battery drops below <strong id="${prefix}val-bat">${p.minBatteryPercent}%</strong></span>
          </div>
          <input type="range" class="mesh-range-input small" id="${prefix}policy-bat-slider" min="10" max="60" step="5" value="${p.minBatteryPercent}" style="width:110px;">
        </div>
      </div>

      <!-- Approved Workload Types Checkboxes -->
      <div class="mesh-workloads-approval">
        <div class="mesh-wa-title">Permitted Distributed Workload Types</div>
        <div class="mesh-wa-checkboxes">
          <label class="mesh-checkbox-label">
            <input type="checkbox" id="${prefix}wl-compilation" data-wl="compilation" ${workloads.has('compilation') ? 'checked' : ''}>
            <span>Compilation & Builds</span>
          </label>
          <label class="mesh-checkbox-label">
            <input type="checkbox" id="${prefix}wl-testing" data-wl="testing" ${workloads.has('testing') ? 'checked' : ''}>
            <span>Unit & Integration Testing</span>
          </label>
          <label class="mesh-checkbox-label">
            <input type="checkbox" id="${prefix}wl-data" data-wl="data_processing" ${workloads.has('data_processing') ? 'checked' : ''}>
            <span>Data Processing & Embeddings</span>
          </label>
          <label class="mesh-checkbox-label">
            <input type="checkbox" id="${prefix}wl-inference" data-wl="ai_inference" ${workloads.has('ai_inference') ? 'checked' : ''}>
            <span>AI Inference & KV Attention Offload</span>
          </label>
          <label class="mesh-checkbox-label">
            <input type="checkbox" id="${prefix}wl-research" data-wl="research" ${workloads.has('research') ? 'checked' : ''}>
            <span>Deep Research & Web Scraping</span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Bind event handlers for main dashboard controls
   */
  _bindEvents() {
    if (!this.container) return;

    // 1. Primary Host Switch
    const primarySwitch = document.getElementById('mesh-toggle-primary');
    if (primarySwitch) {
      primarySwitch.onchange = (e) => this.togglePrimaryHost(e.target.checked);
    }

    // 2. Scan Network Button
    const refreshBtn = document.getElementById('mesh-btn-refresh');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.classList.add('spinning');
        this._showFeedback('Querying live mesh topology and connected workers...', 'info');
        await this.refreshState();
        refreshBtn.classList.remove('spinning');
        this._showFeedback(`Network sync complete: ${this.devices.length} node(s) online.`, 'success');
        this.render();
      };
    }

    // Filter pills
    this.container.querySelectorAll('.mesh-filter-pill').forEach((pill) => {
      pill.onclick = () => {
        this.activeFilter = pill.dataset.filter || 'all';
        this.render();
      };
    });

    // 3. Quick Action Chips
    const chips = this.container.querySelectorAll('.mesh-chip');
    chips.forEach((chip) => {
      chip.onclick = () => {
        const cmd = chip.dataset.cmd;
        if (cmd) this.executeQuickAction(cmd);
      };
    });

    // 4. Natural Language Directive Form
    const nlForm = document.getElementById('mesh-nl-form');
    if (nlForm) {
      nlForm.onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('mesh-nl-input');
        if (input && input.value.trim()) {
          const cmd = input.value.trim();
          input.value = '';
          this.executeQuickAction(cmd);
        }
      };
    }

    // 5. Policy Sliders live labels & updates
    this._attachSliderLiveEvents('');

    // 6. Save Policy Button
    const saveBtn = document.getElementById('mesh-btn-save-policy');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const patch = this._collectPolicyValues('');
        await this.updatePolicy(patch);
        saveBtn.textContent = '✓ Saved!';
        saveBtn.style.borderColor = '#10b981';
        saveBtn.style.color = '#10b981';
        this._showFeedback('Cluster resource sharing policy saved and committed to local engine.', 'success');
        setTimeout(() => {
          saveBtn.textContent = 'Save Policy';
          saveBtn.style.borderColor = '';
          saveBtn.style.color = '';
        }, 2200);
      };
    }

    // 7. Device action buttons
    this.container.querySelectorAll('.mesh-btn-ping').forEach((btn) => {
      btn.onclick = async () => {
        const devId = btn.dataset.id;
        btn.textContent = 'Checking...';
        await this.refreshState();
        const dev = this.devices.find((d) => d.id === devId);
        btn.textContent = dev && typeof dev.latencyMs === 'number' ? `${dev.latencyMs} ms ✓` : (dev ? `${dev.status} ✓` : 'Offline');
        setTimeout(() => { btn.innerHTML = '<span>Ping</span>'; }, 1800);
      };
    });

    this.container.querySelectorAll('.mesh-btn-role').forEach((btn) => {
      btn.onclick = () => {
        const devId = btn.dataset.id;
        const dev = this.devices.find((d) => d.id === devId);
        if (dev) {
          const roles = ['contributor', 'primary_host'];
          const nextRole = dev.role === 'primary_host' ? 'contributor' : 'primary_host';
          if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
            window.buddy.invoke('mesh:set-primary-host', { isPrimary: nextRole === 'primary_host', deviceId: devId })
              .then(() => this.refreshState())
              .then(() => {
                this._showFeedback(`Updated ${dev.name} role to ${nextRole}.`, 'success');
                this.render();
              })
              .catch((err) => this._showFeedback(`Role update failed: ${err.message}`, 'error'));
          }
        }
      };
    });

    this.container.querySelectorAll('.mesh-btn-eject').forEach((btn) => {
      btn.onclick = async () => {
        const devId = btn.dataset.id;
        if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
          try {
            await window.buddy.invoke('mesh:disconnect-worker', { deviceId: devId });
            await this.refreshState();
            this._showFeedback(`Device ${devId} disconnected from MAVE Brain Mesh.`, 'info');
          } catch (err) {
            this._showFeedback(`Disconnect failed: ${err.message}`, 'error');
          }
        }
        this.render();
      };
    });

    // 8. Pair device button
    const pairBtn = document.getElementById('mesh-btn-pair');
    const emptyPairBtn = document.getElementById('mesh-empty-pair-btn');
    const handlePair = async () => {
      if (typeof window !== 'undefined' && window.buddy && typeof window.buddy.invoke === 'function') {
        try {
          const [pin, netInfo] = await Promise.all([
            window.buddy.invoke('mesh:generate-pin'),
            window.buddy.invoke('network:get-local-info').catch(() => null),
          ]);
          const targetUrl = netInfo && netInfo.lanAddress ? `http://${netInfo.lanAddress}` : 'Host LAN IP';
          this._showFeedback(`Pairing PIN: ${pin} — Run mave-worker or pair via ${targetUrl}`, 'info');
          return;
        } catch (err) {
          this._showFeedback(`Could not generate pairing PIN: ${err.message}`, 'error');
          return;
        }
      }
      this._showFeedback('Pairing requires active MAVE desktop IPC runtime.', 'error');
    };
    if (pairBtn) pairBtn.onclick = handlePair;
    if (emptyPairBtn) emptyPairBtn.onclick = handlePair;
  }

  /**
   * Bind event handlers for the Settings Modal controls
   */
  _bindSettingsEvents() {
    if (!this.settingsContainer) return;

    const primarySwitch = document.getElementById('mesh-settings-toggle-primary');
    if (primarySwitch) {
      primarySwitch.onchange = (e) => this.togglePrimaryHost(e.target.checked);
    }

    this._attachSliderLiveEvents('settings-');

    const saveBtn = document.getElementById('mesh-settings-save-btn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const patch = this._collectPolicyValues('settings-');
        await this.updatePolicy(patch);
        const indicator = document.getElementById('mesh-settings-saved-indicator');
        if (indicator) {
          indicator.style.opacity = '1';
          setTimeout(() => { indicator.style.opacity = '0'; }, 2200);
        }
      };
    }
  }

  _attachSliderLiveEvents(prefix = '') {
    // CPU slider
    const cpuEl = document.getElementById(`${prefix}policy-cpu-slider`);
    const cpuVal = document.getElementById(`${prefix}val-cpu`);
    if (cpuEl && cpuVal) {
      cpuEl.oninput = () => { cpuVal.textContent = `${cpuEl.value}%`; };
    }

    // RAM slider
    const ramEl = document.getElementById(`${prefix}policy-ram-slider`);
    const ramVal = document.getElementById(`${prefix}val-ram`);
    if (ramEl && ramVal) {
      ramEl.oninput = () => { ramVal.textContent = `${ramEl.value} GB (Reserved: 4 GB)`; };
    }

    // VRAM slider
    const vramEl = document.getElementById(`${prefix}policy-vram-slider`);
    const vramVal = document.getElementById(`${prefix}val-vram`);
    if (vramEl && vramVal) {
      vramEl.oninput = () => {
        const val = parseInt(vramEl.value, 10);
        vramVal.textContent = val === 0 ? 'Disabled' : `${val} GB VRAM`;
      };
    }

    // Battery slider
    const batEl = document.getElementById(`${prefix}policy-bat-slider`);
    const batVal = document.getElementById(`${prefix}val-bat`);
    if (batEl && batVal) {
      batEl.oninput = () => { batVal.textContent = `${batEl.value}%`; };
    }
  }

  _collectPolicyValues(prefix = '') {
    const enableEl = document.getElementById(`${prefix}policy-enable`);
    const cpuEl = document.getElementById(`${prefix}policy-cpu-slider`);
    const ramEl = document.getElementById(`${prefix}policy-ram-slider`);
    const vramEl = document.getElementById(`${prefix}policy-vram-slider`);
    const idleEl = document.getElementById(`${prefix}policy-idle`);
    const chargeEl = document.getElementById(`${prefix}policy-charging`);
    const thermalEl = document.getElementById(`${prefix}policy-thermal`);
    const gamingEl = document.getElementById(`${prefix}policy-gaming`);
    const localEl = document.getElementById(`${prefix}policy-local`);
    const batEl = document.getElementById(`${prefix}policy-bat-slider`);

    const workloads = [];
    const container = prefix ? this.settingsContainer : this.container;
    if (container) {
      container.querySelectorAll(`input[id^="${prefix}wl-"]:checked`).forEach((cb) => {
        if (cb.dataset.wl) workloads.push(cb.dataset.wl);
      });
    }

    const vramVal = vramEl ? parseInt(vramEl.value, 10) : this.policy.vramBudgetGb;

    return {
      enableComputeSharing: enableEl ? enableEl.checked : this.policy.enableComputeSharing,
      maxCpuPercent: cpuEl ? parseInt(cpuEl.value, 10) : this.policy.maxCpuPercent,
      ramAllocationLimitGb: ramEl ? parseInt(ramEl.value, 10) : this.policy.ramAllocationLimitGb,
      shareGpu: vramVal > 0,
      vramBudgetGb: vramVal,
      shareOnlyWhileIdle: idleEl ? idleEl.checked : this.policy.shareOnlyWhileIdle,
      shareOnlyWhileCharging: chargeEl ? chargeEl.checked : this.policy.shareOnlyWhileCharging,
      thermalProtection: thermalEl ? thermalEl.checked : this.policy.thermalProtection,
      gamingPriority: gamingEl ? gamingEl.checked : this.policy.gamingPriority,
      localNetworkOnly: localEl ? localEl.checked : this.policy.localNetworkOnly,
      minBatteryPercent: batEl ? parseInt(batEl.value, 10) : this.policy.minBatteryPercent,
      approvedWorkloadTypes: workloads.length > 0 ? workloads : this.policy.approvedWorkloadTypes
    };
  }

  _renderDevicesGrid() {
    const grid = document.getElementById('mesh-devices-grid');
    if (grid) grid.innerHTML = this._renderDeviceCardsHtml();
  }

  _renderJobsView() {
    const box = document.getElementById('mesh-jobs-container');
    if (box) box.innerHTML = this._renderJobsHtml();
  }

  _escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Global Singleton Initialization
let meshDashboardInstance = null;

function initMeshDashboardUI() {
  if (!meshDashboardInstance) {
    meshDashboardInstance = new MeshDashboardController();
  }
  meshDashboardInstance.init();
  return meshDashboardInstance;
}

if (typeof window !== 'undefined') {
  window.MeshDashboardController = MeshDashboardController;
  window.initMeshDashboardUI = initMeshDashboardUI;

  // Auto-wire on load if elements are present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMeshDashboardUI());
  } else {
    setTimeout(() => initMeshDashboardUI(), 50);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MeshDashboardController, initMeshDashboardUI };
}
