'use strict';

const EventEmitter = require('events');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { RealVMDriver } = require('./real_vm_driver');

/**
 * Supported Virtualization Backends:
 * - 'hyperv': Windows Hyper-V / Host Compute Service (HCS)
 * - 'sandbox': Windows Sandbox (WDAG / Ephemeral Isolated Space)
 * - 'wsl2': Windows Subsystem for Linux 2 Isolated VM
 * - 'native_isolated': Dedicated Offscreen Isolated Workspace Engine (Zero Host Interference)
 */
class VirtualMachineManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userDataPath = options.userDataPath || (process.env.APPDATA ? path.join(process.env.APPDATA, 'mave') : path.join(os.homedir(), '.mave'));
    this.guestRoot = options.guestRoot || path.join(this.userDataPath, 'guest_fs');
    this.snapshotsDir = path.join(this.userDataPath, 'guest_snapshots');
    this.logger = options.logger || console;

    this.driver = new RealVMDriver({ userDataPath: this.userDataPath, guestRoot: this.guestRoot, logger: this.logger });
    this.backend = 'native_isolated';
    this.state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'paused' | 'destroyed'
    this.activeGuestId = null;
    this.quotas = {
      cpuCores: options.cpuCores || Math.max(1, Math.floor(os.cpus().length / 2)),
      maxMemoryMB: options.maxMemoryMB || 4096,
      diskQuotaMB: options.diskQuotaMB || 10240,
    };

    this.resources = {
      cpuPercent: 0,
      memoryUsedMB: 0,
      uptimeSeconds: 0,
    };

    this.uptimeInterval = null;
    this._ensureDirectories();
  }

  _ensureDirectories() {
    try {
      if (!fs.existsSync(this.guestRoot)) fs.mkdirSync(this.guestRoot, { recursive: true });
      if (!fs.existsSync(this.snapshotsDir)) fs.mkdirSync(this.snapshotsDir, { recursive: true });
    } catch (err) {
      this.logger.warn?.('VirtualMachineManager: could not create guest directories:', err.message);
    }
  }

  /**
   * Detect available host virtualization capabilities.
   */
  async detectHostCapabilities() {
    const probe = await this.driver.probeHypervisor();
    const caps = {
      hypervAvailable: probe.backendType === 'hyperv',
      wsl2Available: probe.wslVersion === 2,
      sandboxAvailable: false,
      nativeIsolatedAvailable: true,
      preferredBackend: probe.backendType || 'native_isolated',
      totalHostRamGB: Math.round(os.totalmem() / (1024 ** 3)),
      hostCpuCores: os.cpus().length,
      hypervisorDetails: probe,
    };

    this.backend = caps.preferredBackend;
    return caps;
  }

  /**
   * Provision or start the guest virtual environment.
   */
  async start(guestId = 'mave-guest-primary') {
    if (this.state === 'running') return { ok: true, state: this.state, guestId: this.activeGuestId };
    this.state = 'starting';
    this.activeGuestId = String(guestId);
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });

    this._ensureDirectories();
    await this.driver.bootGuest(this.activeGuestId, { quotas: this.quotas });

    // Initialize resource metrics tracker
    this.resources.memoryUsedMB = 350;
    this.resources.uptimeSeconds = 0;
    if (this.uptimeInterval) clearInterval(this.uptimeInterval);
    this.uptimeInterval = setInterval(() => {
      if (this.state === 'running') {
        this.resources.uptimeSeconds += 1;
        this.emit('resource-update', { ...this.resources, quotas: this.quotas });
      }
    }, 1000);

    this.state = 'running';
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });
    return { ok: true, state: this.state, guestId: this.activeGuestId, backend: this.backend };
  }

  async pause() {
    if (this.state !== 'running') return { ok: false, error: 'Cannot pause when not running' };
    this.state = 'paused';
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });
    return { ok: true, state: this.state };
  }

  async resume() {
    if (this.state !== 'paused') return { ok: false, error: 'Cannot resume when not paused' };
    this.state = 'running';
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });
    return { ok: true, state: this.state };
  }

  async stop() {
    if (this.uptimeInterval) clearInterval(this.uptimeInterval);
    this.uptimeInterval = null;
    await this.driver.shutdownGuest();
    this.state = 'stopped';
    this.resources.cpuPercent = 0;
    this.resources.uptimeSeconds = 0;
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });
    return { ok: true, state: this.state };
  }

  async verifyGuestIsolation() {
    return await this.driver.verifyGuestIsolation();
  }

  async snapshot(label = 'snapshot_default') {
    const snapId = `snap_${Date.now()}_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const snapPath = path.join(this.snapshotsDir, snapId);
    fs.mkdirSync(snapPath, { recursive: true });

    const metadata = {
      snapId,
      label,
      createdAt: new Date().toISOString(),
      backend: this.backend,
      guestId: this.activeGuestId,
      quotas: this.quotas,
    };
    fs.writeFileSync(path.join(snapPath, 'snapshot_meta.json'), JSON.stringify(metadata, null, 2), 'utf8');

    return { ok: true, snapId, path: snapPath, metadata };
  }

  async restore(snapId) {
    const snapPath = path.join(this.snapshotsDir, snapId);
    const metaFile = path.join(snapPath, 'snapshot_meta.json');
    if (!fs.existsSync(metaFile)) {
      throw new Error(`Snapshot not found: ${snapId}`);
    }
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    this.backend = meta.backend || this.backend;
    return { ok: true, restoredSnapId: snapId, meta };
  }

  async destroy() {
    await this.stop();
    this.state = 'destroyed';
    this.emit('state-change', { state: this.state, guestId: this.activeGuestId });
    return { ok: true, state: this.state };
  }

  getStatus() {
    return {
      state: this.state,
      guestId: this.activeGuestId,
      backend: this.backend,
      quotas: this.quotas,
      resources: this.resources,
      guestRoot: this.guestRoot,
      hypervisorStatus: this.driver.hypervisorStatus,
      guestState: this.driver.guestState,
    };
  }
}

module.exports = { VirtualMachineManager };
