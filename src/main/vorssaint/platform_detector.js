'use strict';

/**
 * Vorssaint OS — Intelligent Platform Capability Detector & Substitution Engine
 * Dynamically resolves native OS features, replaces sandbox-restricted capabilities,
 * and surfaces platform-exclusive utilities.
 */

const fs = require('fs');
const path = require('path');

class PlatformDetector {
  constructor() {
    this.matrixPath = path.join(__dirname, 'feature_substitution_matrix.json');
    this._matrix = null;
    this.loadMatrix();
  }

  loadMatrix() {
    try {
      if (fs.existsSync(this.matrixPath)) {
        this._matrix = JSON.parse(fs.readFileSync(this.matrixPath, 'utf8'));
      }
    } catch {
      this._matrix = { features: [] };
    }
  }

  getMatrix() {
    if (!this._matrix) this.loadMatrix();
    return this._matrix;
  }

  detectPlatform(userAgent = '', explicitPlatform = null) {
    if (explicitPlatform) {
      const p = explicitPlatform.toLowerCase();
      if (['windows', 'android', 'ios', 'ipados', 'macos', 'linux'].includes(p)) return p;
    }

    const ua = String(userAgent).toLowerCase();
    if (ua.includes('ipad')) return 'ipados';
    if (ua.includes('iphone') || ua.includes('ipod')) return 'ios';
    if (ua.includes('android')) return 'android';
    if (ua.includes('macintosh') || ua.includes('mac os x')) {
      // iPad Safari on iPadOS 13+ requests desktop site with 'Macintosh'
      if (ua.includes('mobile') || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) {
        return 'ipados';
      }
      return 'macos';
    }
    if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');
  }

  getPlatformProfile(platform) {
    const matrix = this.getMatrix();
    const plat = platform.toLowerCase();

    const result = {
      platform: plat,
      displayName: this._getDisplayName(plat),
      capabilities: {},
      replacements: {},
      exclusiveFeatures: [],
    };

    for (const feat of matrix.features || []) {
      const info = feat[plat];
      if (!info) continue;

      result.capabilities[feat.id] = {
        name: feat.name,
        category: feat.category,
        strategy: info.strategy,
        status: info.status,
        api: info.api,
        restriction: info.restriction || null,
        hasReplacement: Boolean(info.replacement),
      };

      if (info.replacement) {
        result.replacements[feat.id] = info.replacement;
        result.exclusiveFeatures.push({
          replacesId: feat.id,
          replacesName: feat.name,
          ...info.replacement,
        });
      }
    }

    return result;
  }

  _getDisplayName(platform) {
    const map = {
      windows: 'Windows 10 / 11 Desktop',
      android: 'Android Phone / Tablet',
      ios: 'Apple iPhone (iOS)',
      ipados: 'Apple iPad (iPadOS)',
      macos: 'Apple Mac (macOS)',
      linux: 'Linux Desktop',
    };
    return map[platform] || platform;
  }
}

let instance = null;
function getPlatformDetector() {
  if (!instance) instance = new PlatformDetector();
  return instance;
}

module.exports = { PlatformDetector, getPlatformDetector };
