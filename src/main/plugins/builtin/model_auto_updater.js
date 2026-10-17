'use strict';
// Automatic Model Detection, Update & Seamless Installation Plugin for Mave.
// Probes Hugging Face and model catalogs for newer revisions, weights, and hardware-optimized tiers.
// Automatically downloads and switches to updated models without user intervention.

const { ModelAutoUpdater } = require('../../local/auto_updater');

// Shared instance placeholder populated by main or initialized on demand
let updaterInstance = null;

function getUpdater(ctx) {
  if (global.__maveModelAutoUpdater) return global.__maveModelAutoUpdater;
  if (!updaterInstance) {
    updaterInstance = new ModelAutoUpdater({
      manager: global.__maveLocalModelManager || null,
      settings: ctx.settings || null,
      logger: { info: (msg) => ctx.log('info', msg), error: (msg) => ctx.log('stderr', msg) }
    });
  }
  return updaterInstance;
}

module.exports = [
  {
    name: 'check_model_updates',
    description: 'Check Hugging Face and the model catalog for newer model weights, quantization revisions, or hardware-optimized tier upgrades. Automatically downloads and installs the updated model if auto_install is true.',
    input_schema: {
      type: 'object',
      properties: {
        auto_install: {
          type: 'boolean',
          description: 'Whether to automatically begin downloading and installing the updated model immediately (default: true).'
        }
      },
      additionalProperties: false
    },
    async run(input, ctx) {
      const autoInstall = input.auto_install !== false;
      const updater = getUpdater(ctx);

      ctx.log('info', 'Checking remote model registries and hardware profiles for updates...');
      const result = await updater.checkForUpdates({ autoInstall });

      if (result.status === 'busy') {
        return `⏳ **MODEL UPDATE IN PROGRESS**: A model update check or installation is already running in the background.`;
      }

      if (!result.updateAvailable) {
        return `✅ **ALL MODELS UP TO DATE**:
• **Active Model**: \`${result.currentModel || 'qwen3-vl-8b'}\`
• **Status**: Running optimal weights and quantization.
• **Last Checked**: \`${result.checkedAt || new Date().toISOString()}\``;
      }

      if (result.autoInstalling) {
        return `🚀 **AUTOMATIC MODEL UPDATE STARTED**:
• **Current Model**: \`${result.currentModel}\`
• **Target Upgrade**: **${result.targetLabel}** (\`${result.targetModel}\`)
• **Reason**: ${result.reason}
• **Installation**: **Active in background**. Mave will seamlessly switch to the new model as soon as download and verification complete.`;
      }

      return `📦 **MODEL UPDATE AVAILABLE**:
• **Current Model**: \`${result.currentModel}\`
• **Available Upgrade**: **${result.targetLabel}** (\`${result.targetModel}\`)
• **Reason**: ${result.reason}
• **Action**: Call \`check_model_updates\` with \`auto_install: true\` to install automatically.`;
    }
  },
  {
    name: 'configure_model_auto_update',
    description: 'Enable, disable, or adjust the frequency of Mave\'s automatic background model update and installation engine.',
    input_schema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Enable or disable automatic model updates (default: true).'
        },
        interval_hours: {
          type: 'number',
          description: 'Check interval in hours (e.g. 6, 12, 24; default: 6).'
        }
      },
      additionalProperties: false
    },
    async run(input, ctx) {
      const enabled = input.enabled != null ? input.enabled : true;
      const hours = input.interval_hours || 6;

      if (ctx.settings) {
        ctx.settings.update({
          autoUpdateModels: enabled,
          autoUpdateIntervalHours: hours
        });
      }

      const updater = getUpdater(ctx);
      if (enabled) {
        updater.startAutoCheckTimer(hours);
      } else {
        updater.stopAutoCheckTimer();
      }

      return `⚙️ **MODEL AUTO-UPDATE CONFIGURATION SAVED**:
• **Automatic Updates**: **${enabled ? 'ENABLED' : 'DISABLED'}**
• **Check Frequency**: Every \`${hours} hours\` + on application startup
• **Behavior**: Newer weights and hardware upgrades will be downloaded and installed seamlessly in the background.`;
    }
  }
];
