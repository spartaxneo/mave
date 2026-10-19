'use strict';
// J.A.R.V.I.S. Holographic HUD & Live Real-Time Telemetry Modal Controller for Mave.
// Stark Industries HUD Interface with live CPU, GPU (RTX 5060), VRAM, RAM, and Network telemetry.
// Hotkey: Ctrl+Shift+H.

(() => {
  const api = window.buddy;
  if (!api) return;

  const $ = (id) => document.getElementById(id);
  let isOpen = false;
  let updateTimer = null;

  function openHud() {
    const modal = $('jarvis-hud-modal');
    if (!modal) return;
    isOpen = true;
    modal.hidden = false;
    refreshTelemetry();
    if (!updateTimer) {
      updateTimer = setInterval(refreshTelemetry, 2000);
    }
  }

  function closeHud() {
    const modal = $('jarvis-hud-modal');
    if (!modal) return;
    isOpen = false;
    modal.hidden = true;
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }

  async function refreshTelemetry() {
    if (!isOpen) return;
    try {
      const snap = await api.invoke('jarvis:telemetry');
      if (!snap) return;

      // CPU
      const cpuVal = $('jhud-cpu-val');
      const cpuBar = $('jhud-cpu-bar');
      const cpuModel = $('jhud-cpu-model');
      if (cpuVal) cpuVal.textContent = `${snap.cpu.usagePct}%`;
      if (cpuBar) cpuBar.style.width = `${snap.cpu.usagePct}%`;
      if (cpuModel) cpuModel.textContent = `${snap.cpu.model.slice(0, 32)} (${snap.cpu.cores} cores)`;

      // GPU
      const gpuVal = $('jhud-gpu-val');
      const gpuBar = $('jhud-gpu-bar');
      const gpuMeta = $('jhud-gpu-meta');
      if (gpuVal) gpuVal.textContent = `${snap.gpu.gpuLoadPct}% (${snap.gpu.tempC}°C)`;
      if (gpuBar) gpuBar.style.width = `${snap.gpu.gpuLoadPct}%`;
      if (gpuMeta) gpuMeta.textContent = `${snap.gpu.name} • ${snap.gpu.vramUsedGB} / ${snap.gpu.vramTotalGB} GB VRAM`;

      // RAM
      const ramVal = $('jhud-ram-val');
      const ramBar = $('jhud-ram-bar');
      const ramMeta = $('jhud-ram-meta');
      if (ramVal) ramVal.textContent = `${snap.ram.usagePct}%`;
      if (ramBar) ramBar.style.width = `${snap.ram.usagePct}%`;
      if (ramMeta) ramMeta.textContent = `${snap.ram.usedGB} GB / ${snap.ram.totalGB} GB`;

      // Network
      const netPing = $('jhud-net-ping');
      if (netPing) netPing.textContent = `${snap.network.latencyMs} ms`;

      // Status text
      const statusText = $('jhud-status-text');
      if (statusText) {
        statusText.textContent = `Sir, all tactical systems are nominal. RTX 5060 GPU standing by at ${snap.gpu.tempC}°C. Zero perimeter intrusions.`;
      }
    } catch {}
  }

  function init() {
    // 1. Hotkey Ctrl+Shift+H
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (isOpen) closeHud();
        else openHud();
      } else if (e.key === 'Escape' && isOpen) {
        closeHud();
      }
    });

    // 2. Titlebar button trigger
    const triggerBtn = $('jarvis-hud-trigger-btn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => {
        if (isOpen) closeHud();
        else openHud();
      });
    }

    // 3. Close button & backdrop
    const closeBtn = $('jarvis-hud-close');
    if (closeBtn) closeBtn.addEventListener('click', closeHud);

    const backdrop = $('jarvis-hud-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeHud);

    // 4. Quick Action buttons
    const optMemBtn = $('jhud-btn-opt-mem');
    if (optMemBtn) {
      optMemBtn.addEventListener('click', async () => {
        optMemBtn.disabled = true;
        optMemBtn.textContent = 'Optimizing...';
        await api.invoke('storage:clean-cache').catch(() => {});
        optMemBtn.textContent = '✅ Memory Cleaned';
        setTimeout(() => {
          optMemBtn.disabled = false;
          optMemBtn.textContent = '⚡ Clean Memory';
        }, 2000);
      });
    }

    const diagBtn = $('jhud-btn-diag');
    if (diagBtn) {
      diagBtn.addEventListener('click', async () => {
        closeHud();
        api.invoke('task:run', 'Sir, run a full system diagnostics check on all hardware components.');
      });
    }

    const briefBtn = $('jhud-btn-brief');
    if (briefBtn) {
      briefBtn.addEventListener('click', async () => {
        closeHud();
        api.invoke('task:run', 'give me my morning briefing');
      });
    }

    // 5. Proactive intervention alerts from Butler
    api.on('jarvis:intervention', (alert) => {
      if (window.__showToast) {
        window.__showToast(`🦾 J.A.R.V.I.S.: ${alert.message}`);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__openJarvisHud = openHud;
})();
