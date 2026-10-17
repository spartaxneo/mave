'use strict';
// Automatic Model Detection, Update & Seamless Installation Engine for Mave.
// Monitors Hugging Face and model catalogs for newer revisions, quantized weights,
// and hardware-adaptive model tier upgrades. Automatically triggers download
// and installation in the background without user friction.

const { EventEmitter } = require('events');
const catalog = require('./catalog');
const hardware = require('./hardware');

const HF_API_BASE = 'https://huggingface.co/api/models';
const DEFAULT_INTERVAL_HOURS = 6;

class ModelAutoUpdater extends EventEmitter {
  constructor({ manager, settings, logger, fetchImpl = global.fetch, hardwareImpl = hardware } = {}) {
    super();
    this.manager = manager;
    this.settings = settings;
    this.logger = logger;
    this.fetch = fetchImpl || global.fetch;
    this.hardware = hardwareImpl || hardware;
    this.timer = null;
    this.isChecking = false;
    this.lastCheck = null;
    this.lastUpdate = null;
  }

  isEnabled() {
    return this.settings ? this.settings.get('autoUpdateModels') !== false : true;
  }

  getIntervalHours() {
    return this.settings ? (this.settings.get('autoUpdateIntervalHours') || DEFAULT_INTERVAL_HOURS) : DEFAULT_INTERVAL_HOURS;
  }

  /**
   * Check Hugging Face remote API for latest commit hash of a repository.
   */
  async getRemoteRepoSha(repo) {
    if (!this.fetch) return null;
    try {
      const timeoutSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
      const res = await this.fetch(`${HF_API_BASE}/${repo}`, {
        headers: { 'User-Agent': 'Mave-AutoUpdater/1.4' },
        signal: timeoutSignal
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.sha || data.lastModified || null;
    } catch (err) {
      if (this.logger) this.logger.info(`Could not reach Hugging Face for ${repo}: ${err.message}`);
      return null;
    }
  }

  /**
   * Check if a newer version, revision, or hardware-optimized tier is available.
   * If autoInstall is true and an update is found, automatically begins download & installation.
   */
  async checkForUpdates({ autoInstall = null } = {}) {
    if (this.isChecking) {
      return { status: 'busy', message: 'Model update check already in progress.' };
    }

    this.isChecking = true;
    this.lastCheck = new Date().toISOString();
    const shouldInstall = autoInstall != null ? autoInstall : this.isEnabled();

    if (this.logger) this.logger.info('Checking for model updates and newer weights...');

    try {
      const currentId = this.manager ? this.manager.installedId() : (this.settings ? this.settings.get('localModel') : '');
      const hw = await this.hardware.detect();
      const currentModel = currentId ? catalog.modelById(currentId) : null;

      // 1. Check if hardware can support a better recommended model tier
      let recommendedUpgrade = null;
      if (currentModel && !currentModel.custom) {
        // If system has dedicated GPU (24GB+) and is running 8B or 4B, recommend 30B
        if (hw.dedicated && hw.vramGB >= 24 && currentId !== 'qwen3-vl-30b') {
          const upgradeModel = catalog.modelById('qwen3-vl-30b');
          if (upgradeModel) {
            recommendedUpgrade = {
              targetModel: upgradeModel,
              reason: `Hardware upgrade detected: Your dedicated GPU (${hw.vramGB} GB VRAM) can run ${upgradeModel.label} natively at full speed.`,
              type: 'tier_upgrade'
            };
          }
        // If system has dedicated GPU (8GB+) and is running 4B, recommend 8B
        } else if (hw.dedicated && hw.vramGB >= 8 && currentId === 'qwen3-vl-4b') {
          const upgradeModel = catalog.modelById('qwen3-vl-8b');
          if (upgradeModel) {
            recommendedUpgrade = {
              targetModel: upgradeModel,
              reason: `Hardware upgrade detected: Your dedicated GPU (${hw.vramGB} GB VRAM) can run ${upgradeModel.label} natively at full speed.`,
              type: 'tier_upgrade'
            };
          }
        }
      }

      // 2. Check remote Hugging Face revision update for current model
      let remoteRevisionUpdate = null;
      if (currentModel && currentModel.repo && currentModel.files?.[0]) {
        const localRev = currentModel.files[0].url.split('/resolve/')[1]?.split('/')[0] || '';
        const remoteSha = await this.getRemoteRepoSha(currentModel.repo);

        if (remoteSha && localRev && remoteSha !== localRev) {
          remoteRevisionUpdate = {
            targetModel: currentModel,
            remoteSha,
            localRev,
            reason: `Newer weights detected on Hugging Face (${remoteSha.slice(0, 8)} vs local ${localRev.slice(0, 8)}).`,
            type: 'revision_update'
          };
        }
      }

      // 3. Check if remote catalog has updated recommended models
      const updateCandidate = recommendedUpgrade || remoteRevisionUpdate;

      if (!updateCandidate) {
        const result = {
          updateAvailable: false,
          currentModel: currentId || 'none',
          checkedAt: this.lastCheck,
          message: 'All models are up to date. You are running the optimal version.'
        };
        this.emit('up-to-date', result);
        return result;
      }

      const targetId = updateCandidate.targetModel.id;
      const result = {
        updateAvailable: true,
        currentModel: currentId,
        targetModel: targetId,
        targetLabel: updateCandidate.targetModel.label,
        reason: updateCandidate.reason,
        type: updateCandidate.type,
        checkedAt: this.lastCheck
      };

      this.emit('update-available', result);
      if (this.logger) this.logger.info(`Model update available: ${result.targetLabel} (${result.reason})`);

      // 4. Auto-install if enabled
      if (shouldInstall && this.manager) {
        if (this.logger) this.logger.info(`Auto-installing model update: ${targetId}...`);
        this.lastUpdate = {
          modelId: targetId,
          startedAt: new Date().toISOString(),
          reason: result.reason
        };

        this.emit('auto-install-started', { modelId: targetId, label: updateCandidate.targetModel.label });
        this.manager.start(targetId);
        result.autoInstalling = true;
      }

      return result;
    } catch (err) {
      if (this.logger) this.logger.error('Error during model update check', err.message);
      return { updateAvailable: false, error: err.message };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Start periodic auto-update timer.
   */
  startAutoCheckTimer(hours = null) {
    this.stopAutoCheckTimer();
    const intervalHours = hours || this.getIntervalHours();
    const ms = intervalHours * 3600 * 1000;

    this.timer = setInterval(() => {
      if (this.isEnabled()) {
        this.checkForUpdates({ autoInstall: true }).catch(() => {});
      }
    }, ms);

    if (this.timer.unref) this.timer.unref();
  }

  stopAutoCheckTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run initial check after app startup with graceful delay.
   */
  checkOnStartup(delayMs = 8000) {
    setTimeout(() => {
      if (this.isEnabled()) {
        this.checkForUpdates({ autoInstall: true }).catch(() => {});
      }
    }, delayMs);
  }
}

module.exports = {
  ModelAutoUpdater,
  DEFAULT_INTERVAL_HOURS
};
