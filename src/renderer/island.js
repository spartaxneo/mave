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

  pet() {
    this.hop();
    this.setStatus('Loved! 🐾', 'happy');
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
      toolVoice.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'voice').catch(() => {});
      });
    }

    const toolCmd = document.getElementById('tool-cmd');
    if (toolCmd) {
      toolCmd.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'terminal').catch(() => {});
      });
    }

    const toolSettings = document.getElementById('tool-settings');
    if (toolSettings) {
      toolSettings.addEventListener('click', () => {
        this.collapse();
        if (api && api.invoke) api.invoke('island:open-main', 'assistant').catch(() => {});
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
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new IslandMascot();
});
