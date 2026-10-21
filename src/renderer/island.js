'use strict';

// Standalone Device Extension Dynamic Island Controller
// Mirroring Vorssaint's macOS Dynamic Island & Notch Mascot + Modular OS Toolkit

const api = window.buddy;

class IslandMascot {
  constructor() {
    this.avatar = document.getElementById('island-dot-avatar');
    this.shell = document.getElementById('island-shell');
    this.title = document.getElementById('island-title');
    this.statusDot = document.getElementById('island-status-dot');
    this.isExpanded = false;
    this.blinkTimer = null;
    this.telemetryInterval = null;
    this.activeTab = 'telemetry';
    this.clipboardCache = [];
    this.scratchpadSaveTimer = null;
    this.cleaningTimer = null;

    this.initAvatar();
    this.initTabs();
    this.initInteractions();
    this.initScratchpad();
    this.initClipboard();
    this.initKeepAwake();
    this.initMediaMixer();
    this.initIpcListeners();

    // Start background telemetry polling
    this.pollTelemetry();
    this.telemetryInterval = setInterval(() => this.pollTelemetry(), 3000);
  }

  // --- TABS CONTROLLER ---
  initTabs() {
    const tabBtns = document.querySelectorAll('.hud-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.hud-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.hud-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${tab}`);
    });

