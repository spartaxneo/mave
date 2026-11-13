'use strict';

/**
 * MAVE Virtual Computer Frontend Controller
 * Renders the live virtual display stream (1280x800), manages the virtual cursor overlay,
 * displays real-time execution telemetry, and handles manual takeover input routing.
 */

class VirtualComputerView {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.cursorEl = null;
    this.taskBanner = null;
    this.stepBanner = null;
    this.takeoverBtn = null;
    this.exportBtn = null;
    this.inTakeover = false;
    this.virtualWidth = 1280;
    this.virtualHeight = 800;
    this.activeTask = 'Ready';
    this.activeStep = 'Awaiting instructions...';
    this.lastFrameTime = 0;
    this.fpsCount = 0;
  }

  init() {
    this.canvas = document.getElementById('vc-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.cursorEl = document.getElementById('vc-cursor');
    this.taskBanner = document.getElementById('vc-task-text');
    this.stepBanner = document.getElementById('vc-step-text');
    this.takeoverBtn = document.getElementById('vc-btn-takeover');
    this.exportBtn = document.getElementById('vc-btn-export');

    this._drawInitialFrame();
    this._bindEvents();
    this._listenToIpc();
    this.refreshStatus();
  }

  _drawInitialFrame() {
    if (!this.ctx) return;
    // Render high-fidelity standby desktop
    const gradient = this.ctx.createLinearGradient(0, 0, this.virtualWidth, this.virtualHeight);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#020617');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);

    // Grid lines for crisp virtual workspace aesthetic
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.virtualWidth; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.virtualHeight);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.virtualHeight; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.virtualWidth, y);
      this.ctx.stroke();
    }

    // Centered Virtual Desktop Badge
    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    this.ctx.beginPath();
    this.ctx.roundRect(this.virtualWidth / 2 - 180, this.virtualHeight / 2 - 50, 360, 100, 12);
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    this.ctx.stroke();

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('MAVE Virtual Computer', this.virtualWidth / 2, this.virtualHeight / 2 - 10);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.fillText('Isolated Guest Environment • Host PC Protected', this.virtualWidth / 2, this.virtualHeight / 2 + 20);
  }

  _bindEvents() {
    if (this.takeoverBtn) {
      this.takeoverBtn.addEventListener('click', async () => {
        if (!window.buddy) return;
        if (this.inTakeover) {
          const res = await window.buddy.invoke('vc:stop-takeover');
          this.setTakeoverMode(false);
        } else {
          const res = await window.buddy.invoke('vc:start-takeover');
          this.setTakeoverMode(true);
        }
      });
    }

    if (this.exportBtn) {
      this.exportBtn.addEventListener('click', async () => {
        if (!window.buddy) return;
        try {
          const files = await window.buddy.invoke('vc:list-files', '');
          this._showExportModal(files);
        } catch (err) {
          alert(`Could not list guest files: ${err.message}`);
        }
      });
    }

    // Canvas Takeover Interaction Handlers
    if (this.canvas) {
      this.canvas.addEventListener('mousemove', (e) => {
        if (!this.inTakeover || !window.buddy) return;
        const pt = this._canvasToVirtualCoords(e);
        this._updateCursorVisual(pt.x, pt.y);
        window.buddy.invoke('vc:user-input', { type: 'move', x: pt.x, y: pt.y }).catch(() => {});
      });

      this.canvas.addEventListener('click', (e) => {
        if (!this.inTakeover || !window.buddy) return;
        const pt = this._canvasToVirtualCoords(e);
        window.buddy.invoke('vc:user-input', { type: 'click', x: pt.x, y: pt.y, button: 'left' }).catch(() => {});
      });

      this.canvas.addEventListener('contextmenu', (e) => {
        if (!this.inTakeover || !window.buddy) return;
        e.preventDefault();
        const pt = this._canvasToVirtualCoords(e);
        window.buddy.invoke('vc:user-input', { type: 'click', x: pt.x, y: pt.y, button: 'right' }).catch(() => {});
      });

      this.canvas.addEventListener('wheel', (e) => {
        if (!this.inTakeover || !window.buddy) return;
        e.preventDefault();
        window.buddy.invoke('vc:user-input', { type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY }).catch(() => {});
      }, { passive: false });
    }
  }

  _canvasToVirtualCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.virtualWidth / rect.width;
    const scaleY = this.virtualHeight / rect.height;
    return {
      x: Math.round((e.clientX - rect.x) * scaleX),
      y: Math.round((e.clientY - rect.y) * scaleY),
    };
  }

  _updateCursorVisual(vx, vy) {
    if (!this.cursorEl || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = (vx / this.virtualWidth) * rect.width;
    const py = (vy / this.virtualHeight) * rect.height;
    this.cursorEl.style.transform = `translate(${px}px, ${py}px)`;
  }

  setTakeoverMode(active) {
    this.inTakeover = Boolean(active);
    if (this.takeoverBtn) {
      if (this.inTakeover) {
        this.takeoverBtn.textContent = 'Release Control';
        this.takeoverBtn.classList.add('vc-btn-active');
        this.canvas.style.cursor = 'default';
      } else {
        this.takeoverBtn.textContent = 'Take Control';
        this.takeoverBtn.classList.remove('vc-btn-active');
        this.canvas.style.cursor = 'not-allowed';
      }
    }
  }

  _listenToIpc() {
    if (!window.buddy) return;

    window.buddy.on('vc:frame', (frame) => {
      this._renderFrame(frame);
    });

    window.buddy.on('vc:task-update', (data) => {
      if (!data) return;
      this.activeTask = data.task || 'Autonomous Task';
      this.activeStep = data.step || 'Working...';
      if (this.taskBanner) this.taskBanner.textContent = this.activeTask;
      if (this.stepBanner) this.stepBanner.textContent = this.activeStep;
    });

    window.buddy.on('vc:task-progress', (data) => {
      if (!data) return;
      this.activeStep = data.step || 'Processing...';
      if (this.stepBanner) this.stepBanner.textContent = this.activeStep;
    });

    window.buddy.on('vc:takeover-update', (data) => {
      if (data && typeof data.inTakeover === 'boolean') {
        this.setTakeoverMode(data.inTakeover);
      }
    });
  }

  _renderFrame(frame) {
    if (!this.ctx || !frame) return;
    const img = new Image();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0, this.virtualWidth, this.virtualHeight);
    };
    if (typeof frame === 'string') {
      img.src = frame.startsWith('data:') ? frame : `data:image/png;base64,${frame}`;
    } else if (frame.base64) {
      img.src = `data:image/png;base64,${frame.base64}`;
    }
  }

  async refreshStatus() {
    if (!window.buddy) return;
    try {
      const status = await window.buddy.invoke('vc:get-status');
      if (status) {
        this.activeTask = status.activeTask || 'Ready';
        this.activeStep = status.currentStep || 'Idle';
        if (this.taskBanner) this.taskBanner.textContent = this.activeTask;
        if (this.stepBanner) this.stepBanner.textContent = this.activeStep;
        if (status.cursor) {
          this._updateCursorVisual(status.cursor.x, status.cursor.y);
        }
        this.setTakeoverMode(status.inManualTakeover);
      }
    } catch {}
  }

  _showExportModal(files) {
    let listHtml = '';
    if (Array.isArray(files) && files.length > 0) {
      listHtml = files.map(f => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(255,255,255,0.04); border-radius:6px; margin-bottom:6px;">
          <span style="font-family:monospace; font-size:12px; color:#f8fafc;">${f.name || f}</span>
          <button class="vc-btn" data-export-file="${f.name || f}" style="padding:3px 8px; font-size:11px;">Export to Host</button>
        </div>
      `).join('');
    } else {
      listHtml = '<div style="color:#94a3b8; font-size:12px; padding:12px; text-align:center;">No files currently in guest workspace.</div>';
    }

    const modal = document.createElement('div');
    modal.className = 'vc-export-modal-backdrop';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px);';
    modal.innerHTML = `
      <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.1); border-radius:12px; width:460px; max-height:80vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="padding:14px 18px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:14px; font-weight:700; color:#f8fafc;">Export Files from Virtual Computer</h3>
          <button id="vc-modal-close" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">&times;</button>
        </div>
        <div style="padding:16px; overflow-y:auto; flex:1;">
          <p style="margin:0 0 12px 0; font-size:12px; color:#94a3b8;">Files created by MAVE inside its guest sandbox can be safely exported to your host computer.</p>
          ${listHtml}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#vc-modal-close').onclick = () => modal.remove();
    modal.querySelectorAll('[data-export-file]').forEach(btn => {
      btn.onclick = async () => {
        const fileName = btn.dataset.exportFile;
        btn.textContent = 'Exporting...';
        try {
          await window.buddy.invoke('vc:export-file', { guestPath: fileName });
          btn.textContent = 'Exported!';
          btn.style.color = '#38bdf8';
        } catch (err) {
          alert(`Export failed: ${err.message}`);
          btn.textContent = 'Failed';
        }
      };
    });
  }
}

// Global instance setup
let vcViewInstance = null;

function initVirtualComputerUI() {
  if (!vcViewInstance) {
    vcViewInstance = new VirtualComputerView();
  }
  vcViewInstance.init();
  return vcViewInstance;
}

if (typeof window !== 'undefined') {
  window.initVirtualComputerUI = initVirtualComputerUI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VirtualComputerView, initVirtualComputerUI };
}
