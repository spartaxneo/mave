'use strict';
// Distributed Hands & Central Brain Architecture for Mave.
// Host PC is always the central "Brain" (running models, memory, tools, reasoning).
// Any connected device (laptop, family PC, phone, tablet, browser node) can act as the "Hands".
// When controlling another person's device:
// 1. Explicit permission must be granted by that device.
// 2. Actions (mouse, keyboard, app launch, shell) execute exclusively on THEIR device.
// 3. The Host PC's own screen, mouse, and keyboard remain completely untouched.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// Minimal valid transparent 1x1 PNG for frame fallbacks
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function fitSize(w, h, maxLongEdge = 1280) {
  const edge = Math.max(w, h) || 1;
  const s = Math.min(1, maxLongEdge / edge);
  return {
    width: Math.max(1, Math.round(w * s)),
    height: Math.max(1, Math.round(h * s)),
  };
}

class RemoteDeviceNode {
  constructor({
    id,
    name,
    type = 'pc',
    platform = 'generic',
    ip = '127.0.0.1',
    width = 1920,
    height = 1080,
    userAgent = '',
  }) {
    this.id = String(id || `hands_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    this.name = String(name || 'Remote Device').trim();
    this.type = type; // pc, laptop, mobile, tablet, browser
    this.platform = platform; // windows, macos, linux, android, ios, browser
    this.ip = ip;
    this.userAgent = userAgent;
    this.bounds = { width: Number(width) || 1920, height: Number(height) || 1080 };
    this.sent = fitSize(this.bounds.width, this.bounds.height, 1280);
    this.registeredAt = Date.now();
    this.lastSeen = Date.now();

    // Permission State
    this.permission = {
      status: 'none', // none, pending, granted, denied, revoked, expired
      scopes: [],     // screen_read, screen_control, keyboard, shell, file_sync
      grantedAt: null,
      expiresAt: null,
      grantCode: null,
      reason: null,
    };

    // Screen frame buffer & timestamps
    this.latestFrame = null;
    this.latestFrameTime = 0;

    // Outbound action queue (for pull/polling or SSE clients)
    this.actionQueue = [];
    this.actionHistory = [];
  }

  isPermissionActive(requiredScope = 'screen_control') {
    if (this.permission.status !== 'granted') return false;
    if (this.permission.expiresAt && Date.now() > this.permission.expiresAt) {
      this.permission.status = 'expired';
      return false;
    }
    if (requiredScope && !this.permission.scopes.includes(requiredScope)) {
      return false;
    }
    return true;
  }
}

/**
 * Duck-typed ScreenTarget for Mave Agent.
 * When Mave runs computer actions against this target, all screenshots, mouse clicks,
 * keystrokes, and zooms are dispatched to the remote device, leaving host PC untouched.
 */
class RemoteScreenTarget {
  constructor(device, manager) {
    this.isRemote = true;
    this.deviceId = device.id;
    this.deviceName = device.name;
    this.devicePlatform = device.platform;
    this.manager = manager;
    this.bounds = { ...device.bounds };
    this.phys = { width: this.bounds.width, height: this.bounds.height };
    this.physOrigin = { x: 0, y: 0 };
    this.display = {
      id: `remote_${device.id}`,
      bounds: { x: 0, y: 0, width: this.bounds.width, height: this.bounds.height },
      scaleFactor: 1,
    };
    this.sent = fitSize(this.phys.width, this.phys.height, 1280);
    this.decorate = null;
  }

  checkSent([x, y]) {
    if (!(Number.isFinite(x) && Number.isFinite(y))) {
      throw new Error(`Coordinate must be [x, y], got ${JSON.stringify([x, y])}`);
    }
    if (x < 0 || y < 0 || x > this.sent.width || y > this.sent.height) {
      throw new Error(`Coordinate [${x}, ${y}] is outside remote screen (${this.sent.width}x${this.sent.height})`);
    }
  }

  sentToLocalDip([x, y]) {
    this.checkSent([x, y]);
    return {
      x: (x * this.bounds.width) / this.sent.width,
      y: (y * this.bounds.height) / this.sent.height,
    };
  }

  sentToPhysical([x, y]) {
    this.checkSent([x, y]);
    return {
      x: Math.round((x * this.phys.width) / this.sent.width),
      y: Math.round((y * this.phys.height) / this.sent.height),
    };
  }

  physicalToSent(pt) {
    return {
      x: Math.round((pt.x * this.sent.width) / this.phys.width),
      y: Math.round((pt.y * this.sent.height) / this.phys.height),
    };
  }

  async capturePng(region) {
    return await this.manager.captureScreen(this.deviceId, region);
  }

  screenshot() {
    return this.capturePng(null);
  }

  async zoom([x0, y0, x1, y1]) {
    if (!(x1 > x0 && y1 > y0)) throw new Error(`Zoom region [${x0}, ${y0}, ${x1}, ${y1}] is empty`);
    return await this.capturePng({
      x0: Math.max(0, x0),
      y0: Math.max(0, y0),
      x1: Math.min(this.sent.width, x1),
      y1: Math.min(this.sent.height, y1),
    });
  }

  async executeRemoteAction(name, input, signal) {
    return await this.manager.executeActionOnDevice(this.deviceId, name, input, signal);
  }
}

class RemoteHandsManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.activeTargetDeviceId = null; // null = Host PC
    this.hostTarget = null;           // Saved host screen target
    this.controller = null;
  }

  setController(controller) {
    this.controller = controller;
  }

  /**
   * Register or update a remote device available as "Hands".
   */
  registerDevice(info = {}) {
    const id = info.id || `hands_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let dev = this.devices.get(id);
    if (!dev) {
      dev = new RemoteDeviceNode({ ...info, id });
      this.devices.set(id, dev);
    } else {
      dev.lastSeen = Date.now();
      if (info.name) dev.name = info.name;
      if (info.ip) dev.ip = info.ip;
      if (info.width && info.height) {
        dev.bounds = { width: Number(info.width), height: Number(info.height) };
        dev.sent = fitSize(dev.bounds.width, dev.bounds.height, 1280);
      }
    }
    this.emit('device_updated', dev);
    return dev;
  }

  getDevice(idOrName) {
    if (!idOrName) return null;
    const key = String(idOrName).toLowerCase().trim();
    if (this.devices.has(key)) return this.devices.get(key);
    for (const d of this.devices.values()) {
      if (d.id.toLowerCase() === key || d.name.toLowerCase() === key || d.ip === key) {
        return d;
      }
    }
    return null;
  }

  listDevices() {
    return [...this.devices.values()].map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      platform: d.platform,
      ip: d.ip,
      bounds: d.bounds,
      sent: d.sent,
      permission: {
        status: d.permission.status,
        scopes: d.permission.scopes,
        expiresAt: d.permission.expiresAt,
        hasCode: Boolean(d.permission.grantCode),
      },
      hasFrame: Boolean(d.latestFrame),
      frameAgeMs: d.latestFrameTime ? Date.now() - d.latestFrameTime : null,
      isActiveHandsTarget: this.activeTargetDeviceId === d.id,
      lastSeen: d.lastSeen,
    }));
  }

  removeDevice(id) {
    const dev = this.devices.get(id);
    if (dev) {
      if (this.activeTargetDeviceId === id) {
        this.resetToHostTarget();
      }
      this.devices.delete(id);
      this.emit('device_removed', id);
      return true;
    }
    return false;
  }

  /**
   * Request permission from remote device owner.
   */
  requestPermission(deviceId, {
    scopes = ['screen_read', 'screen_control', 'keyboard', 'shell', 'apps'],
    durationMinutes = 60,
    reason = 'Mave AI Brain task execution',
  } = {}) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Device "${deviceId}" not found.`);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    dev.permission.status = 'pending';
    dev.permission.scopes = scopes;
    dev.permission.grantCode = code;
    dev.permission.reason = reason;
    dev.permission.requestedAt = Date.now();
    dev.permission.expiresAt = Date.now() + durationMinutes * 60 * 1000;

    this.emit('permission_requested', { device: dev, code, reason });
    return {
      ok: true,
      deviceId: dev.id,
      deviceName: dev.name,
      status: 'pending',
      grantCode: code,
      message: `Permission requested from ${dev.name}. Device user can authorize with code ${code} or click 'Grant' on their device.`,
    };
  }

  /**
   * Grant permission by remote device user.
   */
  grantPermission(deviceId, {
    scopes = ['screen_read', 'screen_control', 'keyboard', 'shell', 'apps'],
    durationMinutes = 60,
    code = null,
  } = {}) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Device "${deviceId}" not found.`);

    if (code && dev.permission.grantCode && String(code).trim() !== dev.permission.grantCode) {
      throw new Error('Invalid permission code.');
    }

    dev.permission.status = 'granted';
    dev.permission.scopes = Array.isArray(scopes) ? scopes : ['screen_read', 'screen_control', 'keyboard'];
    dev.permission.grantedAt = Date.now();
    dev.permission.expiresAt = durationMinutes ? Date.now() + durationMinutes * 60 * 1000 : null;
    dev.permission.grantCode = null;

    this.emit('permission_granted', { device: dev });
    return {
      ok: true,
      deviceId: dev.id,
      deviceName: dev.name,
      status: 'granted',
      scopes: dev.permission.scopes,
      expiresAt: dev.permission.expiresAt,
    };
  }

  /**
   * Immediately revoke permission from remote device.
   */
  revokePermission(deviceId) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Device "${deviceId}" not found.`);

    dev.permission.status = 'revoked';
    dev.permission.scopes = [];
    dev.permission.expiresAt = Date.now();

    if (this.activeTargetDeviceId === dev.id) {
      this.resetToHostTarget();
    }

    this.emit('permission_revoked', { device: dev });
    return {
      ok: true,
      deviceId: dev.id,
      deviceName: dev.name,
      status: 'revoked',
    };
  }

  isPermissionGranted(deviceId, requiredScope = 'screen_control') {
    const dev = this.getDevice(deviceId);
    if (!dev) return false;
    return dev.isPermissionActive(requiredScope);
  }

  /**
   * Push an updated screen frame from the remote device.
   */
  pushScreenFrame(deviceId, bufferOrBase64, dimensions = {}) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Device "${deviceId}" not found.`);

    let buf;
    if (Buffer.isBuffer(bufferOrBase64)) {
      buf = bufferOrBase64;
    } else {
      const clean = String(bufferOrBase64).replace(/^data:image\/[a-z]+;base64,/, '');
      buf = Buffer.from(clean, 'base64');
    }

    dev.latestFrame = buf;
    dev.latestFrameTime = Date.now();
    dev.lastSeen = Date.now();

    if (dimensions.width && dimensions.height) {
      dev.bounds = { width: Number(dimensions.width), height: Number(dimensions.height) };
      dev.sent = fitSize(dev.bounds.width, dev.bounds.height, 1280);
    }

    this.emit('frame_received', { deviceId: dev.id, size: buf.length });
    return { ok: true, frameSize: buf.length };
  }

  /**
   * Capture remote screen. Must have 'screen_read' permission.
   */
  async captureScreen(deviceId, _region = null) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Remote device "${deviceId}" not found.`);

    if (!dev.isPermissionActive('screen_read')) {
      throw new Error(`Permission denied: Remote device "${dev.name}" has not granted screen viewing permission.`);
    }

    if (dev.latestFrame && dev.latestFrame.length) {
      return dev.latestFrame;
    }

    // Return valid fallback PNG if no frame has arrived yet
    return FALLBACK_PNG;
  }

  /**
   * Dispatch an action to be executed exclusively on the remote device.
   * Host PC's own screen and keyboard remain untouched!
   */
  async executeActionOnDevice(deviceId, name, input, signal) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Remote device "${deviceId}" not found.`);

    if (signal && signal.aborted) throw new Error('Stopped');

    const requiredScope = (name === 'type' || name === 'key' || name === 'hold_key') ? 'keyboard' : 'screen_control';
    if (!dev.isPermissionActive(requiredScope)) {
      throw new Error(
        `Permission denied: Remote device "${dev.name}" has not granted permission for "${name}" (Scope: ${requiredScope}). Request permission from the device owner first.`
      );
    }

    // 1. Android Native Execution via Google Artemis
    if (dev.platform === 'android' && dev.ip) {
      try {
        const mobilePlugin = require('../plugins/builtin/mobile_devices');
        const artemis = mobilePlugin.find((p) => p.name === 'artemis_control_android');
        if (artemis) {
          let artemisAction = 'tap';
          const params = {};
          if (name === 'click_element' || name === 'left_click' || name === 'click') {
            artemisAction = 'tap';
            params.x = input.coordinate ? dev.sentToPhysical(input.coordinate).x : 500;
            params.y = input.coordinate ? dev.sentToPhysical(input.coordinate).y : 500;
          } else if (name === 'type' || name === 'type_into') {
            artemisAction = 'type_text';
            params.text = input.text || '';
          } else if (name === 'key') {
            artemisAction = 'press_key';
            params.key = input.text || 'ENTER';
          }
          await artemis.run(
            { device_ip_or_serial: dev.ip, action: artemisAction, permission_granted: true, parameters: params },
            { log: () => {} }
          );
          return 'OK';
        }
      } catch (err) {
        // Fallback to queue dispatch if adb fails
      }
    }

    // 2. Queue action for Remote Client Worker (Web / Browser / Native Client Node)
    const actionRecord = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      input,
      timestamp: Date.now(),
      status: 'pending',
    };

    dev.actionQueue.push(actionRecord);
    if (dev.actionQueue.length > 50) dev.actionQueue = dev.actionQueue.slice(-50);

    dev.actionHistory.push({ ...actionRecord });
    if (dev.actionHistory.length > 100) dev.actionHistory = dev.actionHistory.slice(-100);

    this.emit('action_dispatched', { deviceId: dev.id, action: actionRecord });
    return 'OK';
  }

  /**
   * Poll pending actions for a remote device client.
   */
  pollActions(deviceId) {
    const dev = this.getDevice(deviceId);
    if (!dev) return [];
    dev.lastSeen = Date.now();
    const actions = [...dev.actionQueue];
    dev.actionQueue = [];
    return actions;
  }

  /**
   * Switch Mave's active computer target to a remote device ("Hands").
   * All subsequent agent computer actions will target that device.
   */
  switchToRemoteTarget(deviceId, agent) {
    const dev = this.getDevice(deviceId);
    if (!dev) throw new Error(`Remote device "${deviceId}" not found.`);

    if (!dev.isPermissionActive('screen_control')) {
      throw new Error(`Permission denied: Device "${dev.name}" has not granted remote control permission.`);
    }

    // Save host target on first switch
    if (!this.hostTarget && agent && agent.target && !agent.target.isRemote) {
      this.hostTarget = agent.target;
    }

    const remoteTarget = new RemoteScreenTarget(dev, this);
    if (agent && typeof agent.setTarget === 'function') {
      agent.setTarget(remoteTarget);
    }
    this.activeTargetDeviceId = dev.id;
    this.emit('target_switched', { target: 'remote', device: dev });
    return remoteTarget;
  }

  /**
   * Switch Mave's active target back to this Host PC.
   */
  resetToHostTarget(agent) {
    if (this.hostTarget && agent && typeof agent.setTarget === 'function') {
      agent.setTarget(this.hostTarget);
    }
    this.activeTargetDeviceId = null;
    this.emit('target_switched', { target: 'host' });
    return this.hostTarget;
  }
}

let handsManagerInstance = null;
function getRemoteHandsManager() {
  if (!handsManagerInstance) handsManagerInstance = new RemoteHandsManager();
  return handsManagerInstance;
}

module.exports = {
  RemoteHandsManager,
  RemoteDeviceNode,
  RemoteScreenTarget,
  getRemoteHandsManager,
  fitSize,
  FALLBACK_PNG,
};
