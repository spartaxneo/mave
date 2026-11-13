'use strict';

// Standalone Vorssaint Dynamic Island & Companion Controller
// 100% Authentic to vorssaint/vorssaint-utils (macOS Swift Dynamic Island)

const api = window.buddy;

class VorssaintIslandController {
  constructor() {
    this.container = document.getElementById('island-container');
    this.notch = document.getElementById('island-notch');
    this.expandedWrapper = document.getElementById('expanded-wrapper');
    this.mascotHost = document.getElementById('mascot-face-host');
    this.stageMascotHost = document.getElementById('stage-mascot-rig-host');
    this.cameraLens = document.getElementById('camera-lens-dot');
    this.wave = document.getElementById('notch-right-wave');

    // Controls elements
    this.volTrack = document.getElementById('vol-track');
    this.volFill = document.getElementById('vol-fill');
    this.volLabel = document.getElementById('vol-label');
    this.volume = 45;

    this.brightTrack = document.getElementById('bright-track');
    this.brightFill = document.getElementById('bright-fill');
    this.brightLabel = document.getElementById('bright-label');
    this.brightness = 65;

    // Music & 200% Boost
    this.boostTrack = document.getElementById('boost-track');
    this.boostFill = document.getElementById('boost-fill');
    this.boostVal = document.getElementById('boost-val');
    this.boostPercent = 100;
    this.audioCtx = null;
    this.gainNode = null;

    // State
    this.isExpanded = false;
    this.isPinned = false;
    this.isAwakeActive = false;
    this.timerInterval = null;
    this.timerSeconds = 25 * 60;
    this.timerRunning = false;
    this.collapseTimeout = null;

    this.initMascots();
    this.initExpansion();
    this.initSliders();
    this.initMusicAndBoost();
    this.initActions();
    this.initDrawers();
    this.initDropShelf();
    this.initIpc();
  }

