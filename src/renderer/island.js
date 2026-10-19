'use strict';

// Standalone Device Extension Dynamic Island Controller
// Mirroring Vorssaint's macOS Dynamic Island & Notch Mascot

const api = window.buddy;

class IslandMascot {
  constructor() {
    this.avatar = document.getElementById('island-dot-avatar');
    this.shell = document.getElementById('island-shell');
    this.title = document.getElementById('island-title');
    this.statusDot = document.getElementById('island-status-dot');
    this.isExpanded = false;
    this.blinkTimer = null;

    this.initAvatar();
    this.initInteractions();
    this.initIpcListeners();
    this.pollTelemetry();
    setInterval(() => this.pollTelemetry(), 4000);
  }

  async pollTelemetry() {
    if (!api || !api.invoke) return;
    try {
      const [host, hw, mesh, dagStatus] = await Promise.all([
        api.invoke('host:info').catch(() => null),
        api.invoke('local:hardware').catch(() => null),
        api.invoke('mesh:status').catch(() => null),
        api.invoke('autonomous:status').catch(() => null),
      ]);

      // 1. Role & Device
      const roleEl = document.getElementById('im-node-role');
      const pillEl = document.getElementById('island-node-pill');
      if (host) {
        const isSat = host.nodeRole === 'satellite';
        const roleText = isSat ? 'Satellite Co-Proc' : 'Host Core Brain';
        if (roleEl) roleEl.textContent = roleText;
        if (pillEl) pillEl.textContent = isSat ? 'Satellite' : 'Host Core';
      }

      // 2. Platform & Specs
      const platEl = document.getElementById('im-platform-val');
      if (platEl && hw && hw.hardware) {
        const h = hw.hardware;
        const gpuName = (h.gpu && h.gpu !== 'No dedicated GPU') ? h.gpu.split(' ')[0] : 'Windows PC';
        platEl.textContent = `${gpuName} (${h.ramGB || 16}GB)`;
      }

      // 3. Mesh Link
      const meshEl = document.getElementById('im-mesh-val');
      if (meshEl && mesh) {
        const peers = (mesh.activePeers && mesh.activePeers.length) || mesh.peerCount || 0;
        meshEl.textContent = peers > 0 ? `${peers} Peer${peers > 1 ? 's' : ''} (UDP:4045)` : 'UDP:4045 Active';
      }

      // 4. Autonomous DAG
      const dagEl = document.getElementById('im-dag-val');
      if (dagEl) {
        if (dagStatus && dagStatus.progress) {
          dagEl.textContent = `DAG ${dagStatus.progress.percentage}% Done`;
        } else {
          dagEl.textContent = 'DAG Ready';
        }
      }
    } catch {
      // Telemetry poll non-fatal
    }
  }

  initAvatar() {
    // Periodic random blinking like a living companion
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
    void this.avatar.offsetWidth; // trigger reflow
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
    setTimeout(() => this.setStatus('Mave Core', 'idle'), 2400);
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
  }

  async collapse() {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    if (this.shell) this.shell.classList.remove('is-expanded');
    if (api && api.invoke) {
      await api.invoke('island:collapse').catch(() => {});
    }
  }

  initInteractions() {
    // Clicking compact pill expands to HUD
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

    // Pet button in expanded HUD
    const petBtn = document.getElementById('island-pet-btn');
    if (petBtn) petBtn.addEventListener('click', () => this.pet());

    // Collapse button
    const collapseBtn = document.getElementById('island-collapse-btn');
    if (collapseBtn) collapseBtn.addEventListener('click', () => this.collapse());

    // Keyboard Esc collapses HUD
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) this.collapse();
    });

    // Tool actions
    const toolChat = document.getElementById('tool-chat');
    if (toolChat) {
      toolChat.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'home').catch(() => {});
      });
    }

    const toolVoice = document.getElementById('tool-voice');
    if (toolVoice) {
      toolVoice.addEventListener('click', async () => {
        if (api && api.invoke) {
          const active = await api.invoke('voice-mode:toggle').catch(() => false);
          if (active) {
            this.hop();
            this.setStatus('🎙️ Voice Active', 'listening');
          } else {
            this.setStatus('Voice Muted', 'idle');
            setTimeout(() => this.setStatus('Mave Core', 'idle'), 1800);
          }
        }
      });
    }

    const toolCmd = document.getElementById('tool-cmd');
    if (toolCmd) {
      toolCmd.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) {
          api.invoke('terminal:open').catch(() => {
            api.invoke('island:open-main', 'terminal').catch(() => {});
          });
        }
      });
    }

    const toolSettings = document.getElementById('tool-settings');
    if (toolSettings) {
      toolSettings.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) api.invoke('app:open-settings', 'assistant').catch(() => {});
      });
    }
  }

  initIpcListeners() {
    if (!api || !api.on) return;

    // Listen for speech events
    api.on('voice:speaking', (isSpeaking) => {
      if (isSpeaking) {
        this.hop();
        this.setStatus('Speaking…', 'speaking');
      } else {
        this.setStatus('Listening…', 'listening');
      }
    });

    // Listen for agent state (idle, processing, acting, responding)
    api.on('state', (state) => {
      if (state === 'processing' || state === 'acting') {
        this.setStatus(state === 'acting' ? 'Operating Screen…' : 'Thinking…', 'thinking');
      } else if (state === 'idle') {
        this.setStatus('Mave Core', 'idle');
      }
    });

    // Listen for AutoGPT Autonomous Goal updates
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

    // Direct updates from main process
    api.on('island:update', (payload) => {
      if (!payload) return;
      if (payload.title) this.setStatus(payload.title, payload.mood || 'idle');
      if (payload.role) {
        const r = document.getElementById('im-node-role');
        if (r) r.textContent = payload.role;
      }
    });

    // Listen for Sentinel Network Connectivity Transitions
    api.on('sentinel:network-change', (data) => {
      if (!data) return;
      if (data.online) {
        this.hop();
        this.setStatus('Online 🌐', 'idle');
        setTimeout(() => this.setStatus('Mave Core', 'idle'), 3000);
      } else {
        this.setStatus('Offline 🟡', 'idle');
        setTimeout(() => this.setStatus('Mave Core', 'idle'), 3000);
      }
      this.pollTelemetry();
    });

    // Listen for Sentinel Incoming Activity (Telegram, Mesh, Mail)
    api.on('sentinel:incoming-activity', (data) => {
      if (!data) return;
      this.hop();
      const preview = (data.preview || '').slice(0, 16);
      this.setStatus(`${data.source || 'Msg'}: ${preview}`, 'speaking');
      setTimeout(() => this.setStatus('Mave Core', 'idle'), 4000);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new IslandMascot();
});
