'use strict';
// Wireless Mesh Auto-Discovery & Zero-Touch Connect Engine for Mave.
// Broadcasts host beacon over local Wi-Fi / LAN via UDP (port 4045) and handles
// instant zero-touch pairing as soon as an iPhone, Android, or secondary PC
// connects to the local home network.

const dgram = require('dgram');
const os = require('os');
const { EventEmitter } = require('events');
const { backburnerMeshEngine } = require('../local/backburner_mesh');

const DEFAULT_DISCOVERY_PORT = 4045;
const BEACON_INTERVAL_MS = 3000;
const MAGIC_BEACON = 'MAVE_MESH_BEACON';
const MAGIC_HELLO = 'MAVE_SATELLITE_HELLO';
const MAGIC_WELCOME = 'MAVE_MESH_WELCOME';

function getLocalBroadcastIps() {
  const broadcasts = ['255.255.255.255'];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          // Simple broadcast estimate: change last octet to 255
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            parts[3] = '255';
            broadcasts.push(parts.join('.'));
          }
        }
      }
    }
  } catch {}
  return Array.from(new Set(broadcasts));
}

class MeshDiscoveryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || DEFAULT_DISCOVERY_PORT;
    this.logger = options.logger || console;
    this.hostInfo = options.hostInfo || {};
    this.beaconTimer = null;
    this.socket = null;
    this.running = false;
  }

  /**
   * Start listening and broadcasting on the local Wi-Fi network.
   */
  start(hostInfo = {}) {
    if (this.running) return Promise.resolve(true);
    this.hostInfo = { ...this.hostInfo, ...hostInfo };

    return new Promise((resolve) => {
      try {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('error', (err) => {
          this.logger.warn?.('Mesh discovery UDP socket warning:', err.message);
        });

        this.socket.on('message', (msg, rinfo) => {
          this._handleIncomingPacket(msg, rinfo);
        });

        this.socket.bind(this.port, () => {
          try {
            this.socket.setBroadcast(true);
          } catch {}

          this.running = true;
          this._startBeacon();
          this.logger.info?.(`Mave Wireless Mesh Discovery active on UDP port ${this.port}`);
          resolve(true);
        });
      } catch (err) {
        this.logger.warn?.('Could not start UDP discovery socket:', err.message);
        this.running = false;
        resolve(false);
      }
    });
  }

  _startBeacon() {
    this._broadcastBeacon();
    this.beaconTimer = setInterval(() => {
      this._broadcastBeacon();
    }, BEACON_INTERVAL_MS);
  }

  _broadcastBeacon() {
    if (!this.socket || !this.running) return;

    const payload = JSON.stringify({
      magic: MAGIC_BEACON,
      version: 1,
      hostId: this.hostInfo.hostId || 'mave-host',
      hostname: this.hostInfo.hostname || os.hostname(),
      port: this.hostInfo.port || 4040,
      httpsPort: this.hostInfo.httpsPort || 4043,
      coprocessorPort: 50062,
      capabilities: ['kv_offload', 'split_prefill', 'prompt_cache', 'noise_nnpsk0'],
      timestamp: Date.now(),
    });

    const buffer = Buffer.from(payload);
    const targets = getLocalBroadcastIps();

    for (const ip of targets) {
      try {
        this.socket.send(buffer, 0, buffer.length, this.port, ip);
      } catch {}
    }
  }

  _handleIncomingPacket(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString('utf8'));

      // If a satellite device just joined the local Wi-Fi and greeted the host:
      if (data.magic === MAGIC_HELLO && data.deviceId) {
        const senderIp = rinfo.address;
        const deviceRecord = backburnerMeshEngine.registerCoProcessor({
          deviceId: data.deviceId,
          name: data.name || 'Wireless Co-Processor',
          os: data.os || 'mobile',
          ip: senderIp,
          port: data.port || 50062,
          ramBytes: data.ramBytes || 8 * 1024 * 1024 * 1024,
          freeMemoryBytes: data.freeMemoryBytes || 4 * 1024 * 1024 * 1024,
          connectionType: 'wireless',
          computeTier: data.computeTier || 'gpu_npu',
        });

        // Reply with Welcome packet
        const welcome = JSON.stringify({
          magic: MAGIC_WELCOME,
          hostId: this.hostInfo.hostId || 'mave-host',
          hostname: this.hostInfo.hostname || os.hostname(),
          accepted: true,
          pairedAt: new Date().toISOString(),
          contextWindow: backburnerMeshEngine.getEffectiveContextWindow(),
        });
        const welcomeBuf = Buffer.from(welcome);
        this.socket.send(welcomeBuf, 0, welcomeBuf.length, rinfo.port, rinfo.address);

        this.emit('device-auto-joined', {
          device: deviceRecord,
          ip: senderIp,
        });
      }
    } catch {}
  }

  /**
   * HTTP Fallback for immediate zero-touch registration.
   */
  handleHttpAutoJoin(deviceData = {}, remoteIp = '127.0.0.1') {
    const deviceId = deviceData.deviceId || `dev-wifi-${crypto.randomBytes(4).toString('hex')}`;
    const record = backburnerMeshEngine.registerCoProcessor({
      deviceId,
      name: deviceData.name || 'Wireless Companion Node',
      os: deviceData.os || 'mobile',
      ip: remoteIp,
      port: deviceData.port || 50062,
      ramBytes: deviceData.ramBytes || 8 * 1024 * 1024 * 1024,
      freeMemoryBytes: deviceData.freeMemoryBytes || 4 * 1024 * 1024 * 1024,
      connectionType: deviceData.connectionType || 'wireless',
      computeTier: deviceData.computeTier || 'gpu_npu',
    });

    this.emit('device-auto-joined', { device: record, ip: remoteIp });

    return {
      ok: true,
      device: record,
      meshStatus: backburnerMeshEngine.getMeshStatus(),
      welcomeMessage: `Connected to Mave AI Host Server at ${this.hostInfo.hostname || 'Host PC'}. Co-processor mesh is active.`,
    };
  }

  stop() {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
    this.running = false;
    return Promise.resolve(true);
  }

  getStatus() {
    return {
      running: this.running,
      port: this.port,
      beaconIntervalMs: BEACON_INTERVAL_MS,
      hostname: this.hostInfo.hostname || os.hostname(),
      activeCoProcessors: backburnerMeshEngine.getEffectiveContextWindow().activeCoProcessors,
    };
  }
}

const meshDiscoveryManager = new MeshDiscoveryManager();

module.exports = {
  MeshDiscoveryManager,
  meshDiscoveryManager,
  DEFAULT_DISCOVERY_PORT,
};
