'use strict';
// Persistent settings. API keys are encrypted with the OS keychain (DPAPI on Windows)
// through Electron's safeStorage and never leave the main process.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const SECRET_KEYS = [
  'anthropicKey', 'openaiKey', 'geminiKey', 'perplexityKey', 'telegramBotToken',
  'notionApiKey', 'googleApiKey', 'slackBotToken', 'discordBotToken', 'githubToken',
  'linearApiKey', 'stripeApiKey',
];
const CHOICES = {
  theme: ['dark', 'light', 'system'],
  provider: ['local', 'colibri', 'ollama', 'anthropic', 'openai'],
  ttsProvider: ['auto', 'openai', 'kokoro', 'system'],
  voice: [
    'af_heart', 'af_bella', 'bf_emma', 'am_michael', 'am_fenrir',
    'blend_muse', 'blend_serena', 'blend_orion',
    'nova', 'alloy', 'shimmer', 'echo', 'onyx', 'fable',
  ],
  desktopPetSpecies: ['meta_muse', 'chatgpt_dots', 'cyber_fox', 'mini_robot', 'pixel_cat', 'baby_dragon', 'shiba_inu', 'ghost'],
  desktopPetTheme: ['sunset', 'cyber', 'nebula', 'sakura', 'ocean', 'golden'],
  desktopPetSize: ['compact', 'normal', 'large'],
  routingStrategy: ['local_first', 'cloud_assisted', 'auto'],
};

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best for most tasks' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster, lower cost' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable, highest cost' },
];

const DEFAULTS = {
  assistantName: 'Mave',
  theme: 'dark',                  // dark | light | system
  wakeWord: true,                 // respond to "Hey <name>"

  provider: 'local',              // local | colibri | ollama | anthropic | openai
  localModel: '',                 // installed Qwen3-VL model id
  colibriModel: 'qwen36-35b',     // local Colibri MoE model (qwen36-35b, deepseek-v4-flash)
  ollamaModel: 'deepseek-r1:8b',  // local Ollama model (e.g. deepseek-r1:8b, qwen2.5-coder:7b)
  autoModelRouting: true,         // automatically select fast vs deep model by task complexity and escalate on errors
  routingStrategy: 'local_first', // local_first | cloud_assisted | auto
  keepAiLoaded: true,             // load the local model at startup and keep it loaded (no cold starts)
  autoUpdateModels: true,         // automatically detect newer weights and hardware tier upgrades
  autoUpdateIntervalHours: 6,     // frequency in hours to check for model updates
  model: 'claude-opus-5-5',       // Claude model
  openaiModel: 'gpt-4o',          // OpenAI / ChatGPT model (gpt-4o, gpt-4o-mini, o1, o3-mini)
  openaiEndpoint: '',             // custom OpenAI-compatible endpoint (e.g. https://openrouter.ai/api/v1, https://api.deepseek.com/v1)
  effort: 'high',
  screenDetail: 'high',           // high = 1920 px screenshots for Claude, standard = 1366 px (cheaper)
  approvalMode: 'risky',          // risky | every | auto
  maxTurns: 60,
  blockedWindowKeywords: 'password, 1password, bitwarden, lastpass, keepass, bank, paypal, wallet, credential',

  // Universal Connected Services Hub (All Personal & Professional Platforms)
  connectedServicesEnabled: true,
  notesVaultPath: '',             // Path to Obsidian/Markdown notes (default: ~/Documents/Notes)
  googleDrivePath: '',            // Path to Google Drive sync folder (e.g. G:\My Drive)
  googleUserEmail: '',            // User's connected Google account email
  microsoftUserEmail: '',         // Connected Microsoft 365 / Outlook account
  githubUsername: '',             // GitHub handle
  linearTeamKey: '',              // Linear Team key
  slackDefaultChannel: '#general',// Default Slack channel
  spotifyFocusPlaylist: 'Lo-Fi Chill Beats', // Spotify focus playlist
  defaultNotesPlatform: 'obsidian', // obsidian | notion | markdown

  // Superpowers
  telegramEnabled: false,
  telegramChatId: '',
  webPort: 4040,
  desktopPetEnabled: false,
  desktopPetSpecies: 'meta_muse', // meta_muse | chatgpt_dots | cyber_fox | mini_robot | pixel_cat | baby_dragon | shiba_inu | ghost
  desktopPetTheme: 'sunset',      // sunset | cyber | nebula | sakura | ocean | golden
  desktopPetSize: 'normal',       // compact | normal | large
  desktopPetAutoMorph: true,      // auto-morph visual palette & accessories on the basis of active task
  desktopPetName: 'Muse',         // custom companion name
  proactiveRoutinesEnabled: true,
  circadianBriefing: true,
  screenMemoryEnabled: true,
  // Remote Security Access Passwords
  readPassword: '8080',           // Read-only access (Viewer: 8080)
  operatePassword: '0509',        // Chatting and operating from another device (Operator: 0509)
  adminPassword: '1508',          // Full administrative access and settings changes (Admin: 1508)
  securityEnabled: true,

  speakResponses: true,
  ttsProvider: 'auto',          // auto: ChatGPT voice if available, Kokoro on device; or kokoro, openai, system
  voice: 'af_heart',              // one of ./kokoro VOICES or ChatGPT voices
  systemVoice: '',                // Windows voice, used only if Bigfoot's voice fails
  speechRate: 1.0,

  soundEffects: true,
  showBuddy: true,
  toolTray: true,                 // double-click empty desktop space for the tool tray
  launchAtLogin: false,
  onboarded: false,
  onboardedVersion: 0,            // which setup flow was completed (2 = with the on-device model step)
  femaleVoiceDefault: true,       // set once the old male default voice has been cleared
  builtInVoice: true,             // set once moved to Bigfoot's own voice
};

