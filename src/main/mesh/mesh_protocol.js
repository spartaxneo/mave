'use strict';

/**
 * MAVE Brain Mesh: Secure Protocol & Message Framing Specification
 * Implements cryptographic device identity, challenge-response authenticated handshake,
 * message schemas, length-prefixed binary framing, and streaming stream decoders.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { Transform } = require('stream');

/**
 * Canonical protocol message types
 */
const MESSAGE_TYPES = Object.freeze({
  HELLO: 'HELLO',
  CHALLENGE: 'CHALLENGE',
  AUTH: 'AUTH',
  AUTH_OK: 'AUTH_OK',
  AUTH_FAIL: 'AUTH_FAIL',
  HEARTBEAT: 'HEARTBEAT',
  TELEMETRY: 'TELEMETRY',
  JOB_SUBMIT: 'JOB_SUBMIT',
  JOB_PROGRESS: 'JOB_PROGRESS',
  JOB_COMPLETE: 'JOB_COMPLETE',
  JOB_FAILED: 'JOB_FAILED',
  JOB_CANCEL: 'JOB_CANCEL',
  ARTIFACT_UPLOAD: 'ARTIFACT_UPLOAD'
});

const PROTOCOL_VERSION = '1.0';
const MAX_FRAME_SIZE_BYTES = 64 * 1024 * 1024; // 64 MB frame ceiling for safety

/**
 * Computes a SHA-256 fingerprint for a key or string
 * @param {string|Buffer} data
 * @returns {string} Hex encoded fingerprint
 */
function computeDeviceFingerprint(data) {
  if (!data) return '';
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generates a new cryptographic device identity with an Ed25519 keypair and persistent token
 * @param {Object} [options]
 * @returns {Object} Device identity record
 */
function generateDeviceIdentity(options = {}) {
  const deviceId = options.deviceId || `mave-worker-${crypto.randomBytes(6).toString('hex')}`;
  const name = options.name || os.hostname() || 'Worker Node';
  const role = options.role || 'worker';
  const token = options.token || crypto.randomBytes(32).toString('hex');

  // Generate Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const fingerprint = computeDeviceFingerprint(publicKey);

  return {
    deviceId,
    name,
    role,
    token,
    publicKey,
    privateKey,
    fingerprint,
    createdAt: new Date().toISOString()
  };
}

/**
 * Loads a device identity from a JSON file on disk
 * @param {string} filePath
 * @returns {Object|null}
 */
function loadDeviceIdentity(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.deviceId || !parsed.publicKey || !parsed.privateKey) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Saves a device identity to a JSON file on disk atomically
 * @param {string} filePath
 * @param {Object} identity
 */
function saveDeviceIdentity(filePath, identity) {
  if (!filePath || !identity) {
    throw new Error('saveDeviceIdentity requires filePath and identity');
  }
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });

  const jsonString = JSON.stringify(identity, null, 2);
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, jsonString, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Loads an existing device identity from file, or generates a new one and persists it
 * @param {string} filePath
 * @param {Object} [options]
 * @returns {Object}
 */
function loadOrGenerateDeviceIdentity(filePath, options = {}) {
  if (filePath) {
    const existing = loadDeviceIdentity(filePath);
    if (existing) {
      return existing;
    }
  }

  const generated = generateDeviceIdentity(options);
  if (filePath) {
    saveDeviceIdentity(filePath, generated);
  }
  return generated;
}

/**
 * Generates a cryptographically random challenge nonce
 * @param {number} [bytes=32]
 * @returns {string} Hex encoded nonce
 */
