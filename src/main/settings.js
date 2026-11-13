'use strict';
// Persistent settings. API keys and sensitive credentials are encrypted with the OS keychain
// (DPAPI on Windows) through Electron's safeStorage, with AES-256-GCM machine-scoped vault fallback,
// and never leave the main process or leak into public view models.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

let electronApp = null;
let electronSafeStorage = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    electronApp = electron.app || null;
    electronSafeStorage = electron.safeStorage || null;
  }
} catch {
  // Pure Node or headless environment
}

const SECRET_KEYS = [
  'anthropicKey', 'anthropicApiKey',
  'openaiKey', 'openaiApiKey',
  'geminiKey', 'geminiApiKey',
  'deepseekKey', 'deepseekApiKey',
  'elevenlabsApiKey', 'elevenlabsKey',
  'openrouterApiKey', 'openrouterKey',
  'perplexityKey', 'perplexityApiKey',
  'notionApiKey', 'notionKey',
  'linearApiKey', 'linearKey',
  'stripeApiKey', 'stripeKey',
  'telegramBotToken', 'telegramToken',
  'slackBotToken', 'slackToken',
  'discordBotToken', 'discordToken',
  'githubToken', 'githubApiKey',
  'googleApiKey',
  'instagramPassword', 'instagramSessionId',
  'twoFactorSecret', 'licenseKey',
];

const ALIAS_MAP = {
  anthropicApiKey: 'anthropicKey',
  anthropicKey: 'anthropicApiKey',

  openaiApiKey: 'openaiKey',
  openaiKey: 'openaiApiKey',

  geminiApiKey: 'geminiKey',
  geminiKey: 'geminiApiKey',

  deepseekApiKey: 'deepseekKey',
  deepseekKey: 'deepseekApiKey',

  elevenlabsKey: 'elevenlabsApiKey',
  elevenlabsApiKey: 'elevenlabsKey',

  openrouterKey: 'openrouterApiKey',
  openrouterApiKey: 'openrouterKey',

  perplexityApiKey: 'perplexityKey',
  perplexityKey: 'perplexityApiKey',

  notionKey: 'notionApiKey',
  notionApiKey: 'notionKey',

  linearKey: 'linearApiKey',
  linearApiKey: 'linearKey',

  stripeKey: 'stripeApiKey',
  stripeApiKey: 'stripeKey',

  telegramToken: 'telegramBotToken',
  telegramBotToken: 'telegramToken',

  slackToken: 'slackBotToken',
  slackBotToken: 'slackToken',

  discordToken: 'discordBotToken',
  discordBotToken: 'discordToken',

  githubApiKey: 'githubToken',
  githubToken: 'githubApiKey',
};

function getAliases(key) {
  const alias = ALIAS_MAP[key];
  return alias ? [alias] : [];
}

function isSecretKey(key) {
  return SECRET_KEYS.includes(key) || Boolean(ALIAS_MAP[key]);
}

const DEFAULT_REMOTE_PASSWORDS = {
  readPassword: '8080',
  operatePassword: '0509',
  adminPassword: '1508',
};

const REMOTE_PASSWORD_KEYS = ['readPassword', 'operatePassword', 'adminPassword'];

function normalizePasswordRole(role) {
  if (!role || typeof role !== 'string') return null;
  const cleaned = role.toLowerCase().replace(/password$/, '').trim();
  if (cleaned === 'read') return 'readPassword';
  if (cleaned === 'operate') return 'operatePassword';
  if (cleaned === 'admin') return 'adminPassword';
  return null;
}