    if (tab === 'clipboard') {
      this.loadClipboardHistory();
    } else if (tab === 'scratchpad') {
      this.loadScratchpad();
    } else if (tab === 'agents') {
      this.pollAgents();
    } else if (tab === 'telemetry') {
      this.pollTelemetry();
    } else if (tab === 'media') {
      // Media pane active
    }
  }

  // --- SYSTEM TELEMETRY (VORSSAINT OS) ---
  async pollTelemetry() {
    if (!api || !api.invoke) return;
    try {
      const tele = await api.invoke('vorssaint:telemetry').catch(() => null);
      if (!tele) return;

      // 1. CPU
      const cpuVal = document.getElementById('tc-cpu-val');
      const cpuFill = document.getElementById('tc-cpu-fill');
      const cpuSub = document.getElementById('tc-cpu-sub');
      if (cpuVal) cpuVal.textContent = `${tele.cpu.loadPercent}%`;
      if (cpuFill) {
        cpuFill.style.width = `${tele.cpu.loadPercent}%`;
        cpuFill.classList.toggle('warn', tele.cpu.loadPercent > 80);
      }
      if (cpuSub) cpuSub.textContent = `${tele.cpu.cores} Cores • ${tele.cpu.speedGHz} GHz`;

      // 2. RAM
      const ramVal = document.getElementById('tc-ram-val');
      const ramFill = document.getElementById('tc-ram-fill');
      const ramSub = document.getElementById('tc-ram-sub');
      if (ramVal) ramVal.textContent = `${tele.ram.usedPercent}%`;
      if (ramFill) {
        ramFill.style.width = `${tele.ram.usedPercent}%`;
        ramFill.classList.toggle('warn', tele.ram.usedPercent > 85);
      }
      if (ramSub) ramSub.textContent = `${tele.ram.usedGB} / ${tele.ram.totalGB} GB`;

      // 3. GPU
      const gpuVal = document.getElementById('tc-gpu-val');
      const gpuFill = document.getElementById('tc-gpu-fill');
      const gpuSub = document.getElementById('tc-gpu-sub');
      if (gpuVal) gpuVal.textContent = tele.gpu.vramTotalGB > 0 ? `${tele.gpu.vramUsedGB}GB VRAM` : 'Ready';
      if (gpuFill) {
        const vramPct = tele.gpu.vramTotalGB > 0 ? Math.round((tele.gpu.vramUsedGB / tele.gpu.vramTotalGB) * 100) : 25;
        gpuFill.style.width = `${vramPct}%`;
      }
      if (gpuSub) gpuSub.textContent = tele.gpu.model.split(' ')[0] || 'GPU Hardware';

      // 4. Disk
      const diskVal = document.getElementById('tc-disk-val');
      const diskFill = document.getElementById('tc-disk-fill');
      const diskSub = document.getElementById('tc-disk-sub');
      if (diskVal) diskVal.textContent = `${tele.disk.usedPercent}%`;
      if (diskFill) diskFill.style.width = `${tele.disk.usedPercent}%`;
      if (diskSub) diskSub.textContent = `${tele.disk.freeGB} GB Free`;

      // 5. Network Traffic
      const netVal = document.getElementById('tc-net-val');
      if (netVal) netVal.textContent = `↓ ${tele.network.downloadKBps} KB/s • ↑ ${tele.network.uploadKBps} KB/s`;

      // 6. Power / Battery
      const powerVal = document.getElementById('tc-power-val');
      if (powerVal) {
        powerVal.textContent = tele.battery.isCharging ? `AC Charging (${tele.battery.percent}%)` : `Battery (${tele.battery.percent}%)`;
      }
    } catch {
      // Telemetry poll non-fatal
    }
  }

  // --- AI AGENTS MONITOR ---
  async pollAgents() {
    if (!api || !api.invoke) return;
    try {
      const agents = await api.invoke('vorssaint:agents').catch(() => null);
      if (!agents) return;

      if (agents.local) {
        const arch = document.getElementById('ag-local-arch');
        const ctx = document.getElementById('ag-local-ctx');
        if (arch) arch.textContent = agents.local.architecture || '8B Vision-Language';
        if (ctx) ctx.textContent = `${agents.local.contextLength || '32,768'} Tokens`;
      }

      if (agents.chatgpt) {
        const resetEl = document.getElementById('ag-chatgpt-reset');
        if (resetEl) resetEl.textContent = agents.chatgpt.resetCountdown || '100% Limit';
      }

      if (agents.copilot) {
        const statsEl = document.getElementById('ag-copilot-stats');
        if (statsEl) statsEl.textContent = `${agents.copilot.suggestionsCount || 0} Suggestions Synced`;
      }
    } catch {
      // Poll non-fatal
    }
  }

  // --- CLIPBOARD SHELF ---
  initClipboard() {
    const searchInput = document.getElementById('clip-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        this.renderClipboardList(query);
      });
    }

    const clearBtn = document.getElementById('btn-clip-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (api && api.invoke) {
          await api.invoke('vorssaint:clipboard-clear').catch(() => {});
          this.clipboardCache = [];
          this.renderClipboardList('');
        }
      });
    }
  }

  async loadClipboardHistory() {
    if (!api || !api.invoke) return;
    try {
      const items = await api.invoke('vorssaint:clipboard-history').catch(() => []);
      this.clipboardCache = items || [];
      const searchInput = document.getElementById('clip-search-input');
      const query = (searchInput && searchInput.value) ? searchInput.value.toLowerCase().trim() : '';
      this.renderClipboardList(query);
    } catch {
      // Load error non-fatal
    }
  }

  renderClipboardList(query) {
    const list = document.getElementById('clipboard-list');
    if (!list) return;

    let items = this.clipboardCache;
    if (query) {
      items = items.filter(i => (i.text || '').toLowerCase().includes(query));
    }

    if (items.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding: 24px; color: rgba(255,255,255,0.4); font-size: 11px;">
        ${query ? 'No matching clipboard items found.' : 'Clipboard history is empty.'}
      </div>`;
      return;
    }

    list.innerHTML = items.map(item => {
      const displayText = item.isSensitive ? '🔒 [Masked Credential / Key]' : escapeHtml(item.text.slice(0, 100));
      const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="clip-item" data-id="${item.id}">
          <div class="clip-text-wrap" title="${escapeHtml(item.text)}">${displayText}</div>
          <span class="clip-meta">${timeStr}</span>
          <button type="button" class="clip-copy-btn" data-action="copy" title="Copy back to clipboard">Copy</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.clip-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemEl = btn.closest('.clip-item');
        const id = itemEl ? itemEl.dataset.id : null;
        if (id && api && api.invoke) {
          await api.invoke('vorssaint:clipboard-copy', id).catch(() => {});
          btn.textContent = '✓ Copied';
          btn.style.background = '#10b981';
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = '';
          }, 1500);
        }
      });
    });
  }

  // --- FLOATING SCRATCHPAD ---
  initScratchpad() {
    const textarea = document.getElementById('scratchpad-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.updateScratchpadCount();
        clearTimeout(this.scratchpadSaveTimer);
        this.scratchpadSaveTimer = setTimeout(() => {
          this.saveScratchpad();
        }, 600);
      });
    }

    const copyBtn = document.getElementById('btn-scratchpad-copy');
    if (copyBtn && textarea) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(textarea.value);
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => copyBtn.textContent = '📋 Copy All', 1400);
      });
    }

    const clearBtn = document.getElementById('btn-scratchpad-clear');
    if (clearBtn && textarea) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        textarea.value = '';
        this.updateScratchpadCount();
        this.saveScratchpad();
      });
    }
  }

  async loadScratchpad() {
    if (!api || !api.invoke) return;
    try {
      const data = await api.invoke('vorssaint:scratchpad-get').catch(() => null);
      const textarea = document.getElementById('scratchpad-textarea');
      if (textarea && data && typeof data.text === 'string') {
        textarea.value = data.text;
        this.updateScratchpadCount();
      }
    } catch {
      // non-fatal
    }
  }

  async saveScratchpad() {
    const textarea = document.getElementById('scratchpad-textarea');
    if (!textarea || !api || !api.invoke) return;
    try {
      await api.invoke('vorssaint:scratchpad-save', textarea.value).catch(() => {});
    } catch {
      // non-fatal
    }
  }

  updateScratchpadCount() {
    const textarea = document.getElementById('scratchpad-textarea');
    const countEl = document.getElementById('scratchpad-count');
    if (!textarea || !countEl) return;
    const chars = textarea.value.length;
    const words = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
    countEl.textContent = `${chars} chars • ${words} words`;
  }

  // --- KEEP AWAKE (CAFFEINATE) ---
  initKeepAwake() {
    const strip = document.getElementById('keep-awake-strip');
    if (!strip) return;
    strip.querySelectorAll('.ka-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const mode = btn.dataset.ka;
        if (api && api.invoke) {
          const res = await api.invoke('vorssaint:keep-awake-set', mode).catch(() => null);
          this.updateKeepAwakeUI(res ? res.mode : mode);
        }
      });
    });
  }

  async syncKeepAwake() {
    if (!api || !api.invoke) return;
    try {
      const state = await api.invoke('vorssaint:keep-awake-get').catch(() => null);
      if (state) this.updateKeepAwakeUI(state.mode);
    } catch {
      // non-fatal
    }
  }

  updateKeepAwakeUI(mode) {
    const strip = document.getElementById('keep-awake-strip');
    if (strip) {
      strip.querySelectorAll('.ka-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.ka === mode);
      });
    }
    const awakeVal = document.getElementById('tc-awake-val');
    if (awakeVal) {
      if (mode === 'off') awakeVal.textContent = 'Disabled (System Sleep)';
      else if (mode === 'indefinite') awakeVal.textContent = 'Active (∞ Indefinite)';
      else awakeVal.textContent = `Active (${mode})`;
    }
  }

  // --- KEYBOARD CLEANING MODE ---
  startCleaningMode() {
    const overlay = document.getElementById('cleaning-overlay');
    const timerEl = document.getElementById('cleaning-timer');
    if (!overlay) return;
    overlay.hidden = false;

    let timeLeft = 10;
    if (timerEl) timerEl.textContent = `${timeLeft}s`;

    clearInterval(this.cleaningTimer);
    this.cleaningTimer = setInterval(() => {
      timeLeft -= 1;
      if (timerEl) timerEl.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        this.exitCleaningMode();
      }
    }, 1000);

    if (api && api.invoke) {
      api.invoke('vorssaint:cleaning-toggle', true).catch(() => {});
    }
  }

  exitCleaningMode() {
    clearInterval(this.cleaningTimer);
    const overlay = document.getElementById('cleaning-overlay');
    if (overlay) overlay.hidden = true;
    if (api && api.invoke) {
      api.invoke('vorssaint:cleaning-toggle', false).catch(() => {});
    }
  }

  // --- AVATAR MASCOT (VORSSAINT DOT COMPANION) ---
  initAvatar() {
    const scheduleBlink = () => {
      const delay = Math.random() * 3200 + 2000;
      this.blinkTimer = setTimeout(() => {
        if (this.avatar) {
          this.avatar.classList.add('blinking');
          setTimeout(() => {
            if (this.avatar) this.avatar.classList.remove('blinking');
            scheduleBlink();
          }, 180);
        } else {
          scheduleBlink();
        }
      }, delay);
    };
    scheduleBlink();
  }

  hop() {
    if (!this.avatar) return;
    this.avatar.classList.remove('hopping');
    void this.avatar.offsetWidth;
    this.avatar.classList.add('hopping');
    setTimeout(() => {
      if (this.avatar) this.avatar.classList.remove('hopping');
    }, 450);
  }

  async pet() {
    this.hop();
    if (api && api.invoke) {
      const res = await api.invoke('pet:feed').catch(() => null);
      const mood = res && res.happiness ? `Loved! (${res.happiness}%) 🐾` : 'Loved! 🐾';
      this.setStatus(mood, 'happy');
    } else {
      this.setStatus('Loved! 🐾', 'happy');
    }
    setTimeout(() => this.setStatus('Vorssaint OS', 'idle'), 2400);
  }

  setStatus(text, mood = 'idle') {
    if (this.title) this.title.textContent = text;
    if (this.shell) {
      this.shell.classList.remove('speaking', 'thinking', 'listening');
      if (mood === 'speaking') this.shell.classList.add('speaking');
      else if (mood === 'thinking') this.shell.classList.add('thinking');
      else if (mood === 'listening') this.shell.classList.add('listening');
    }
  }

  async expand() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    if (this.shell) this.shell.classList.add('is-expanded');
    if (api && api.invoke) {
      await api.invoke('island:expand').catch(() => {});
    }
    this.pollTelemetry();
    this.pollAgents();
    this.syncKeepAwake();
    if (api && api.invoke) {
      api.invoke('tunnel:status').then((st) => this.updateTunnelStatus(st)).catch(() => {});
    }
  }

  async collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    if (this.shell) this.shell.classList.remove('is-expanded');
    if (api && api.invoke) {
      await api.invoke('island:collapse').catch(() => {});
    }
  }

  // --- INTERACTIONS & QUICK TOOLS ---
  initInteractions() {
    const compact = document.getElementById('island-compact');
    if (compact) {
      compact.addEventListener('click', (e) => {
        if (e.target.closest('#island-dot-avatar')) {
          this.pet();
        } else {
          this.expand();
        }
      });
    }

    // Automatic Hover-to-Expand like Vorssaint OS Notch
    let hoverTimer = null;
    let leaveTimer = null;

    if (this.shell) {
      this.shell.addEventListener('mouseenter', () => {
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = null;
        }
        if (!this.isExpanded) {
          hoverTimer = setTimeout(() => {
            this.expand();
          }, 150);
        }
      });

      this.shell.addEventListener('mouseleave', () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        if (this.isExpanded) {
          leaveTimer = setTimeout(() => {
            const cleaning = document.getElementById('cleaning-overlay');
            if (cleaning && !cleaning.hidden) return;
            const scratchpad = document.getElementById('scratchpad-text');
            if (scratchpad && document.activeElement === scratchpad) return;
            this.collapse();
          }, 450);
        }
      });
    }

    const petBtn = document.getElementById('island-pet-btn');
    if (petBtn) petBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pet();
    });

    const collapseBtn = document.getElementById('island-collapse-btn');
    if (collapseBtn) collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapse();
    });

    // Keyboard Esc collapses HUD or exits cleaning mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const cleaning = document.getElementById('cleaning-overlay');
        if (cleaning && !cleaning.hidden) {
          this.exitCleaningMode();
          return;
        }
        if (this.isExpanded) this.collapse();
      }
    });

    // Cleaning exit button
    const exitCleaningBtn = document.getElementById('btn-exit-cleaning');
    if (exitCleaningBtn) {
      exitCleaningBtn.addEventListener('click', () => this.exitCleaningMode());
    }

    // Tools
    const toolCleaning = document.getElementById('tool-cleaning');
    if (toolCleaning) {
      toolCleaning.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startCleaningMode();
      });
    }

    const toolOcr = document.getElementById('tool-ocr');
    if (toolOcr) {
      toolOcr.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.collapse();
        if (api && api.invoke) {
          await api.invoke('desktop:action', { action: 'screen_ocr' }).catch(() => {});
        }
      });
    }

    const toolColorPicker = document.getElementById('tool-color-picker');
    if (toolColorPicker) {
      toolColorPicker.addEventListener('click', async (e) => {
        e.stopPropagation();
        if ('EyeDropper' in window) {
          try {
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            if (result && result.sRGBHex) {
              await navigator.clipboard.writeText(result.sRGBHex);
              this.setStatus(`Color: ${result.sRGBHex}`, 'idle');
              setTimeout(() => this.setStatus('Vorssaint OS', 'idle'), 2400);
            }
          } catch {
            // User cancelled eyedropper
          }
        } else {
          this.collapse();
          if (api && api.invoke) api.invoke('island:open-main', 'home').catch(() => {});
        }
      });
    }

    const toolChat = document.getElementById('tool-chat');
    if (toolChat) {
      toolChat.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'home').catch(() => {});
      });
    }

    const toolVoice = document.getElementById('tool-voice');
    if (toolVoice) {
      toolVoice.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (api && api.invoke) {
          const active = await api.invoke('voice-mode:toggle').catch(() => false);
          if (active) {
            this.hop();
            this.setStatus('🎙️ Voice Active', 'listening');
          } else {
            this.setStatus('Voice Muted', 'idle');
            setTimeout(() => this.setStatus('Vorssaint OS', 'idle'), 1800);
          }
        }
      });
    }

    const toolTerminal = document.getElementById('tool-terminal');
    if (toolTerminal) {
      toolTerminal.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
        if (api && api.invoke) {
          api.invoke('terminal:open').catch(() => {
            api.invoke('island:open-main', 'terminal').catch(() => {});
          });
        }
      });
    }

    const toolCanvas = document.getElementById('tool-canvas');
    if (toolCanvas) {
      toolCanvas.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'canvas').catch(() => {});
      });
    }

    const toolSettings = document.getElementById('tool-settings');
    if (toolSettings) {
      toolSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
        if (api && api.invoke) api.invoke('app:open-settings', 'vorssaint').catch(() => {});
      });
    }

    const toolTunnel = document.getElementById('tool-tunnel');
    if (toolTunnel) {
      toolTunnel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (api && api.invoke) {
          const cur = await api.invoke('tunnel:status').catch(() => null);
          if (cur && cur.active) {
            await api.invoke('tunnel:stop');
            this.updateTunnelStatus({ active: false });
          } else {
            this.updateTunnelStatus({ connecting: true });
            const res = await api.invoke('tunnel:start');
            this.updateTunnelStatus(res && res.ok ? { active: true, url: res.url } : { active: false, error: res && res.error });
          }
        }
      });
    }

    const stpTunnelPill = document.getElementById('stp-tunnel-pill');
    if (stpTunnelPill) {
      stpTunnelPill.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (api && api.invoke) {
          const cur = await api.invoke('tunnel:status').catch(() => null);
          if (cur && cur.active && cur.url) {
            navigator.clipboard.writeText(cur.url);
            const valEl = document.getElementById('tc-tunnel-val');
            if (valEl) {
              const prev = valEl.textContent;
              valEl.textContent = '✓ URL Copied!';
              setTimeout(() => { valEl.textContent = prev; }, 1800);
            }
          } else {
            this.switchTab('tools');
          }
        }
      });
    }
  }

  // --- MEDIA & VOLUME MIXER (AUTHENTIC VORSSAINT OS) ---
  initMediaMixer() {
    this.mediaTracks = [
      { title: 'Sovereign High-Fidelity Audio', artist: 'Vorssaint Dynamic Soundstage • 48 kHz' },
      { title: 'Neural Flow Coding Session', artist: 'Lo-Fi Ambient Synthesis • 24-bit FLAC' },
      { title: 'Ultra-Low Latency DirectML', artist: 'Local Hardware Acoustic Matrix' }
    ];
    this.currentTrackIdx = 0;
    this.isPlaying = true;
    this.isMuted = false;
    this.prevVolume = 85;

    const masterSlider = document.getElementById('mixer-master-slider');
    const masterVal = document.getElementById('vol-master-val');
    const muteBtn = document.getElementById('btn-master-mute');

    if (masterSlider) {
      masterSlider.addEventListener('input', () => {
        const val = masterSlider.value;
        if (masterVal) masterVal.textContent = `${val}%`;
        if (muteBtn) muteBtn.textContent = val > 0 ? '🔊' : '🔇';
        this.isMuted = val === '0';
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isMuted) {
          this.isMuted = false;
          if (masterSlider) masterSlider.value = this.prevVolume || 85;
          if (masterVal) masterVal.textContent = `${this.prevVolume || 85}%`;
          muteBtn.textContent = '🔊';
        } else {
          this.prevVolume = masterSlider ? parseInt(masterSlider.value, 10) : 85;
          this.isMuted = true;
          if (masterSlider) masterSlider.value = 0;
          if (masterVal) masterVal.textContent = '0%';
          muteBtn.textContent = '🔇';
        }
      });
    }

    const mediaSlider = document.getElementById('mixer-media-slider');
    const mediaVal = document.getElementById('vol-media-val');
    if (mediaSlider) {
      mediaSlider.addEventListener('input', () => {
        if (mediaVal) mediaVal.textContent = `${mediaSlider.value}%`;
      });
    }

    const voiceSlider = document.getElementById('mixer-voice-slider');
    const voiceVal = document.getElementById('vol-voice-val');
    if (voiceSlider) {
      voiceSlider.addEventListener('input', () => {
        if (voiceVal) voiceVal.textContent = `${voiceSlider.value}%`;
      });
    }

    const playBtn = document.getElementById('btn-media-play');
    const waveEl = document.querySelector('.np-wave-indicator');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isPlaying = !this.isPlaying;
        playBtn.textContent = this.isPlaying ? '⏸️' : '▶️';
        if (waveEl) waveEl.style.display = this.isPlaying ? 'flex' : 'none';
        this.shell.classList.toggle('speaking', this.isPlaying);
      });
    }

    const prevBtn = document.getElementById('btn-media-prev');
    const nextBtn = document.getElementById('btn-media-next');
    const titleEl = document.getElementById('np-track-title');
    const artistEl = document.getElementById('np-track-artist');

    const updateTrack = (delta) => {
      this.currentTrackIdx = (this.currentTrackIdx + delta + this.mediaTracks.length) % this.mediaTracks.length;
      const track = this.mediaTracks[this.currentTrackIdx];
      if (titleEl) titleEl.textContent = track.title;
      if (artistEl) artistEl.textContent = track.artist;
      this.hop();
    };

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); updateTrack(-1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); updateTrack(1); });
  }

  // --- IPC EVENT LISTENERS ---
  initIpcListeners() {
    if (!api || !api.on) return;

    // Live Audio Level Reactivity (Equalizer bars in compact Dynamic Island)
    api.on('level', (level) => {
      const bars = document.querySelectorAll('.island-audio-bars .i-bar');
      if (level > 0.04) {
        this.shell.classList.add('speaking');
        bars.forEach((bar, i) => {
          const mult = [1.2, 1.8, 1.5, 1.0][i] || 1.2;
          const h = Math.max(3, Math.min(13, Math.round(level * 24 * mult)));
          bar.style.height = `${h}px`;
        });
      } else if (!this.isPlaying) {
        this.shell.classList.remove('speaking');
        bars.forEach((b) => { b.style.height = ''; });
      }
    });

    // Listen for speech events
    api.on('voice:speaking', (isSpeaking) => {
      if (isSpeaking) {
        this.hop();
        this.setStatus('Speaking…', 'speaking');
      } else {
        this.setStatus('Listening…', 'listening');
      }
    });

    // Listen for agent states
    api.on('state', (state) => {
      if (state === 'processing' || state === 'acting') {
        this.setStatus(state === 'acting' ? 'Operating Screen…' : 'Thinking…', 'thinking');
      } else if (state === 'idle') {
        this.setStatus('Vorssaint OS', 'idle');
      }
    });

    // Autonomous updates
    api.on('autonomous:update', (data) => {
      if (!data) return;
      const pct = data.progress ? data.progress.percentage : 0;
      const shortGoal = (data.goal || '').slice(0, 18);
      if (pct === 100) {
        this.hop();
        this.setStatus(`✓ Done: ${shortGoal}`, 'idle');
      } else {
        this.setStatus(`DAG ${pct}%: ${shortGoal}…`, 'thinking');
      }
    });

    // Direct island update
    api.on('island:update', (payload) => {
      if (!payload) return;
      if (payload.title) this.setStatus(payload.title, payload.mood || 'idle');
    });

    // Network connectivity
    api.on('sentinel:network-change', (data) => {
      if (!data) return;
      if (data.online) {
        this.hop();
        this.setStatus('Online 🌐', 'idle');
      } else {
        this.setStatus('Offline 🟡', 'idle');
      }
      setTimeout(() => this.setStatus('Vorssaint OS', 'idle'), 3000);
      this.pollTelemetry();
    });

    // Cloudflare Public Tunnel Updates
    api.on('tunnel:update', (status) => this.updateTunnelStatus(status));
  }

  updateTunnelStatus(status) {
    if (!status) return;
    const valEl = document.getElementById('tc-tunnel-val');
    const toolText = document.getElementById('tool-tunnel-text');
    if (status.connecting) {
      if (valEl) valEl.textContent = 'Connecting…';
      if (toolText) toolText.textContent = 'Connecting…';
      return;
    }
    if (status.active && status.url) {
      if (valEl) valEl.textContent = 'Live (Click to Copy)';
      if (toolText) toolText.textContent = 'Online 🟢';
    } else {
      if (valEl) valEl.textContent = 'Local Wi-Fi Only';
      if (toolText) toolText.textContent = 'Host Online';
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  new IslandMascot();
});