function createChallenge(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes an HMAC-SHA256 signature for a challenge using a shared secret or PIN
 * @param {string} challenge
 * @param {string} secretOrPin
 * @returns {string} Hex encoded HMAC
 */
function computeHmacResponse(challenge, secretOrPin) {
  if (!challenge || secretOrPin === undefined || secretOrPin === null) {
    throw new Error('computeHmacResponse requires challenge and secretOrPin');
  }
  return crypto
    .createHmac('sha256', String(secretOrPin))
    .update(String(challenge), 'utf8')
    .digest('hex');
}

/**
 * Verifies an HMAC-SHA256 challenge response using timing-safe comparison
 * @param {string} challenge
 * @param {string} responseHex
 * @param {string} secretOrPin
 * @returns {boolean}
 */
function verifyHmacResponse(challenge, responseHex, secretOrPin) {
  if (!challenge || !responseHex || secretOrPin === undefined || secretOrPin === null) {
    return false;
  }
  try {
    const expected = computeHmacResponse(challenge, secretOrPin);
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(responseHex, 'hex');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Signs a challenge string using an Ed25519 private key
 * @param {string} challenge
 * @param {string|KeyObject} privateKeyPem
 * @returns {string} Hex encoded signature
 */
function signChallengeWithKey(challenge, privateKeyPem) {
  if (!challenge || !privateKeyPem) {
    throw new Error('signChallengeWithKey requires challenge and privateKeyPem');
  }
  const signature = crypto.sign(null, Buffer.from(String(challenge), 'utf8'), privateKeyPem);
  return signature.toString('hex');
}

/**
 * Verifies an Ed25519 signature of a challenge
 * @param {string} challenge
 * @param {string} signatureHex
 * @param {string|KeyObject} publicKeyPem
 * @returns {boolean}
 */
function verifySignatureResponse(challenge, signatureHex, publicKeyPem) {
  if (!challenge || !signatureHex || !publicKeyPem) {
    return false;
  }
  try {
    const sigBuf = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(String(challenge), 'utf8'), publicKeyPem, sigBuf);
  } catch {
    return false;
  }
}

/**
 * Creates an authentication response supporting either PIN/secret or crypto signature
 * @param {string} challenge
 * @param {Object} credentials - { pin, secret, token, privateKey, deviceId }
 * @returns {{ deviceId: string, response: string, method: 'hmac'|'signature' }}
 */
function createAuthResponse(challenge, credentials = {}) {
  const deviceId = credentials.deviceId || 'unknown';
  if (credentials.privateKey) {
    const signature = signChallengeWithKey(challenge, credentials.privateKey);
    return {
      deviceId,
      response: signature,
      method: 'signature'
    };
  }
  const secret = credentials.pin ?? credentials.token ?? credentials.secret;
  if (secret !== undefined && secret !== null) {
    const hmac = computeHmacResponse(challenge, secret);
    return {
      deviceId,
      response: hmac,
      method: 'hmac'
    };
  }
  throw new Error('createAuthResponse requires either privateKey or secret/pin/token in credentials');
}

/**
 * Verifies an authentication response against provided credentials / public key
 * @param {string} challenge
 * @param {Object} authPayload - { deviceId, response, method }
 * @param {Object} verifier - { pin, secret, token, publicKey }
 * @returns {boolean}
 */
function verifyAuthResponse(challenge, authPayload = {}, verifier = {}) {
  if (!challenge || !authPayload || !authPayload.response) {
    return false;
  }

  // If signature method or public key is given
  if (authPayload.method === 'signature' || verifier.publicKey) {
    if (!verifier.publicKey) return false;
    return verifySignatureResponse(challenge, authPayload.response, verifier.publicKey);
  }

  // Default to HMAC
  const secret = verifier.pin ?? verifier.token ?? verifier.secret;
  if (secret !== undefined && secret !== null) {
    return verifyHmacResponse(challenge, authPayload.response, secret);
  }

  return false;
}

/**
 * Constructs a structured protocol message envelope
 * @param {string} type - one of MESSAGE_TYPES
 * @param {Object} [payload] - message-specific content
 * @param {Object} [options]
 * @returns {Object} Structured protocol message
 */
function createMessage(type, payload = {}, options = {}) {
  if (!MESSAGE_TYPES[type]) {
    throw new Error(`Unknown message type: ${type}`);
  }

  return {
    version: PROTOCOL_VERSION,
    id: options.id || `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    type,
    timestamp: options.timestamp || Date.now(),
    source: options.source || null,
    target: options.target || null,
    payload: payload && typeof payload === 'object' ? payload : {}
  };
}

/**
 * Validates message envelope and payload schema
 * @param {Object} msg
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Message must be a non-null object' };
  }

  if (typeof msg.type !== 'string' || !MESSAGE_TYPES[msg.type]) {
    return { valid: false, error: `Invalid or missing message type: ${msg.type}` };
  }

  if (msg.version !== undefined && typeof msg.version !== 'string' && typeof msg.version !== 'number') {
    return { valid: false, error: 'Message version must be a string or number' };
  }

  const payload = msg.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Message payload must be an object' };
  }

  // Schema checks per message type
  switch (msg.type) {
    case MESSAGE_TYPES.HELLO:
      if (!payload.deviceId) {
        return { valid: false, error: 'HELLO message requires payload.deviceId' };
      }
      break;

    case MESSAGE_TYPES.CHALLENGE:
      if (!payload.challenge || typeof payload.challenge !== 'string') {
        return { valid: false, error: 'CHALLENGE message requires payload.challenge string' };
      }
      break;

    case MESSAGE_TYPES.AUTH:
      if (!payload.deviceId) {
        return { valid: false, error: 'AUTH message requires payload.deviceId' };
      }
      if (!payload.response && !payload.token && !payload.pin) {
        return { valid: false, error: 'AUTH message requires payload.response, token, or pin' };
      }
      break;

    case MESSAGE_TYPES.AUTH_OK:
      if (!payload.deviceId) {
        return { valid: false, error: 'AUTH_OK message requires payload.deviceId' };
      }
      break;

    case MESSAGE_TYPES.AUTH_FAIL:
      if (!payload.reason) {
        return { valid: false, error: 'AUTH_FAIL message requires payload.reason' };
      }
      break;

    case MESSAGE_TYPES.HEARTBEAT:
      if (!payload.deviceId) {
        return { valid: false, error: 'HEARTBEAT message requires payload.deviceId' };
      }
      break;

    case MESSAGE_TYPES.TELEMETRY:
      if (!payload.deviceId) {
        return { valid: false, error: 'TELEMETRY message requires payload.deviceId' };
      }
      break;

    case MESSAGE_TYPES.JOB_SUBMIT:
      if (!payload.jobId) {
        return { valid: false, error: 'JOB_SUBMIT message requires payload.jobId' };
      }
      if (!payload.command && !payload.script) {
        return { valid: false, error: 'JOB_SUBMIT message requires payload.command or payload.script' };
      }
      break;

    case MESSAGE_TYPES.JOB_PROGRESS:
      if (!payload.jobId) {
        return { valid: false, error: 'JOB_PROGRESS message requires payload.jobId' };
      }
      break;

    case MESSAGE_TYPES.JOB_COMPLETE:
      if (!payload.jobId) {
        return { valid: false, error: 'JOB_COMPLETE message requires payload.jobId' };
      }
      break;

    case MESSAGE_TYPES.JOB_FAILED:
      if (!payload.jobId) {
        return { valid: false, error: 'JOB_FAILED message requires payload.jobId' };
      }
      break;

    case MESSAGE_TYPES.JOB_CANCEL:
      if (!payload.jobId) {
        return { valid: false, error: 'JOB_CANCEL message requires payload.jobId' };
      }
      break;

    case MESSAGE_TYPES.ARTIFACT_UPLOAD:
      if (!payload.jobId) {
        return { valid: false, error: 'ARTIFACT_UPLOAD message requires payload.jobId' };
      }
      if (!payload.filename) {
        return { valid: false, error: 'ARTIFACT_UPLOAD message requires payload.filename' };
      }
      break;

    default:
      break;
  }

  return { valid: true, error: null };
}

/**
 * Asserts that a message is valid, throwing an Error if validation fails
 * @param {Object} msg
 */
function assertValidMessage(msg) {
  const result = validateMessage(msg);
  if (!result.valid) {
    throw new Error(`Protocol message validation failed: ${result.error}`);
  }
}

/**
 * Encodes a protocol message into a length-prefixed binary frame (4-byte big endian length prefix)
 * @param {Object} message
 * @returns {Buffer}
 */
function encodeFrame(message) {
  assertValidMessage(message);
  const jsonStr = JSON.stringify(message);
  const payloadBuf = Buffer.from(jsonStr, 'utf8');

  if (payloadBuf.length > MAX_FRAME_SIZE_BYTES) {
    throw new Error(`Frame payload size (${payloadBuf.length}) exceeds maximum limit (${MAX_FRAME_SIZE_BYTES})`);
  }

  const frameBuf = Buffer.allocUnsafe(4 + payloadBuf.length);
  frameBuf.writeUInt32BE(payloadBuf.length, 0);
  payloadBuf.copy(frameBuf, 4);
  return frameBuf;
}

/**
 * Stateful binary frame decoder for streams and fragmented TCP sockets
 */
class FrameDecoder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxFrameSize = options.maxFrameSize || MAX_FRAME_SIZE_BYTES;
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Pushes incoming raw chunk and decodes any complete frames
   * @param {Buffer} chunk
   * @returns {Array<Object>} List of newly decoded message objects
   */
  push(chunk) {
    if (!chunk || !chunk.length) return [];
    this.buffer = Buffer.concat([this.buffer, chunk]);

    const messages = [];

    while (this.buffer.length >= 4) {
      const payloadLength = this.buffer.readUInt32BE(0);

      if (payloadLength > this.maxFrameSize) {
        const err = new Error(`Frame payload length (${payloadLength}) exceeds maxFrameSize (${this.maxFrameSize})`);
        this.emit('error', err);
        // Clear corrupt buffer
        this.buffer = Buffer.alloc(0);
        break;
      }

      if (this.buffer.length < 4 + payloadLength) {
        // Need more data
        break;
      }

      const framePayload = this.buffer.slice(4, 4 + payloadLength);
      this.buffer = this.buffer.slice(4 + payloadLength);

      try {
        const jsonStr = framePayload.toString('utf8');
        const parsed = JSON.parse(jsonStr);
        assertValidMessage(parsed);
        messages.push(parsed);
        this.emit('message', parsed);
        this.emit('frame', parsed);
      } catch (parseErr) {
        this.emit('error', parseErr);
      }
    }

    return messages;
  }

  /**
   * Static helper to decode frames from a static buffer without a class instance
   * @param {Buffer} buffer
   * @returns {{ messages: Array<Object>, remainder: Buffer }}
   */
  static decodeFrames(buffer) {
    const decoder = new FrameDecoder();
    const messages = decoder.push(buffer);
    return {
      messages,
      remainder: decoder.buffer
    };
  }
}

/**
 * Transform Stream variant of FrameDecoder for piping node streams
 */
class FrameDecoderTransform extends Transform {
  constructor(options = {}) {
    super({ readableObjectMode: true });
    this.decoder = new FrameDecoder(options);
    this.decoder.on('message', (msg) => this.push(msg));
    this.decoder.on('error', (err) => this.emit('error', err));
  }

  _transform(chunk, encoding, callback) {
    try {
      this.decoder.push(chunk);
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

/**
 * Newline-delimited JSON framing helpers
 */
function encodeNdjson(message) {
  assertValidMessage(message);
  return `${JSON.stringify(message)}\n`;
}

function decodeNdjson(line) {
  if (!line || !line.trim()) return null;
  const parsed = JSON.parse(line.trim());
  assertValidMessage(parsed);
  return parsed;
}

module.exports = {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  MAX_FRAME_SIZE_BYTES,
  computeDeviceFingerprint,
  generateDeviceIdentity,
  loadDeviceIdentity,
  saveDeviceIdentity,
  loadOrGenerateDeviceIdentity,
  createChallenge,
  computeHmacResponse,
  verifyHmacResponse,
  signChallengeWithKey,
  verifySignatureResponse,
  createAuthResponse,
  verifyAuthResponse,
  createMessage,
  validateMessage,
  assertValidMessage,
  encodeFrame,
  FrameDecoder,
  FrameDecoderTransform,
  encodeNdjson,
  decodeNdjson
};
