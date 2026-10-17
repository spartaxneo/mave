'use strict';
// MaveDrop: Local P2P Wireless File Sharing & LAN Sync Engine.
// Provides zero-cloud, encrypted local Wi-Fi file transfer between Windows PC,
// Android (Google Artemis), and iPhone (iPhone-Use), operating like Apple AirDrop / LocalSend.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

class MaveDropEngine extends EventEmitter {
  constructor(dropDir = null) {
    super();
    this.dropDir = dropDir || path.join(os.homedir(), 'Downloads', 'MaveDrop');
    this.clipboardContent = '';
    this.knownDevices = new Map();
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.dropDir)) {
        fs.mkdirSync(this.dropDir, { recursive: true });
      }
    } catch {}
  }

  getDropDir() {
    this._ensureDir();
    return this.dropDir;
  }

  /**
   * List files currently held in MaveDrop storage.
   */
  listFiles() {
    this._ensureDir();
    try {
      const items = fs.readdirSync(this.dropDir);
      return items.map((name) => {
        const fullPath = path.join(this.dropDir, name);
        const stat = fs.statSync(fullPath);
        return {
          name,
          path: fullPath,
          sizeBytes: stat.size,
          sizeHuman: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
          modifiedAt: stat.mtime.toISOString(),
          isDirectory: stat.isDirectory(),
        };
      }).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    } catch {
      return [];
    }
  }

  /**
   * Save a received file buffer from a phone or peer device.
   */
  saveReceivedFile(filename, buffer, senderDevice = 'Unknown Device') {
    this._ensureDir();
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || `drop_${Date.now()}.bin`;
    const targetPath = path.join(this.dropDir, safeName);
    fs.writeFileSync(targetPath, buffer);

    const record = {
      name: safeName,
      path: targetPath,
      sizeBytes: buffer.length,
      sizeHuman: (buffer.length / (1024 * 1024)).toFixed(2) + ' MB',
      sender: senderDevice,
      receivedAt: new Date().toISOString(),
    };

    this.emit('file-received', record);
    return record;
  }

  /**
   * Register or ping a known peer device on the local network.
   */
  registerDevice(deviceInfo) {
    if (!deviceInfo || !deviceInfo.id) return;
    const entry = {
      id: deviceInfo.id,
      name: deviceInfo.name || 'Mobile Device',
      os: deviceInfo.os || 'Android/iOS',
      ip: deviceInfo.ip || 'LAN',
      type: deviceInfo.type || 'phone',
      lastSeen: new Date().toISOString(),
    };
    this.knownDevices.set(deviceInfo.id, entry);
    this.emit('device-discovered', entry);
    return entry;
  }

  getKnownDevices() {
    return Array.from(this.knownDevices.values());
  }

  /**
   * Set and sync clipboard content across LAN devices.
   */
  setClipboard(text, sourceDevice = 'Local PC') {
    this.clipboardContent = String(text || '');
    this.emit('clipboard-sync', { text: this.clipboardContent, source: sourceDevice, ts: Date.now() });
    return { ok: true, length: this.clipboardContent.length };
  }

  getClipboard() {
    return this.clipboardContent;
  }
}

let _dropInstance = null;
function getMaveDropEngine(dir = null) {
  if (!_dropInstance) _dropInstance = new MaveDropEngine(dir);
  return _dropInstance;
}

module.exports = {
  MaveDropEngine,
  getMaveDropEngine,
};
