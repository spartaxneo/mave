'use strict';
// Every request a renderer can make. The preload allowlist mirrors these channel names.

const { app, ipcMain, shell, systemPreferences, screen, BrowserWindow, net, dialog } = require('electron');
const path = require('path');
const llm = require('./llm');
const { VOICES } = require('./kokoro');
const hardware = require('./local/hardware');
const catalog = require('./local/catalog');
const { getGovernanceManager, POWER_TIERS } = require('./security/governance');
const { firebaseService } = require('./firebase');
const { userManager } = require('./users');

const LINKS = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  qwen: 'https://huggingface.co/Qwen',
  micSettings: 'ms-settings:privacy-microphone',
  speechSettings: 'ms-settings:speech',
};

function microphoneStatus() {
  try {
    return systemPreferences.getMediaAccessStatus('microphone');
  } catch {
    return 'unknown';
  }
}

function registerIpc({ controller, windows, settings, agent, audio, activity, plugins, pluginManager, logger, costs, local, runtime, terminals }) {
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => fn(...args, event));

  // settings
  handle('settings:get', () => settings.publicView());
  handle('settings:update', (patch) => settings.update(patch));
  // Validates a candidate key (or the saved one) for a model provider.
  handle('provider:test', async (id, candidate) => {
    const p = llm.PROVIDERS[id];
    if (!p || !p.cloud) return { ok: false, message: 'Unknown provider.' };
    const key = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : settings.secret(p.keyName);
    if (!key) return { ok: false, message: 'Paste a key first.' };
    if (id === 'anthropic' && !/^sk-ant-/.test(key)) return { ok: false, message: 'Anthropic keys start with sk-ant-.' };
    try {
      const endpoint = id === 'openai' ? settings.get('openaiEndpoint') : null;
      await llm.testKey(id, key, settings.get(p.modelSetting), endpoint);
      return { ok: true, message: 'Connected' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
  handle('models:list', async (id) => {
    const p = llm.PROVIDERS[id];
    const key = p && p.cloud && settings.secret(p.keyName);
    if (!key) return { ok: false, models: [], message: `Add a ${p ? p.label : ''} key to see its models.` };
    try {
      const endpoint = id === 'openai' ? settings.get('openaiEndpoint') : null;
      return { ok: true, models: await llm.listModels(id, key, endpoint) };
    } catch (err) {
      return { ok: false, models: [], message: err.message };
    }
  });
  handle('provider:active', () => {
    const online = net.isOnline();
    const id = llm.resolveProvider(settings, { online });
    return { id, label: llm.describe(settings, id), online };
  });

  // local AI
  handle('local:hardware', async () => {
    const hw = await hardware.detect(app.getPath('userData'));
    return { hardware: hw, ...catalog.recommend(hw) };
  });
  handle('local:status', async () => {
    let colibriActive = false;
    try {
      const { colibriService } = require('./local/colibri');
      colibriActive = await colibriService.isHealthy();
    } catch { /* empty */ }
    return {
      ...local.snapshot(),
      runtime: runtime.running ? 'ready' : 'stopped',
      online: net.isOnline(),
      provider: settings.get('provider') || 'local',
      colibriActive,
      colibriModel: settings.get('colibriModel') || 'deepseek-v4-flash',
      ollamaModel: settings.get('ollamaModel') || 'deepseek-r1:8b',
    };
  });
  handle('local:start', async (id) => {
    if (id && id.startsWith('colibri-')) {
      const rawModel = id.replace(/^colibri-/, '');
      runtime.stop(); // free GPU / system RAM
      const { colibriService } = require('./local/colibri');
      await colibriService.start(rawModel);
      settings.update({ provider: 'colibri', colibriModel: rawModel });
      return { ok: true, provider: 'colibri', model: rawModel, status: 'ready' };
    }
    if (id && id.startsWith('ollama-')) {
      const parts = id.replace(/^ollama-/, '').split('-');
      const rawModel = parts.length > 1 ? `${parts.slice(0, -1).join('-')}:${parts[parts.length - 1]}` : parts[0];
      settings.update({ provider: 'ollama', ollamaModel: rawModel });
      return { ok: true, provider: 'ollama', model: rawModel, status: 'ready' };
    }
    try {
      const { colibriService } = require('./local/colibri');
      colibriService.stop();
    } catch { /* empty */ }
    settings.update({ provider: 'local', localModel: id });
    return local.start(id);
  });
  handle('local:pause', () => local.pause());
  handle('local:resume', () => local.resume());
  handle('local:cancel', () => local.cancel());
  handle('local:custom-scan', async () => catalog.scanCustomModels());
  handle('local:pick-file', async (event) => {
    const fs = require('fs');
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Select GGUF Model',
      buttonLabel: 'Select Model',
      properties: ['openFile'],
      filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const modelPath = res.filePaths[0];
    const stat = fs.statSync(modelPath);
    const sizeGB = Math.round((stat.size / (1024 ** 3)) * 10) / 10;
    const filename = path.basename(modelPath);
    const baseId = filename.replace(/\.gguf$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const cleanLabel = filename.replace(/\.gguf$/i, '').replace(/[-_]/g, ' ');
    const modelDef = {
      id: `custom-${baseId}`,
      size: `${sizeGB}GB`,
      label: cleanLabel,
      memoryGB: Math.max(4, Math.round(sizeGB * 1.25)),
      custom: true,
      modelPath,
      bytes: stat.size,
      available: true,
    };
    catalog.saveCustomModel(modelDef);
    return modelDef;
  });
  handle('local:remove-custom', (id) => catalog.removeCustomModel(id));
  handle('local:check-updates', async (autoInstall = true) => {
    if (global.__maveModelAutoUpdater) {
      return await global.__maveModelAutoUpdater.checkForUpdates({ autoInstall });
    }
    return { updateAvailable: false, message: 'Auto-updater not active' };
  });
  handle('local:auto-update-status', () => {
    return {
      enabled: settings.get('autoUpdateModels') !== false,
      intervalHours: settings.get('autoUpdateIntervalHours') || 6,
      lastCheck: global.__maveModelAutoUpdater ? global.__maveModelAutoUpdater.lastCheck : null,
      lastUpdate: global.__maveModelAutoUpdater ? global.__maveModelAutoUpdater.lastUpdate : null
    };
  });

  // Superpowers
  handle('superpowers:status', async () => {
    let pet = null;
    try {
      const { getPetManager } = require('./pet/manager');
      const pm = getPetManager();
      if (pm) pet = pm.getStatus();
    } catch { /* empty */ }

    let lanUrl = 'http://127.0.0.1:4040';
    try {
      const { getLocalIp } = require('./remote/web');
      const port = settings.get('webPort') || 4040;
      lanUrl = `http://${getLocalIp()}:${port}`;
    } catch { /* empty */ }

    let tgConfig = {};
    try {
      const { loadTelegramConfig } = require('./remote/telegram');
      tgConfig = loadTelegramConfig();
    } catch { /* empty */ }

    const tgToken = settings.secret('telegramBotToken') || process.env.TELEGRAM_BOT_TOKEN || tgConfig.token || '';
    const isTgConfigured = Boolean(tgToken);
    const tgUsername = tgConfig.username || 'FromnearTaskManager_bot';

    return {
      mobileLanUrl: lanUrl,
      mobileLocalUrl: `http://localhost:${settings.get('webPort') || 4040}`,
      pet: pet || { name: 'Codex Pet', state: 'idle', hunger: 30, happiness: 90, energy: 85 },
      telegram: {
        configured: isTgConfigured,
        token: tgToken,
        botUsername: tgUsername,
        chatId: settings.get('telegramChatId') || tgConfig.authorizedChatId || '',
        enabled: settings.get('telegramEnabled') !== false,
      },
      routines: {
        proactiveEnabled: settings.get('proactiveRoutinesEnabled') !== false,
        circadianBriefing: settings.get('circadianBriefing') !== false,
      },
      screenMemory: {
        enabled: settings.get('screenMemoryEnabled') !== false,
      },
      knowledgeVault: {
        dir: settings.get('knowledgeVaultDir') || 'E:\\AI-Models',
      },
      router: {
        strategy: settings.get('routingStrategy') || 'local_first',
        autoRouting: settings.get('autoModelRouting') !== false,
      },
    };
  });

  handle('pet:feed', () => {
    try {
      const { getPetManager } = require('./pet/manager');
      const pm = getPetManager();
      if (pm) return pm.feed();
    } catch { /* empty */ }
    return { ok: true, message: 'Fed pet!' };
  });

  handle('pet:pet', () => {
    try {
      const { getPetManager } = require('./pet/manager');
      const pm = getPetManager();
      if (pm) return pm.pet();
    } catch { /* empty */ }
    return { ok: true, message: 'Petted companion!' };
  });

  handle('pet:play', () => {
    try {
      const { getPetManager } = require('./pet/manager');
      const pm = getPetManager();
      if (pm) return pm.play();
    } catch { /* empty */ }
    return { ok: true, message: 'Played with companion!' };
  });

  handle('pet:summon', () => {
    try {
      settings.update({ desktopPetEnabled: true });
      windows.showPet(settings.get('desktopPetSize'));
      windows.updatePetConfig({
        species: settings.get('desktopPetSpecies'),
        theme: settings.get('desktopPetTheme'),
        size: settings.get('desktopPetSize'),
        name: settings.get('desktopPetName'),
        autoMorph: settings.get('desktopPetAutoMorph'),
      });
      return { ok: true, message: 'Companion summoned to desktop!' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('telegram:connect', async (candidateToken) => {
    try {
      const { TelegramBridge, saveTelegramConfig, loadTelegramConfig } = require('./remote/telegram');
      const saved = loadTelegramConfig();
      const token = typeof candidateToken === 'string' && candidateToken.trim()
        ? candidateToken.trim()
        : (settings.secret('telegramBotToken') || saved.token || process.env.TELEGRAM_BOT_TOKEN);
      if (!token) return { ok: false, message: 'No Telegram bot token provided.' };
      const bridge = new TelegramBridge({ token, controller, logger });
      const info = await bridge.verifyToken();
      settings.update({ telegramBotToken: token, telegramEnabled: true });
      saveTelegramConfig({ token, username: info.username });
      bridge.start();
      return { ok: true, message: `Connected to @${info.username}`, username: info.username, token };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  // Instagram Social Brain & Reels Intent Handlers
  handle('instagram:get-profile', () => {
    const { getInstagramSocialBrain } = require('./social/instagram');
    const brain = getInstagramSocialBrain({ settings });
    return brain.getProfile();
  });
  handle('instagram:update-profile', (patch) => {
    const { getInstagramSocialBrain } = require('./social/instagram');
    const brain = getInstagramSocialBrain({ settings });
    return brain.updateProfile(patch);
  });
  handle('instagram:analyze-reel', async (reelUrl, userComment) => {
    const { getInstagramSocialBrain } = require('./social/instagram');
    const brain = getInstagramSocialBrain({ settings });
    const metadata = await brain.fetchReelMetadata(reelUrl);
    const deduction = brain.deduceIntent(metadata, userComment);
    const reply = brain.generateHumanReply(metadata, deduction, userComment);
    return { ok: true, metadata, deduction, reply };
  });
  handle('instagram:get-rules', () => {
    const { getInstagramSocialBrain } = require('./social/instagram');
    const brain = getInstagramSocialBrain({ settings });
    return brain.getRules();
  });
  handle('instagram:teach-rule', (trigger, intentType, actionPrompt) => {
    const { getInstagramSocialBrain } = require('./social/instagram');
    const brain = getInstagramSocialBrain({ settings });
    const rule = brain.teachCustomRule(trigger, intentType, actionPrompt);
    return { ok: true, rule };
  });

  handle('routines:briefing', async () => {
    try {
      const { ExecutiveBriefing } = require('./routines/circadian');
      const briefing = new ExecutiveBriefing({ controller, logger });
      const summary = await briefing.generateBriefing();
      return { ok: true, summary };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('knowledge:reindex', async () => {
    try {
      const { PersonalKnowledgeVault } = require('./rag/vault');
      const vault = new PersonalKnowledgeVault({ dir: settings.get('knowledgeVaultDir') || 'E:\\AI-Models', logger });
      const stats = await vault.reindex();
      return { ok: true, stats };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  // tool tray and math
  handle('toolbar:pick', (tool) => { controller.pickTool(tool); return true; });
  handle('math:read', (png) => controller.readMath(png));
  handle('math:ink', (strokes, image) => controller.readMathInk(strokes, image));
  handle('math:system', (expressions) => controller.solveMathSystem(expressions));
  handle('math:calc', (text, angle) => controller.calculate(text, angle === 'rad' ? 'rad' : 'deg'));
  handle('math:share', (text) => {
    if (typeof text !== 'string' || !text.trim()) return { ok: false };
    require('electron').clipboard.writeText(text.slice(0, 20000));
    return { ok: true };
  });
  handle('ink:stop', () => { controller.stopInk(); return true; });
  handle('tool:exit', () => { controller.exitTool(); return true; });
  handle('ink:share', (kind, event) => controller.shareDrawing(windows.displayIdOf(event.sender), ['copy', 'png', 'svg'].includes(kind) ? kind : 'copy'));
  handle('ink:reveal', (file) => { controller.revealFile(file); return true; });
  ipcMain.on('ink:reply', (_e, msg) => controller.onInkReply(msg || {}));
  ipcMain.on('ink:state', (event, state) => controller.onInkState(windows.displayIdOf(event.sender), state || {}));
  ipcMain.on('ink:passthrough', (event, on) => controller.setInkPassthrough(windows.displayIdOf(event.sender), Boolean(on)));

  // voice
  // Bigfoot's own voices (./kokoro): the choice in setup and on the Voice page.
  handle('voices:list', () => ({ ok: true, voices: VOICES }));
  handle('voice:stop', () => { audio.stopSpeaking(); return true; });
  handle('voice:preview', async (voiceId) => {
    const used = await controller.previewVoice(typeof voiceId === 'string' ? voiceId : null);
    return { ok: true, used };
  });
  handle('speech:speak', async (text) => {
    if (!text) return false;
    audio.speak(text, { force: true });
    return true;
  });
  handle('mic:status', () => microphoneStatus());
  handle('mic:test', async (on) => {
    try {
      await audio.monitor(Boolean(on));
      return { ok: true, status: microphoneStatus() };
    } catch (err) {
      return { ok: false, status: microphoneStatus(), message: err.message };
    }
  });
  handle('wake:status', async () => ({ enabled: settings.get('wakeWord'), active: await controller.refreshWakeWord() }));
  handle('voice-mode:toggle', () => {
    controller.setVoiceMode(!controller.voiceMode);
    return controller.voiceMode;
  });
  handle('voice-mode:status', () => Boolean(controller.voiceMode));

  // tasks
  handle('task:run', (text, opts = {}) => controller.runTask(text, 'typed', opts));
  handle('task:stop', () => { controller.stopTask(); return true; });
  handle('conversation:reset', () => agent.reset());
  handle('select:start', () => controller.startPanelSelection());
  handle('region:clear', () => { controller.clearRegion(); return true; });

  // ChatGPT-Style Threads & Multi-Session Conversations
  handle('threads:list', (opts = {}) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().listThreads(opts);
  });
  handle('threads:get', (threadId) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().getThread(threadId);
  });
  handle('threads:create', (title = 'New Chat', device = 'desktop', projectId = null) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().createThread(title, device, projectId);
  });
  handle('threads:switch', (threadId) => {
    const { getThreadManager } = require('./threads');
    const tm = getThreadManager();
    tm.setActiveThread('desktop', threadId);
    return tm.getThread(threadId);
  });
  handle('threads:rename', (threadId, newTitle) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().renameThread(threadId, newTitle);
  });
  handle('threads:pin', (threadId, pinned) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().pinThread(threadId, pinned);
  });
  handle('threads:archive', (threadId) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().archiveThread(threadId, true);
  });
  handle('threads:unarchive', (threadId) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().unarchiveThread(threadId);
  });
  handle('threads:delete', (threadId) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().deleteThread(threadId);
  });
  handle('threads:archived', () => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().listArchivedThreads();
  });
  handle('threads:groups', (opts = {}) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().getTimelineGroups(opts);
  });

  // Projects & Folders
  handle('projects:list', () => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().listProjects();
  });
  handle('projects:create', (name, instructions, files) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().createProject(name, instructions, files);
  });
  handle('projects:update', (projectId, updates) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().updateProject(projectId, updates);
  });
  handle('projects:delete', (projectId) => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().deleteProject(projectId);
  });

  // Multimodal Generative Media & Analysis
  handle('media:generate-image', async (opts = {}) => {
    const { getGenerativeMediaEngine } = require('./multimodal/generator');
    return getGenerativeMediaEngine(settings).generateImage(opts);
  });
  handle('media:generate-video', async (opts = {}) => {
    const { getGenerativeMediaEngine } = require('./multimodal/generator');
    return getGenerativeMediaEngine(settings).generateVideo(opts);
  });
  handle('media:analyze-file', async (filePath) => {
    const { getMultimodalAnalyzer } = require('./multimodal/analyzer');
    return getMultimodalAnalyzer().analyzeFile(filePath);
  });
  handle('file:pick', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: opts.title || 'Attach Files or Media',
      buttonLabel: 'Attach',
      properties: ['openFile', ...(opts.multiple ? ['multiSelections'] : [])],
      filters: opts.filters || [
        { name: 'All Supported Formats', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'pdf', 'txt', 'csv', 'json', 'py', 'js', 'docx'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] },
        { name: 'Documents & Code', extensions: ['pdf', 'txt', 'md', 'csv', 'json', 'py', 'js', 'html', 'docx'] },
      ],
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) return [];
    const { getMultimodalAnalyzer } = require('./multimodal/analyzer');
    const analyzer = getMultimodalAnalyzer();
    const analyses = [];
    for (const fp of res.filePaths) {
      try {
        const item = await analyzer.analyzeFile(fp);
        analyses.push(item);
      } catch (err) {
        analyses.push({ ok: false, file: { path: fp, name: path.basename(fp) }, error: err.message });
      }
    }
    return analyses;
  });

  // diagnostics & self-healing
  handle('diagnostics:fix', (rec) => {
    const { getTroubleshooter } = require('./diagnostics/troubleshooter');
    return getTroubleshooter({ logger }).executeRecommendation(rec, controller);
  });
  handle('diagnostics:errors', () => {
    const { getTroubleshooter } = require('./diagnostics/troubleshooter');
    return getTroubleshooter({ logger }).getRecentErrors();
  });
  handle('diagnostics:clear', () => {
    const { getTroubleshooter } = require('./diagnostics/troubleshooter');
    return getTroubleshooter({ logger }).clearErrors();
  });

  // windows & app
  handle('app:open-settings', (section) => { windows.openSettings(section); return true; });
  handle('app:open-onboarding', () => { windows.openOnboarding(); return true; });
  handle('app:quit', () => app.quit());
  handle('app:open-logs', () => shell.openPath(logger.dir));
  handle('app:open-plugins', () => { pluginManager.ensureFolder(); return shell.openPath(plugins.userDir); });

  // plugins
  handle('plugins:list', () => pluginManager.list());
  handle('plugins:pick', async (event) => {
    const template = pluginManager.ensureFolder();
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Add a plugin', buttonLabel: 'Check Plugin', properties: ['openFile'],
      defaultPath: template, // opens beside the template, ready to copy and edit
      filters: [{ name: 'Bigfoot plugin', extensions: ['js'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return pluginManager.review(res.filePaths[0]);
  });
  handle('plugins:install', async (file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return { ok: false, report: { errors: ['Choose the plugin again.'] } };
    return pluginManager.install(file);
  });
  handle('plugins:remove', async (file) => {
    await pluginManager.remove(String(file), (p) => shell.trashItem(p));
    return pluginManager.list();
  });
  handle('app:open-link', (which) => { if (LINKS[which]) shell.openExternal(LINKS[which]); });

  // Governance & User Customization
  handle('governance:get-state', () => {
    const gov = getGovernanceManager();
    return {
      activeUserId: gov.activeUserId,
      activeUser: gov.getActiveUser(),
      users: gov.getUsers(),
      devices: gov.getDevices(),
      globalRules: gov.getGlobalRules(),
      perUserRules: gov.perUserRules,
      powerTiers: POWER_TIERS,
    };
  });
  handle('governance:set-active-user', (userId) => {
    const gov = getGovernanceManager();
    return gov.setActiveUser(userId);
  });
  handle('governance:save-customization', (userId, updates) => {
    const gov = getGovernanceManager();
    return gov.updateCustomization(userId, updates);
  });
  handle('governance:admin-verify-pin', (pin) => {
    const gov = getGovernanceManager();
    return { ok: gov.verifyAdmin(pin) };
  });
  handle('governance:admin-update-user', (userId, data, adminPin) => {
    const gov = getGovernanceManager();
    return gov.adminUpdateUser(userId, data, adminPin);
  });
  handle('governance:admin-create-user', (userData, adminPin) => {
    const gov = getGovernanceManager();
    return gov.adminCreateUser(userData, adminPin);
  });
  handle('governance:admin-delete-user', (userId, adminPin) => {
    const gov = getGovernanceManager();
    return gov.adminDeleteUser(userId, adminPin);
  });
  handle('governance:admin-update-rules', (rules, adminPin) => {
    const gov = getGovernanceManager();
    return gov.adminSetGlobalRules(rules, adminPin);
  });
  handle('governance:admin-set-device-power', (deviceId, deviceConfig, adminPin) => {
    const gov = getGovernanceManager();
    return gov.adminSetDevicePower(deviceId, deviceConfig, adminPin);
  });
  handle('governance:admin-change-pin', (oldPin, newPin) => {
    const gov = getGovernanceManager();
    return gov.setAdminPin(oldPin, newPin);
  });

  // Firebase Auth & Cloud Firestore Database
  handle('firebase:get-config', () => firebaseService.getConfig());
  handle('firebase:sign-up', (data) => firebaseService.signUp(data || {}));
  handle('firebase:sign-in', (data) => firebaseService.signIn(data || {}));
  handle('firebase:sign-in-anon', () => firebaseService.signInAnonymously());
  handle('firebase:sign-out', () => firebaseService.signOut());
  handle('firebase:get-user', () => firebaseService.getCurrentUser());
  handle('firebase:update-profile', (patch) => firebaseService.updateUserProfile(null, patch));
  handle('firebase:sync-device', (info) => firebaseService.syncDevice(null, info));
  handle('firebase:get-devices', () => firebaseService.getDevices(null));
  handle('firebase:save-preferences', (prefs) => firebaseService.savePreferences(null, prefs));
  handle('firebase:get-preferences', () => firebaseService.getPreferences(null));
  handle('firebase:password-reset', (email) => firebaseService.sendPasswordReset(email));
  // Multi-User, Local AI Server & OpenAI API Key Management
  handle('users:list', () => userManager.listUsers());
  handle('users:add', (data) => userManager.addUser(data || {}));
  handle('users:remove', (userId) => userManager.removeUser(userId));
  handle('users:update-role', ({ userId, role }) => userManager.updateUserRole(userId, role));
  handle('users:invite', (opts) => userManager.createInviteLink(opts || {}));
  handle('users:accept-invite', ({ token, data }) => userManager.acceptInvite(token, data));
  handle('users:apikeys', (userId) => userManager.listApiKeys(userId || 'user-owner-root'));
  handle('users:create-key', (opts) => userManager.createApiKey(opts || {}));
  handle('users:revoke-key', (key) => userManager.revokeApiKey(key));
  handle('host:info', () => userManager.getHostInfo());
  handle('host:update-settings', (patch) => userManager.updateHostSettings(patch || {}));

  handle('app:info', () => ({
    version: app.getVersion(), state: controller.state, running: agent.running,
    usage: { task: costs.task, session: costs.session }, plugins: plugins.list(),
  }));
  handle('onboarding:finish', (prefs) => { controller.finishOnboarding(prefs || {}); return true; });
  handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === windows.main) win.hide(); // Bigfoot keeps running in the tray
    else if (win) win.close();
  });
  handle('window:minimize', (event) => { const w = BrowserWindow.fromWebContents(event.sender); if (w) w.minimize(); });
  handle('panel:resize', (height) => windows.resizePanel(height));

  // Bigfoot Terminal
  handle('terminal:open', () => { windows.openTerminal(); return true; });

  // real terminals (./terminals): the Terminal page's tabs
  handle('term:shells', () => terminals.shells());
  handle('term:list', () => terminals.list());
  handle('term:create', (opts = {}) => terminals.create({ shell: String(opts.shell || 'powershell'), cols: Number(opts.cols) || 100, rows: Number(opts.rows) || 30 }));
  handle('term:replay', (id) => terminals.replay(id));
  handle('term:close', (id) => { terminals.close(id); return true; });
  handle('term:open-url', (url) => {
    if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
    return true;
  });
  ipcMain.on('term:input', (_e, msg) => { if (msg) terminals.write(msg.id, msg.data); });
  ipcMain.on('term:resize', (_e, msg) => { if (msg) terminals.resize(msg.id, msg.cols, msg.rows); });
  const toWindow = (channel) => (payload) => { if (windows.main && !windows.main.isDestroyed()) windows.send(windows.main, channel, payload); };
  terminals.on('data', toWindow('term:data'));
  terminals.on('exit', toWindow('term:exit'));
  terminals.on('list', toWindow('term:list'));
  handle('terminal:get', () => activity.entries);
  handle('terminal:clear', () => { activity.clear(); return true; });
  handle('terminal:reveal', () => shell.showItemInFolder(logger.activityLog));

  // fire-and-forget messages from renderers
  ipcMain.on('overlay:region', (event, rect) => controller.onRegionSelected(windows.displayIdOf(event.sender), rect));
  ipcMain.on('overlay:region-ask', (_e, text) => controller.askAboutRegion(typeof text === 'string' ? text.trim().slice(0, 4000) : ''));
  ipcMain.on('overlay:ready', (event) => {
    event.sender.send('state', controller.state);
    event.sender.send('settings', settings.publicView());
    event.sender.send('cursor', screen.getCursorScreenPoint());
  });
  ipcMain.on('panel:ready', () => {
    windows.send(windows.panel, 'state', controller.state);
    controller.sendUsage();
  });
}

module.exports = { registerIpc, LINKS };