  // --- 1. Authentic Mascot Rigs ---
  initMascots() {
    if (typeof window.VorssaintMascotRig !== 'function') return;

    // Notch Compact Mascot (22px)
    if (this.mascotHost) {
      this.notchMascot = new window.VorssaintMascotRig(this.mascotHost, {
        size: 22,
        style: 'minimal',
        shape: 'ball',
        palette: 'pearl',
        followsPointer: true,
      });
    }

    // Expanded Companion Stage Mascot (48px)
    if (this.stageMascotHost) {
      this.stageMascot = new window.VorssaintMascotRig(this.stageMascotHost, {
        size: 48,
        style: 'minimal',
        shape: 'ball',
        palette: 'pearl',
        followsPointer: true,
      });
    }

    // Wire Stage Moment Buttons
    const moments = [
      { id: 'chip-hop', fn: () => this.triggerMoment('hop') },
      { id: 'chip-love', fn: () => this.triggerMoment('love') },
      { id: 'chip-think', fn: () => this.triggerMoment('think') },
      { id: 'chip-groove', fn: () => this.triggerMoment('groove') },
      { id: 'chip-sleep', fn: () => this.triggerMoment('sleep') },
      { id: 'chip-wink', fn: () => this.triggerMoment('wink') },
      { id: 'chip-pet', fn: () => this.triggerMoment('pet') },
    ];

    moments.forEach(({ id, fn }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
      }
    });
  }

  triggerMoment(moment) {
    [this.notchMascot, this.stageMascot].forEach((m) => {
      if (!m) return;
      if (moment === 'hop') m.hop();
      else if (moment === 'love') m.pet();
      else if (moment === 'think') m.think();
      else if (moment === 'groove') m.groove();
      else if (moment === 'sleep') m.sleep();
      else if (moment === 'wink') m.wink();
      else if (moment === 'pet') m.pet();
      else if (moment === 'wakeUp') m.wakeUp();
    });

    if (api && api.invoke) {
      api.invoke('vorssaint:mascot-moment', moment).catch(() => {});
    }
  }

  // --- 2. Dynamic Island Expansion & Collapse ---
  initExpansion() {
    this.notch.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(this.collapseTimeout);
      if (this.isExpanded) {
        this.collapse();
      } else {
        this.expand();
      }
    });

    this.expandedWrapper.addEventListener('mouseenter', () => {
      clearTimeout(this.collapseTimeout);
    });

    this.expandedWrapper.addEventListener('mouseleave', () => {
      if (this.isPinned) return;
      clearTimeout(this.collapseTimeout);
      this.collapseTimeout = setTimeout(() => this.collapse(), 900);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.collapse();
      }
    });

    // Pin Button
    const btnPin = document.getElementById('btn-pin');
    if (btnPin) {
      btnPin.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isPinned = !this.isPinned;
        btnPin.classList.toggle('pinned', this.isPinned);
      });
    }

    // Settings Button
    const btnSettings = document.getElementById('btn-open-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && api.invoke) api.invoke('vorssaint:open-hub');
      });
    }

    // Collapse Button
    const btnCollapse = document.getElementById('btn-collapse');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }
  }

  async expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    this.notch.style.display = 'none';
    this.expandedWrapper.style.display = 'flex';
    if (api && api.invoke) {
      await api.invoke('island:expand').catch(() => {});
    }
    this.refreshLiveStatus();
  }

  async collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    this.closeAllPanels();
    this.expandedWrapper.style.display = 'none';
    this.notch.style.display = 'flex';
    if (api && api.invoke) {
      await api.invoke('island:collapse').catch(() => {});
    }
  }

  async refreshLiveStatus() {
    if (!api || !api.invoke) return;
    try {
      const [telemetry, agents] = await Promise.all([
        api.invoke('vorssaint:telemetry').catch(() => null),
        api.invoke('vorssaint:agents').catch(() => null),
      ]);
      const modelEl = document.getElementById('island-active-model');
      const telEl = document.getElementById('island-live-telemetry');
      if (modelEl && agents && agents.activeAgent) {
        modelEl.textContent = agents.activeAgent;
      }
      if (telEl && telemetry) {
        const cpu = telemetry.cpu ? `${telemetry.cpu.loadPercent ?? telemetry.cpu.usagePct ?? 0}%` : '—';
        const ram = telemetry.ram ? `${telemetry.ram.usedPercent ?? 0}%` : '—';
        telEl.textContent = `CPU ${cpu} · RAM ${ram}`;
      }
      const sysEl = document.getElementById('island-sys-details');
      if (sysEl && telemetry) {
        const cpuModel = telemetry.cpu && telemetry.cpu.model ? telemetry.cpu.model : 'CPU';
        const cpuPct = telemetry.cpu ? (telemetry.cpu.loadPercent ?? telemetry.cpu.usagePct ?? 0) : 0;
        const ramUsed = telemetry.ram ? `${telemetry.ram.usedGB} / ${telemetry.ram.totalGB} GB (${telemetry.ram.usedPercent}%)` : 'Unavailable';
        const gpuName = telemetry.gpu && telemetry.gpu.name ? telemetry.gpu.name : 'Integrated / Default';
        sysEl.innerHTML = `
          <div class="agent-card-row"><span>${cpuModel}</span><strong>${cpuPct}%</strong></div>
          <div class="agent-card-row"><span>Memory</span><strong>${ramUsed}</strong></div>
          <div class="agent-card-row"><span>Graphics</span><strong>${gpuName}</strong></div>
        `;
      }
      const agentsListEl = document.getElementById('island-agents-list');
      if (agentsListEl && agents && Array.isArray(agents.agents)) {
        agentsListEl.innerHTML = agents.agents.map((a) => `
          <div class="agent-card-row">
            <span>${a.name}</span>
            <span style="color:${a.status === 'active' ? '#10b981' : '#a1a1aa'}; font-weight:600;">${a.modelName || a.model} · ${(a.tokensProcessed || 0).toLocaleString()} tok</span>
          </div>
        `).join('');
      }
    } catch {}
  }

  // --- 3. Live Quick Actions ---
  initMusicAndBoost() {
    const btnOpenMave = document.getElementById('btn-island-open-mave');
    if (btnOpenMave) {
      btnOpenMave.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && api.invoke) api.invoke('island:open-main', 'home').catch(() => {});
        this.collapse();
      });
    }
    const btnCmdBar = document.getElementById('btn-island-cmdbar');
    if (btnCmdBar) {
      btnCmdBar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && api.invoke) api.invoke('vorssaint:open-command-bar').catch(() => {});
      });
    }
    const btnMenuTop = document.getElementById('btn-island-menu-top');
    if (btnMenuTop) {
      btnMenuTop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && api.invoke) api.invoke('vorssaint:open-panel').catch(() => {});
      });
    }
    if (api && api.on) {
      api.on('island:blur', () => {
        if (this.isExpanded && !this.isPinned) this.collapse();
      });
    }
  }

  // --- 4. Volume & Brightness Sliders ---
  initSliders() {
    const handleSlider = (track, fill, label, setter) => {
      const updateFromEvent = (e) => {
        const rect = track.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const pct = Math.round(ratio * 100);
        fill.style.width = `${pct}%`;
        label.textContent = `${pct}%`;
        setter(pct);
      };

      let dragging = false;
      track.addEventListener('mousedown', (e) => {
        dragging = true;
        updateFromEvent(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (dragging) updateFromEvent(e);
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
      });
    };

    if (this.volTrack) {
      handleSlider(this.volTrack, this.volFill, this.volLabel, (val) => {
        this.volume = val;
        if (api && api.invoke) api.invoke('vorssaint:set-volume', val).catch(() => {});
      });
    }

    if (this.brightTrack) {
      handleSlider(this.brightTrack, this.brightFill, this.brightLabel, (val) => {
        this.brightness = val;
        if (api && api.invoke) api.invoke('vorssaint:set-brightness', val).catch(() => {});
      });
    }
  }

  // --- 5. Drawers & Quick Actions ---
  initActions() {
    const btnMixer = document.getElementById('btn-action-mixer');
    if (btnMixer) {
      btnMixer.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPanel('panel-mixer');
      });
    }

    const btnAwake = document.getElementById('btn-action-awake');
    if (btnAwake) {
      btnAwake.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isAwakeActive = !this.isAwakeActive;
        btnAwake.classList.toggle('active', this.isAwakeActive);
        if (api && api.invoke) {
          api.invoke('vorssaint:keep-awake-set', this.isAwakeActive ? 'indefinite' : 'off');
        }
        if (this.isAwakeActive) this.triggerMoment('wakeUp');
      });
    }

    const btnTimer = document.getElementById('btn-action-timer');
    if (btnTimer) {
      btnTimer.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPanel('panel-timer');
      });
    }

    const btnCal = document.getElementById('btn-action-calendar');
    if (btnCal) {
      btnCal.addEventListener('click', (e) => {
        e.stopPropagation();
        const todayEl = document.getElementById('cal-today-text');
        if (todayEl) {
          const d = new Date();
          todayEl.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        }
        this.openPanel('panel-calendar');
      });
    }

    const btnAgents = document.getElementById('btn-action-agents');
    if (btnAgents) {
      btnAgents.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPanel('panel-agents');
        this.refreshLiveStatus();
      });
    }

    const btnShelf = document.getElementById('btn-action-shelf');
    if (btnShelf) {
      btnShelf.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPanel('panel-shelf');
      });
    }

    const btnOpenMenuPanel = document.getElementById('btn-island-menu-panel');
    if (btnOpenMenuPanel) {
      btnOpenMenuPanel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && api.invoke) api.invoke('vorssaint:open-panel');
      });
    }
  }

  initDrawers() {
    document.querySelectorAll('.panel-back-btn[data-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.getAttribute('data-close');
        const p = document.getElementById(pid);
        if (p) p.style.display = 'none';
      });
    });

    // Timer Ruler Presets
    document.querySelectorAll('.preset-chip[data-min]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const mins = parseInt(chip.getAttribute('data-min'), 10) || 25;
        this.timerSeconds = mins * 60;
        const m = mins.toString().padStart(2, '0');
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) timerDisplay.textContent = `${m}:00`;
      });
    });

    // Timer Start / Reset
    const toggleTimerBtn = document.getElementById('timer-toggle-btn');
    const resetTimerBtn = document.getElementById('timer-reset-btn');
    const timerDisplay = document.getElementById('timer-display');

    if (toggleTimerBtn) {
      toggleTimerBtn.addEventListener('click', () => {
        this.timerRunning = !this.timerRunning;
        toggleTimerBtn.textContent = this.timerRunning ? 'Pause' : 'Start';

        if (this.timerRunning) {
          this.timerInterval = setInterval(() => {
            if (this.timerSeconds > 0) {
              this.timerSeconds--;
              const m = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
              const s = (this.timerSeconds % 60).toString().padStart(2, '0');
              if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;
            } else {
              clearInterval(this.timerInterval);
              this.timerRunning = false;
              if (toggleTimerBtn) toggleTimerBtn.textContent = 'Start';
              this.playTimerChime();
              this.triggerMoment('hop');
            }
          }, 1000);
        } else {
          clearInterval(this.timerInterval);
        }
      });
    }

    if (resetTimerBtn) {
      resetTimerBtn.addEventListener('click', () => {
        clearInterval(this.timerInterval);
        this.timerRunning = false;
        this.timerSeconds = 25 * 60;
        if (timerDisplay) timerDisplay.textContent = '25:00';
        if (toggleTimerBtn) toggleTimerBtn.textContent = 'Start';
      });
    }
  }

  playTimerChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch { /* no audio */ }
  }

  // --- 6. Drop Shelf ---
  initDropShelf() {
    const zone = document.getElementById('drop-shelf-zone');
    const grid = document.getElementById('shelf-items-grid');
    if (!zone || !grid) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        files.forEach((f) => {
          const chip = document.createElement('div');
          chip.className = 'shelf-chip';
          chip.innerHTML = `📄 <span>${f.name}</span>`;
          grid.appendChild(chip);
        });
        this.triggerMoment('hop');
      }
    });
  }

  openPanel(panelId) {
    this.closeAllPanels();
    const p = document.getElementById(panelId);
    if (p) p.style.display = 'block';
  }

  closeAllPanels() {
    document.querySelectorAll('.slide-panel').forEach((p) => {
      p.style.display = 'none';
    });
  }

  // --- 7. Real-Time IPC Synchronization ---
  initIpc() {
    if (!api || !api.on) return;

    // Listen for Mascot appearance/style updates from Settings Hub
    api.on('vorssaint:mascot-config-changed', (cfg) => {
      if (!cfg) return;
      const opts = {
        style: cfg.mascotStyle || 'minimal',
        shape: cfg.mascotShape || 'ball',
        palette: cfg.mascotPalette || 'pearl',
      };
      if (this.notchMascot) this.notchMascot.configure(opts);
      if (this.stageMascot) this.stageMascot.configure(opts);
    });

    // Listen for moment triggers
    api.on('vorssaint:mascot-moment-triggered', (moment) => {
      this.triggerMoment(moment);
    });

    // Full-Duplex Voice Mascot States
    api.on('voice:state', (voiceState) => {
      if (this.notchMascot && typeof this.notchMascot.setVoiceState === 'function') {
        this.notchMascot.setVoiceState(voiceState);
      }
      if (this.stageMascot && typeof this.stageMascot.setVoiceState === 'function') {
        this.stageMascot.setVoiceState(voiceState);
      }
    });

    api.on('voice:speaking', (isSpeaking) => {
      const state = isSpeaking ? 'speaking' : 'idle';
      if (this.notchMascot && typeof this.notchMascot.setVoiceState === 'function') {
        this.notchMascot.setVoiceState(state);
      }
      if (this.stageMascot && typeof this.stageMascot.setVoiceState === 'function') {
        this.stageMascot.setVoiceState(state);
      }
    });

    // Fetch initial settings
    if (api.invoke) {
      api.invoke('vorssaint:settings-get').then((cfg) => {
        if (!cfg) return;
        const opts = {
          style: cfg.mascotStyle || 'minimal',
          shape: cfg.mascotShape || 'ball',
          palette: cfg.mascotPalette || 'pearl',
        };
        if (this.notchMascot) this.notchMascot.configure(opts);
        if (this.stageMascot) this.stageMascot.configure(opts);
      }).catch(() => {});
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.vorssaintIsland = new VorssaintIslandController();
});