function hashPassword(plainPassword, salt = crypto.randomBytes(16).toString('hex')) {
  if (typeof plainPassword !== 'string' || !plainPassword) return '';
  const hash = crypto.scryptSync(plainPassword, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPasswordHash(plainPassword, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (typeof plainPassword !== 'string' || !plainPassword) return false;
  try {
    const parts = storedHash.split('$');
    if (parts.length === 3 && parts[0] === 'scrypt') {
      const salt = parts[1];
      const expectedHash = Buffer.from(parts[2], 'hex');
      const candidateHash = crypto.scryptSync(plainPassword, salt, expectedHash.length);
      if (candidateHash.length !== expectedHash.length) return false;
      return crypto.timingSafeEqual(candidateHash, expectedHash);
    }
    if (parts.length === 4 && parts[0] === 'pbkdf2') {
      const iterations = parseInt(parts[1], 10) || 100000;
      const salt = parts[2];
      const expectedHash = Buffer.from(parts[3], 'hex');
      const candidateHash = crypto.pbkdf2Sync(plainPassword, salt, iterations, expectedHash.length, 'sha256');
      if (candidateHash.length !== expectedHash.length) return false;
      return crypto.timingSafeEqual(candidateHash, expectedHash);
    }
  } catch {
    return false;
  }
  return false;
}

function getMachineFallbackKey() {
  const machineIdentity = [
    os.hostname() || 'localhost',
    (os.userInfo ? os.userInfo().username : '') || process.env.USERNAME || '',
    process.env.USERDOMAIN || '',
    'mave-security-vault-key-salt-2026',
  ].join('::');
  return crypto.createHash('sha256').update(machineIdentity).digest();
}

function encryptFallback(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMachineFallbackKey(), iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'vault:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptFallback(encoded) {
  if (!encoded || typeof encoded !== 'string') return '';
  try {
    const raw = encoded.startsWith('vault:') ? encoded.slice(6) : encoded;
    const buf = Buffer.from(raw, 'base64');
    if (buf.length < 28) return '';
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMachineFallbackKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function isSafeStorageAvailable() {
  try {
    return Boolean(
      electronSafeStorage &&
      typeof electronSafeStorage.isEncryptionAvailable === 'function' &&
      electronSafeStorage.isEncryptionAvailable()
    );
  } catch {
    return false;
  }
}

function _setSafeStorage(mock) {
  electronSafeStorage = mock;
}

function encryptSecret(plainText) {
  if (!plainText || typeof plainText !== 'string') return '';
  if (isSafeStorageAvailable()) {
    try {
      return electronSafeStorage.encryptString(plainText).toString('base64');
    } catch {
      return encryptFallback(plainText);
    }
  }
  return encryptFallback(plainText);
}

function decryptSecret(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return '';
  if (cipherText.startsWith('vault:')) {
    try {
      return decryptFallback(cipherText);
    } catch {
      return '';
    }
  }
  if (isSafeStorageAvailable()) {
    try {
      return electronSafeStorage.decryptString(Buffer.from(cipherText, 'base64'));
    } catch {
      try {
        return decryptFallback(cipherText);
      } catch {
        return '';
      }
    }
  }
  try {
    return decryptFallback(cipherText);
  } catch {
    return '';
  }
}

const CHOICES = {
  theme: ['dark', 'light', 'system'],
  provider: ['local', 'colibri', 'ollama', 'airllm', 'anthropic', 'openai'],
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
  contrast: ['default', 'high'],
  accentColor: ['blue', 'emerald', 'indigo', 'violet', 'amber'],
  generalLanguage: ['auto', 'en', 'es', 'fr', 'de', 'hi', 'ja'],
  fileOpenDest: ['vscode', 'cursor', 'system'],
  terminalShell: ['powershell', 'cmd', 'git-bash', 'wsl'],
  confirmCloseWindow: ['shortcut-only', 'always', 'never'],
  nodeRole: ['host', 'satellite'],
  mascotStyle: ['minimal', 'robot'],
  mascotPalette: ['sky', 'pearl', 'mint', 'lilac', 'peach', 'rose', 'lemon'],
  mascotVisitFreq: ['frequent', 'normal', 'rare'],
  historyRetention: ['forever', '90d', '30d', '7d', 'incognito'],
  safetyLevel: ['strict', 'balanced', 'unfiltered'],
  routingPreference: ['prefer_free', 'strict_local_only', 'free_tools_only', 'balanced', 'best_quality', 'fastest_response', 'maximum_privacy', 'custom'],
  verificationLevel: ['strict', 'standard', 'minimal'],
  observationSampling: ['adaptive', 'continuous', 'manual'],
  defaultExecutionEnvironment: ['virtual_computer', 'sandbox', 'host'],
  recoveryPreference: ['auto_reflexion', 'ask_user', 'fail_fast'],
  resourceSavingGoal: ['storage', 'network', 'compute', 'electricity'],
};

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best for most tasks' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster, lower cost' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable, highest cost' },
];

const DEFAULTS = {
  assistantName: 'Mave',
  theme: 'light',                 // light (Antigravity Studio default) | dark | system
  wakeWord: true,                 // respond to "Hey <name>"

  provider: 'local',              // local | colibri | ollama | airllm | anthropic | openai
  localModel: 'phi-4-mini',       // default core sovereign brain (Phi-4-mini 3.8B)
  colibriModel: 'qwen36-35b',     // local Colibri MoE model (qwen36-35b, deepseek-v4-flash)
  ollamaModel: 'deepseek-r1:8b',  // local Ollama model (e.g. deepseek-r1:8b, qwen2.5-coder:7b)
  airllmModel: 'Qwen/Qwen3-32B',  // layer-streamed frontier model via AirLLM
  airllmEnabled: false,
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
  defaultPermissions: true,
  fullAccess: true,
  projectlessChatFolder: '',
  fileOpenDest: 'vscode',
  terminalShell: 'powershell',
  confirmCloseWindow: 'shortcut-only',
  vcCpuCores: 4,
  vcRamGb: 4,
  vramQuotaGb: 7,
  missionControlEnabled: true,
  deepResearchEnabled: true,
  skillForgeEnabled: true,
  nodeRole: 'host',
  hostAddress: '127.0.0.1:4040',
  nodeGpuAccel: true,
  nodeCamRelay: true,
  nodeIosAudio: true,
  mascotStyle: 'minimal',
  mascotPalette: 'sky',
  mascotVisitFreq: 'normal',
  mascotAudioReact: true,
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
  instagramUsername: 'mave.ai',
  instagramStrictNoFollow: true,  // enforce strict zero-following policy on Instagram
  instagramDeduceReelIntent: true,// auto-deduce why user sent reels and ask if they want it built
  instagramAutoLearnTrends: true, // absorb viral trends into long-term memory
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

  // Autonomous Sensory Sentinel & Human Learning
  autonomousSentinelEnabled: true,    // Mave proactively knows about changes (internet, notifications, tasks)
  proactiveNotificationsEnabled: true,// notify user when internet connects, new messages arrive, or activities change
  activityTrackingEnabled: true,      // continuous tracking of active apps & human work sessions (office vs personal)
  conversationTrackingEnabled: true,  // track and learn conversation context & user habits
  officeAppsList: 'code, devenv, visualstudio, cursor, pycharm, webstorm, sublime_text, terminal, powershell, cmd, windowsterminal, git, bash, githubdesktop, outlook, teams, slack, word, excel, powerpnt, onenote, notion, linear, jira, trello, figma, postman, docker, zoom, blender, antigravity',
  dailySummaryNotification: true,     // provide evening executive summary of what was accomplished today

  // Remote Security Access Passwords
  readPassword: '8080',           // Read-only access (Viewer: 8080)
  operatePassword: '0509',        // Chatting and operating from another device (Operator: 0509)
  adminPassword: '1508',          // Full administrative access and settings changes (Admin: 1508)
  securityEnabled: true,

  // Appearance & General
  contrast: 'default',
  accentColor: 'emerald',
  generalLanguage: 'auto',
  enableDictation: true,
  minimizeToTrayOnClose: false,

  // Notifications
  notificationsEnabled: true,
  notificationSound: true,
  notificationVolume: 80,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '08:00',

  // Plugins & Extensions
  enabledPlugins: 'price-drop-hunter, video-editor, web-research, git-companion, smart-home',

  // Billing & Licensing
  licenseKey: '',
  licenseTier: 'Lifetime Sovereign Pro',

  // Data Controls & Retention
  historyRetention: 'forever',
  screenMemoryRetention: true,

  // Safety & Guardrails
  safetyLevel: 'balanced',
  confirmDestructiveCommands: true,
  redactSensitiveLogs: true,
  strictSandbox: false,

  // Security & 2FA
  twoFactorEnabled: false,
  requirePinOnStartup: false,

  // Trusted Contact & Emergency Fallback
  trustedContactName: '',
  trustedContactRelation: '',
  trustedContactPhone: '',
  trustedContactEmail: '',
  trustedContactTelegram: '',
  trustedContactSafetyAlerts: true,
  trustedContactOutageAlerts: true,

  speakResponses: true,
  ttsProvider: 'auto',          // auto: ChatGPT voice if available, Kokoro on device; or kokoro, openai, system
  voice: 'af_heart',              // one of ./kokoro VOICES or ChatGPT voices
  systemVoice: '',                // Windows voice, used only if Bigfoot's voice fails
  speechRate: 1.0,

  soundEffects: true,
  showBuddy: true,
  showDynamicIsland: false,
  toolTray: true,                 // double-click empty desktop space for the tool tray
  launchAtLogin: false,
  onboarded: false,
  onboardedVersion: 0,
  userName: '',
  usageTags: [],
  responseStyle: 'balanced',
  deviceRole: 'host',
  enabledFeatures: {
    personalNas: true,
    multiOsHost: true,
    multiAgentDeploy: true,
    remoteAnywhere: true,
    voiceAndHud: true,
    gpuComputeCluster: true,
  },
  preferredLocalModels: [],
  installedSkills: ['windows-ops', 'git-ops', 'docker-ops', 'debug-ops'],
  knowledgeVaultDir: '',
  hostAddress: '',
  hostEmail: '',
  userEmail: '',
  authUser: null,
  hostPin: '',
  femaleVoiceDefault: true,       // set once the old male default voice has been cleared
  builtInVoice: true,             // set once moved to Bigfoot's own voice

  // MAVE Adaptive Resource Saving Goal
  resourceSavingGoal: 'storage',  // storage | network | compute | electricity
  onDemandAssets: true,           // dynamically download skills/packages on demand when saving storage
  autoPruneUnused: true,          // automatically remove/uninstall unused packages and skills to free disk
  precacheAssets: false,          // pre-cache models & packages locally for offline/network-saving
  lowComputeMode: false,          // minimize background compute & prioritize lightweight models
  ecoMode: false,                 // energy saving for electricity / battery

  // MAVE Brain V3 & Memory Architecture Settings
  routingPreference: 'prefer_free', // prefer_free | strict_local_only | free_tools_only | balanced | best_quality | fastest_response | maximum_privacy | custom
  toolResearchEnabled: true,
  costApprovalLimit: 0.50,
  maxAgentConcurrency: 3,
  taskRetryLimit: 2,
  verificationLevel: 'strict',
  memoryEnabled: true,
  sessionRetention: 'forever',
  longTermMemoryEnabled: true,
  projectMemoryEnabled: true,
  contextBudget: 4096,
  sensitiveDataPolicies: 'strict_redact',
  screenAwarenessEnabled: true,
  cameraAwarenessEnabled: false,
  microphonePermission: true,
  observationSampling: 'adaptive',
  privateDataExclusions: 'password, 1password, bitwarden, lastpass, keepass, bank, credential',
  handsFreeMode: false,
  voiceInterruptionEnabled: true,
  noiseCancellation: true,
  vadThresholdDb: -32,
  defaultExecutionEnvironment: 'virtual_computer',
  backgroundExecution: true,
  approvalCheckpoints: true,
  recoveryPreference: 'auto_reflexion',
};

class Settings {
  constructor(optionsOrPath) {
    let customPath = null;
    if (typeof optionsOrPath === 'string') {
      customPath = optionsOrPath;
    } else if (optionsOrPath && typeof optionsOrPath === 'object') {
      customPath = optionsOrPath.filePath || optionsOrPath.file || null;
    }

    if (customPath) {
      this.file = customPath;
    } else if (electronApp && typeof electronApp.getPath === 'function') {
      this.file = path.join(electronApp.getPath('userData'), 'settings.json');
    } else {
      const fallbackDir = process.env.MAVE_USER_DATA || path.join(os.homedir(), '.mave');
      this.file = path.join(fallbackDir, 'settings.json');
    }

    this.values = { ...DEFAULTS };
    this.secrets = {};
    this.listeners = new Set();
    this.load();
  }

  load() {
    let needsMigrationSave = false;
    try {
      if (!fs.existsSync(this.file)) {
        for (const [key, defVal] of Object.entries(DEFAULT_REMOTE_PASSWORDS)) {
          this.secrets[key + 'Hash'] = hashPassword(defVal);
          this.secrets[key] = defVal;
        }
        for (const key of SECRET_KEYS) delete this.values[key];
        for (const key of REMOTE_PASSWORD_KEYS) delete this.values[key];
        return;
      }

      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));

      // 1. Populate non-secret defaults from file
      for (const key of Object.keys(DEFAULTS)) {
        if (isSecretKey(key) || REMOTE_PASSWORD_KEYS.includes(key)) continue;
        if (key in raw && typeof raw[key] === typeof DEFAULTS[key] && valid(key, raw[key])) {
          this.values[key] = raw[key];
        }
      }

      // 2. Load encrypted secrets from raw.secrets
      if (raw.secrets && typeof raw.secrets === 'object') {
        for (const [key, enc] of Object.entries(raw.secrets)) {
          if (!enc || typeof enc !== 'string') continue;
          try {
            const dec = decryptSecret(enc);
            if (dec) {
              this.secrets[key] = dec;
              for (const alias of getAliases(key)) {
                if (!this.secrets[alias]) this.secrets[alias] = dec;
              }
            }
          } catch {
            this.secrets[key] = '';
          }
        }
      }

      // 3. Migrate legacy unencrypted secrets & passwords at root of raw
      for (const key of Object.keys(raw)) {
        if (key === 'secrets') continue;

        if (isSecretKey(key)) {
          const rawVal = raw[key];
          if (typeof rawVal === 'string' && rawVal.trim()) {
            const trimmed = rawVal.trim();
            this.secrets[key] = trimmed;
            for (const alias of getAliases(key)) {
              this.secrets[alias] = trimmed;
            }
            needsMigrationSave = true;
          }
        } else if (REMOTE_PASSWORD_KEYS.includes(key)) {
          const rawVal = raw[key];
          if (typeof rawVal === 'string' && rawVal.trim()) {
            const trimmed = rawVal.trim();
            this.secrets[key] = trimmed;
            this.secrets[key + 'Hash'] = hashPassword(trimmed);
            needsMigrationSave = true;
          }
        }
      }

      // 4. Ensure remote password hashes are initialized
      for (const [key, defVal] of Object.entries(DEFAULT_REMOTE_PASSWORDS)) {
        if (!this.secrets[key + 'Hash']) {
          this.secrets[key + 'Hash'] = hashPassword(defVal);
          if (!this.secrets[key]) this.secrets[key] = defVal;
        }
      }

      // 5. Scrub all secrets and passwords from this.values
      for (const key of SECRET_KEYS) {
        delete this.values[key];
      }
      for (const key of REMOTE_PASSWORD_KEYS) {
        delete this.values[key];
      }

      // Synchronize any alias pairs in memory
      for (const [key, alias] of Object.entries(ALIAS_MAP)) {
        if (this.secrets[key] && !this.secrets[alias]) {
          this.secrets[alias] = this.secrets[key];
        } else if (this.secrets[alias] && !this.secrets[key]) {
          this.secrets[key] = this.secrets[alias];
        }
      }

      // Telegram config fallback
      if (!this.secrets.telegramBotToken) {
        try {
          const tgFile = path.join(path.dirname(this.file), 'telegram-config.json');
          if (fs.existsSync(tgFile)) {
            const tg = JSON.parse(fs.readFileSync(tgFile, 'utf8'));
            if (tg && tg.token) {
              this.secrets.telegramBotToken = tg.token;
              this.secrets.telegramToken = tg.token;
              this.values.telegramEnabled = true;
            }
          }
        } catch { /* empty */ }
      }

      // Provider key check
      const keyFor = { anthropic: 'anthropicKey', openai: 'openaiKey' }[this.values.provider];
      if (keyFor && !this.secret(keyFor)) this.values.provider = 'local';

      // Sovereign identity is permanently and immutably Mave
      this.values.assistantName = 'Mave';

      if (!raw.femaleVoiceDefault) {
        try {
          const { isMaleVoice } = require('./voice');
          if (isMaleVoice(this.values.systemVoice)) this.values.systemVoice = '';
        } catch { /* empty */ }
        this.values.femaleVoiceDefault = true;
      }

      if (!raw.builtInVoice) {
        this.values.ttsProvider = 'kokoro';
        this.values.builtInVoice = true;
      }

      if (needsMigrationSave) {
        this.save();
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Settings could not be read, using defaults:', err.message);
    }
  }

  save() {
    const secrets = {};
    for (const [key, val] of Object.entries(this.secrets)) {
      if (val) {
        secrets[key] = encryptSecret(val);
      }
    }

    const sanitizedValues = { ...this.values };
    for (const key of SECRET_KEYS) delete sanitizedValues[key];
    for (const key of REMOTE_PASSWORD_KEYS) delete sanitizedValues[key];

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ ...sanitizedValues, secrets }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(key) {
    if (REMOTE_PASSWORD_KEYS.includes(key)) {
      return this.secrets[key] || DEFAULT_REMOTE_PASSWORDS[key] || '';
    }
    return this.values[key];
  }

  secret(key) {
    if (this.secrets[key]) return this.secrets[key];
    for (const alias of getAliases(key)) {
      if (this.secrets[alias]) return this.secrets[alias];
    }
    return '';
  }

  verifyRemotePassword(role, plainPassword) {
    if (typeof plainPassword !== 'string' || !plainPassword) return false;
    const roleKey = normalizePasswordRole(role);
    if (!roleKey) return false;

    let storedHash = this.secrets[roleKey + 'Hash'];
    if (!storedHash) {
      const def = DEFAULT_REMOTE_PASSWORDS[roleKey];
      if (!def) return false;
      storedHash = hashPassword(def);
      this.secrets[roleKey + 'Hash'] = storedHash;
    }

    return verifyPasswordHash(plainPassword, storedHash);
  }

  /** Values safe to send to renderers: secrets are never revealed and reduced to boolean flags. */
  publicView() {
    const safe = {};
    for (const [k, v] of Object.entries(this.values)) {
      if (isSecretKey(k) || REMOTE_PASSWORD_KEYS.includes(k)) continue;
      safe[k] = v;
    }

    const has = {};
    for (const key of SECRET_KEYS) {
      const isSet = Boolean(this.secret(key));
      has[key] = isSet;
      const flag = 'has' + key.charAt(0).toUpperCase() + key.slice(1);
      safe[flag] = isSet;
    }

    for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
      const isSet = Boolean(this.secret(canonical));
      has[alias] = isSet;
      const flag = 'has' + alias.charAt(0).toUpperCase() + alias.slice(1);
      safe[flag] = isSet;
    }

    safe.has = has;
    safe.models = MODELS;
    return safe;
  }

  update(patch) {
    const changed = {};
    for (const [key, raw] of Object.entries(patch || {})) {
      const value = raw;
      if (isSecretKey(key)) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        this.secrets[key] = trimmed;
        changed[key] = true;
        for (const alias of getAliases(key)) {
          this.secrets[alias] = trimmed;
          changed[alias] = true;
        }
      } else if (REMOTE_PASSWORD_KEYS.includes(key)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const trimmed = value.trim();
        this.secrets[key] = trimmed;
        this.secrets[key + 'Hash'] = hashPassword(trimmed);
        delete this.values[key];
        changed[key] = true;
      } else if (key in DEFAULTS && typeof value === typeof DEFAULTS[key] && valid(key, value)) {
        if (key === 'assistantName') {
          this.values.assistantName = 'Mave';
          changed.assistantName = 'Mave';
          continue;
        }
        if (key === 'resourceSavingGoal') {
          this.values.resourceSavingGoal = value;
          changed.resourceSavingGoal = value;
          if (value === 'storage') {
            this.values.onDemandAssets = true;
            this.values.autoPruneUnused = true;
            this.values.precacheAssets = false;
            this.values.lowComputeMode = false;
            this.values.ecoMode = false;
          } else if (value === 'network') {
            this.values.onDemandAssets = false;
            this.values.autoPruneUnused = false;
            this.values.precacheAssets = true;
            this.values.lowComputeMode = false;
            this.values.ecoMode = false;
          } else if (value === 'compute') {
            this.values.onDemandAssets = false;
            this.values.autoPruneUnused = true;
            this.values.precacheAssets = false;
            this.values.lowComputeMode = true;
            this.values.ecoMode = false;
          } else if (value === 'electricity') {
            this.values.onDemandAssets = false;
            this.values.autoPruneUnused = true;
            this.values.precacheAssets = false;
            this.values.lowComputeMode = true;
            this.values.ecoMode = true;
          }
          continue;
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

module.exports = {
  Settings,
  MODELS,
  DEFAULTS,
  SECRET_KEYS,
  ALIAS_MAP,
  CHOICES,
  cleanName,
  hashPassword,
  verifyPasswordHash,
  encryptSecret,
  decryptSecret,
  encryptFallback,
  decryptFallback,
  _setSafeStorage,
};