class Settings {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.values = { ...DEFAULTS };
    this.secrets = {};
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const key of Object.keys(DEFAULTS)) {
        if (key in raw && typeof raw[key] === typeof DEFAULTS[key] && valid(key, raw[key])) this.values[key] = raw[key];
      }
      for (const key of SECRET_KEYS) {
        const enc = raw.secrets && raw.secrets[key];
        if (!enc) continue;
        try {
          this.secrets[key] = safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(Buffer.from(enc, 'base64'))
            : '';
        } catch {
          this.secrets[key] = ''; // encrypted by another user/machine: ask again
        }
      }
      if (!this.secrets.telegramBotToken) {
        try {
          const tgFile = path.join(path.dirname(this.file), 'telegram-config.json');
          if (fs.existsSync(tgFile)) {
            const tg = JSON.parse(fs.readFileSync(tgFile, 'utf8'));
            if (tg && tg.token) {
              this.secrets.telegramBotToken = tg.token;
              this.values.telegramEnabled = true;
            }
          }
        } catch { /* empty */ }
      }
      // A cloud provider without its key (the old default) falls back to the local model.
      const keyFor = { anthropic: 'anthropicKey', openai: 'openaiKey' }[this.values.provider];
      if (keyFor && !this.secrets[keyFor]) this.values.provider = 'local';
      // Setup used to save whichever Windows voice came first (usually a male one); the default is
      // now a female voice. Done once, so a voice picked later in Settings is kept.
      if (!raw.femaleVoiceDefault) {
        const { isMaleVoice } = require('./voice');
        if (isMaleVoice(this.values.systemVoice)) this.values.systemVoice = '';
        this.values.femaleVoiceDefault = true;
      }
      // Windows, OpenAI and ElevenLabs voices gave way to Bigfoot's own voice (done once).
      if (!raw.builtInVoice) {
        this.values.ttsProvider = 'kokoro';
        this.values.builtInVoice = true;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Settings could not be read, using defaults:', err.message);
    }
  }

  save() {
    const secrets = {};
    for (const key of SECRET_KEYS) {
      if (this.secrets[key] && safeStorage.isEncryptionAvailable()) {
        secrets[key] = safeStorage.encryptString(this.secrets[key]).toString('base64');
      }
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...this.values, secrets }, null, 2));
    fs.renameSync(tmp, this.file); // atomic replace so a crash never leaves a half-written file
  }

  get(key) { return this.values[key]; }
  secret(key) { return this.secrets[key] || ''; }

  /** Values safe to send to renderers: secrets are reduced to "is set" flags. */
  publicView() {
    const has = {};
    for (const key of SECRET_KEYS) has[key] = Boolean(this.secrets[key]);
    return { ...this.values, has, models: MODELS };
  }

  update(patch) {
    const changed = {};
    for (const [key, raw] of Object.entries(patch || {})) {
      let value = raw;
      if (SECRET_KEYS.includes(key)) {
        if (typeof value !== 'string') continue;
        this.secrets[key] = value.trim();
        changed[key] = true;
      } else if (key in DEFAULTS && typeof value === typeof DEFAULTS[key] && valid(key, value)) {
        if (key === 'assistantName') {
          const name = cleanName(value);
          if (!name) continue;
          value = name;
        }
        this.values[key] = value;
        changed[key] = value;
      }
    }
    this.save();
    for (const fn of this.listeners) fn(changed);
    return this.publicView();
  }

  onChange(fn) { this.listeners.add(fn); }
}

function valid(key, value) {
  return !CHOICES[key] || CHOICES[key].includes(value);
}

/** Names are what the user says out loud: letters, spaces, apostrophes and hyphens, 2-24 chars. */
function cleanName(value) {
  const name = String(value).replace(/[^\p{L}\p{M}' -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name.length >= 2 ? name : '';
}

module.exports = { Settings, MODELS, DEFAULTS, SECRET_KEYS, CHOICES, cleanName };
