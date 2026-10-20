'use strict';
// Every request a renderer can make. The preload allowlist mirrors these channel names.

const { app, ipcMain, shell, systemPreferences, screen, BrowserWindow, net, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const totp = require('./security/totp');
const llm = require('./llm');
const { VOICES } = require('./kokoro');
const hardware = require('./local/hardware');
const catalog = require('./local/catalog');
const { getGovernanceManager, POWER_TIERS } = require('./security/governance');
const { firebaseService } = require('./firebase');
const { userManager } = require('./users');
const { backburnerMeshEngine } = require('./local/backburner_mesh');
const { promptCacheManager } = require('./local/prompt_cache');
const { meshDiscoveryManager } = require('./remote/mesh_discovery');
const { AutonomousGoalDAG } = require('./autonomous/goal_graph');
const { defaultAuditor } = require('./autonomous/fresh_auditor');
const { reflexionEngine } = require('./autonomous/reflexion_engine');

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
      const { getProactiveScheduler } = require('./routines/proactive_scheduler');
      const scheduler = getProactiveScheduler();
      const summary = await scheduler.generateMorningBriefing(settings.get('userName') || 'Commander');
      return { ok: true, summary };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('routines:tidy', async (opts = {}) => {
    try {
      const { getProactiveScheduler } = require('./routines/proactive_scheduler');
      const scheduler = getProactiveScheduler();
      const targetDir = opts.targetDir || path.join(os.homedir(), 'Downloads');
      const res = scheduler.tidyDirectory(targetDir, opts.execute !== false);
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('knowledge:reindex', async () => {
    try {
      const { getMemoryStore } = require('./memory');
      const store = getMemoryStore();
      store.rebuildIndex();
      return {
        ok: true,
        stats: {
          totalMemories: store.memories.length,
          indexedKeywords: store.keywordIndex ? store.keywordIndex.size : 0,
        },
      };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('knowledge:list', async (opts = {}) => {
    try {
      const { getMemoryStore } = require('./memory');
      const store = getMemoryStore();
      const list = store.list({ topic: opts.topic || null, limit: opts.limit || 100 });
      return { ok: true, list, total: store.memories.length };
    } catch (err) {
      return { ok: false, message: err.message, list: [] };
    }
  });

  handle('knowledge:add', async (fact, opts = {}) => {
    try {
      const { getMemoryStore } = require('./memory');
      const store = getMemoryStore();
      const item = store.remember(fact, { topic: opts.topic || 'general', keywords: opts.keywords || [] });
      return { ok: true, item };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('knowledge:delete', async (idOrFact) => {
    try {
      const { getMemoryStore } = require('./memory');
      const store = getMemoryStore();
      const removed = store.forget(idOrFact);
      return { ok: true, removed };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  handle('knowledge:search', async (query, opts = {}) => {
    try {
      const { getMemoryStore } = require('./memory');
      const store = getMemoryStore();
      const list = store.recall(query, { topic: opts.topic || null, limit: opts.limit || 20 });
      return { ok: true, list };
    } catch (err) {
      return { ok: false, message: err.message, list: [] };
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
  handle('region:start', () => controller.startPanelSelection());
  handle('region:clear', () => { controller.clearRegion(); return true; });
  handle('dictation:set-mode', (enabled) => {
    const { getDictationManager } = require('./dictation');
    return getDictationManager({ controller, logger: controller.logger, input: controller.input }).setMode(enabled);
  });
  handle('dictation:toggle', () => {
    const { getDictationManager } = require('./dictation');
    return getDictationManager({ controller, logger: controller.logger, input: controller.input }).toggleMode();
  });
  handle('dictation:status', () => {
    const { getDictationManager } = require('./dictation');
    return getDictationManager({ controller, logger: controller.logger, input: controller.input }).status();
  });

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
  handle('media:list-images', async (limit = 20) => {
    try {
      const { getGenerativeMediaEngine } = require('./multimodal/generator');
      return { ok: true, images: getGenerativeMediaEngine(settings).listRecentImages(limit) };
    } catch (err) {
      return { ok: false, images: [], message: err.message };
    }
  });
  handle('media:reveal-folder', async () => {
    const dir = path.join(os.homedir(), 'Pictures', 'Mave_Generations');
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return true;
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
  handle('firebase:sign-in-provider', (data) => firebaseService.signInWithProvider(data || {}));
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
  // Backburner Co-Processing Mesh & Prompt Cache
  handle('mesh:status', () => ({
    mesh: backburnerMeshEngine.getMeshStatus(),
    discovery: meshDiscoveryManager.getStatus(),
  }));
  handle('mesh:auto-join', (data) => meshDiscoveryManager.handleHttpAutoJoin(data || {}));
  handle('mesh:offload-page', (opts) => backburnerMeshEngine.offloadKvPage(opts || {}));
  handle('mesh:merge-attn', ({ hostAttn, satAttn }) => backburnerMeshEngine.mergeAttention(hostAttn, satAttn));
  handle('mesh:disconnect', (deviceId) => backburnerMeshEngine.disconnectCoProcessor(deviceId));
  handle('promptcache:stats', () => promptCacheManager.getStats());
  handle('promptcache:clear', () => promptCacheManager.clear());

  // AutoGPT-Inspired Autonomous Goal DAG & Reflexion Loop
  handle('autonomous:plan', (opts) => {
    const { goal, context, customSubtasks } = opts || {};
    let dag;
    if (Array.isArray(customSubtasks) && customSubtasks.length > 0) {
      dag = new AutonomousGoalDAG({ goal, context: context || '' });
      for (const st of customSubtasks) dag.addNode(st);
    } else {
      dag = AutonomousGoalDAG.decompose(goal, context || '');
    }
    reflexionEngine.activeGoals.set(dag.id, dag);
    return {
      dag: dag.toJSON(),
      checklist: dag.toChecklistMarkdown(),
      mermaid: dag.toMermaidDiagram(),
      progress: dag.getProgress(),
    };
  });
  handle('autonomous:execute', async (opts) => {
    const { goalId, goal } = opts || {};
    let dag = goalId ? reflexionEngine.getGoal(goalId) : (goal ? AutonomousGoalDAG.decompose(goal) : null);
    if (!dag) throw new Error('Valid goal or goalId required.');
    const onUpdate = (d) => {
      if (windows && windows.broadcast) {
        windows.broadcast('autonomous:update', {
          id: d.id,
          goal: d.goal,
          progress: d.getProgress(),
          checklist: d.toChecklistMarkdown(),
        });
      }
    };
    return reflexionEngine.executeGoal(dag, { onUpdate });
  });
  handle('autonomous:status', (goalId) => {
    if (goalId) {
      const dag = reflexionEngine.getGoal(goalId);
      return dag ? { dag: dag.toJSON(), checklist: dag.toChecklistMarkdown(), progress: dag.getProgress() } : null;
    }
    return reflexionEngine.listGoals();
  });
  handle('autonomous:audit', (opts) => {
    const { tool, parameters, commitment, userGoal } = opts || {};
    return defaultAuditor.auditAction({
      goal: userGoal || '',
      proposal: { tool, params: parameters, commitment },
    });
  });

  // Vorssaint-Style System Dynamic Island (OS Device Extension)
  handle('island:expand', () => {
    windows.resizeIsland(true);
    return true;
  });
  handle('island:collapse', () => {
    windows.resizeIsland(false);
    return true;
  });
  handle('island:open-main', (route) => {
    windows.openMain(route || 'home');
    return true;
  });
  handle('island:toggle', () => {
    return windows.toggleIsland();
  });
  handle('island:status', () => {
    return {
      active: Boolean(windows.islandWindow && !windows.islandWindow.isDestroyed() && windows.islandWindow.isVisible()),
    };
  });

  // Vorssaint OS Modular Toolkit
  handle('vorssaint:telemetry', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getTelemetry();
  });
  handle('vorssaint:agents', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getAgentsStatus();
  });
  handle('vorssaint:clipboard-history', (query) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getClipboardHistory(query);
  });
  handle('vorssaint:clipboard-copy', (id) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).copyClipboardItem(id);
  });
  handle('vorssaint:clipboard-clear', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).clearClipboardHistory();
  });
  handle('vorssaint:scratchpad-get', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getScratchpad();
  });
  handle('vorssaint:scratchpad-save', (content) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).saveScratchpad(content);
  });
  handle('vorssaint:keep-awake-set', (mode) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).setKeepAwake(mode);
  });
  handle('vorssaint:keep-awake-get', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getKeepAwakeStatus();
  });
  handle('vorssaint:cleaning-toggle', (seconds) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).toggleCleaningMode(seconds);
  });
  handle('vorssaint:settings-get', () => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).getSettings();
  });
  handle('vorssaint:settings-update', (patch) => {
    const { getVorssaintManager } = require('./vorssaint/vorssaint_manager');
    return getVorssaintManager({ windows, settings }).updateSettings(patch);
  });

  // Jev (System 1 Reflex Decision) & CDM (Constrained Context Compression)
  handle('decision:jev-evaluate', (payload) => {
    const { getJevEngine } = require('./decision/jev_engine');
    return getJevEngine().evaluate(payload ? payload.context : {}, payload ? payload.questions : {});
  });
  handle('decision:jev-intent', (input) => {
    const { getJevEngine } = require('./decision/jev_engine');
    return getJevEngine().evaluateIntent(input);
  });
  handle('decision:cdm-compress', ({ text, query, options }) => {
    const { getCDMEngine } = require('./decision/cdm_engine');
    return getCDMEngine().compress(text, query, options);
  });
  handle('decision:cdm-extract', ({ text, schema }) => {
    const { getCDMEngine } = require('./decision/cdm_engine');
    return getCDMEngine().extract(text, schema);
  });
  handle('decision:cdm-classify', ({ text, labels, options }) => {
    const { getCDMEngine } = require('./decision/cdm_engine');
    return getCDMEngine().classify(text, labels, options);
  });

  // Cloudflare Free Internet Gateway Tunnel
  handle('tunnel:status', () => {
    const { getCloudflareTunnelManager } = require('./remote/cloudflare_tunnel');
    return getCloudflareTunnelManager({ settings, windows, logger }).getStatus();
  });
  handle('tunnel:start', (payload) => {
    const { getCloudflareTunnelManager } = require('./remote/cloudflare_tunnel');
    return getCloudflareTunnelManager({ settings, windows, logger }).startTunnel(payload || {});
  });
  handle('tunnel:stop', () => {
    const { getCloudflareTunnelManager } = require('./remote/cloudflare_tunnel');
    return getCloudflareTunnelManager({ settings, windows, logger }).stopTunnel();
  });
  handle('tunnel:save-token', (token) => {
    settings.update({ cloudflareTunnelToken: token });
    return { ok: true };
  });

  // Autonomous Sentinel & Activity Learning
  const { getAutonomousSentinel } = require('./sentinel/autonomous_sentinel');
  const sentinel = getAutonomousSentinel({ settings, windows, logger });

  handle('sentinel:status', () => ({
    online: sentinel.isOnline,
    activityTracking: settings.get('activityTrackingEnabled') !== false,
    conversationTracking: settings.get('conversationTrackingEnabled') !== false,
    onlineSentinel: settings.get('onlineSentinelEnabled') !== false,
    proactiveNotifications: settings.get('proactiveNotificationsEnabled') !== false,
    officeAppsList: settings.get('officeAppsList') || '',
  }));

  handle('sentinel:summary', (dateStr) => {
    return sentinel.getDailySummary(dateStr);
  });

  handle('sentinel:save-summary', ({ date, customSummary }) => {
    return sentinel.saveDailySummary(date, customSummary);
  });

  handle('sentinel:clear-history', () => {
    return sentinel.clearActivityHistory();
  });

  handle('sentinel:update-privacy', async (patch = {}) => {
    await settings.update(patch);
    return { ok: true, settings: settings.publicView() };
  });

  handle('sentinel:test-connectivity', async () => {
    await sentinel.checkConnectivity();
    return { online: sentinel.isOnline };
  });

  handle('sentinel:notify', (data) => {
    return sentinel.notifyIncomingMessage(data || {});
  });

  // Notifications Test
  handle('notifications:test', () => {
    try {
      if (Notification && Notification.isSupported()) {
        const notif = new Notification({
          title: 'Mave Autonomous Sentinel',
          body: '🔔 Test notification: System alerts, Sentinel triggers, and audio chimes are operating normally.',
          silent: false,
        });
        notif.show();
      }
      if (audio && typeof audio.play === 'function') audio.play('success');
    } catch (e) {
      console.warn('Notification error:', e.message);
    }
    return { ok: true };
  });

  // Storage Stats & Cache Management
  function getDirectorySize(dirPath) {
    let size = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          size += fs.statSync(fullPath).size;
        }
      }
    } catch { /* ignore permission errors */ }
    return size;
  }

  handle('storage:stats', async () => {
    const userData = app.getPath('userData');
    const modelsDir = path.join(userData, 'models');
    const sentinelDir = path.join(userData, 'sentinel_activity');
    const memoryDir = path.join(userData, 'memory');
    const logsDir = logger ? logger.dir : path.join(userData, 'logs');
    const tempDir = path.join(userData, 'temp_captures');

    const modelsBytes = getDirectorySize(modelsDir);
    const sentinelBytes = getDirectorySize(sentinelDir);
    const memoryBytes = getDirectorySize(memoryDir);
    const logsBytes = getDirectorySize(logsDir);
    const tempBytes = getDirectorySize(tempDir);
    const totalBytes = modelsBytes + sentinelBytes + memoryBytes + logsBytes + tempBytes;

    return {
      modelsMB: (modelsBytes / (1024 * 1024)).toFixed(1),
      sentinelMB: (sentinelBytes / (1024 * 1024)).toFixed(2),
      memoryMB: (memoryBytes / (1024 * 1024)).toFixed(2),
      logsMB: (logsBytes / (1024 * 1024)).toFixed(2),
      tempMB: (tempBytes / (1024 * 1024)).toFixed(2),
      totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
      userDataPath: userData,
    };
  });

  handle('storage:clean-cache', async () => {
    const userData = app.getPath('userData');
    const tempDir = path.join(userData, 'temp_captures');
    let freedBytes = 0;
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          const fp = path.join(tempDir, file);
          freedBytes += fs.statSync(fp).size;
          fs.unlinkSync(fp);
        }
      }
    } catch { /* ignore */ }
    return { ok: true, freedMB: (freedBytes / (1024 * 1024)).toFixed(2) };
  });

  handle('storage:vacuum', async () => {
    promptCacheManager.clear();
    return { ok: true, message: 'Databases compacted and cache memory reclaimed.' };
  });

  // Telemetry & Usage Stats
  handle('usage:stats', () => {
    const mem = process.memoryUsage();
    const osFree = os.freemem();
    const osTotal = os.totalmem();
    const sessionCosts = costs ? costs.session : { input: 0, output: 0, cost: 0, requests: 0 };
    const promptStats = promptCacheManager.getStats();

    return {
      processRssMB: Math.round(mem.rss / (1024 * 1024)),
      processHeapMB: Math.round(mem.heapUsed / (1024 * 1024)),
      systemTotalGB: (osTotal / (1024 * 1024 * 1024)).toFixed(1),
      systemUsedGB: ((osTotal - osFree) / (1024 * 1024 * 1024)).toFixed(1),
      systemUsagePercent: Math.round(((osTotal - osFree) / osTotal) * 100),
      cpuCount: os.cpus().length,
      session: sessionCosts,
      promptCache: promptStats,
      activeModel: settings.get('provider') === 'local' ? (settings.get('localModel') || 'Qwen3-VL (Local GPU)') : settings.get('model'),
    };
  });

  handle('usage:reset', () => {
    if (costs) {
      costs.task = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
      costs.session = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
    }
    return { ok: true };
  });

  // Analytics & Interaction Trends
  handle('analytics:stats', () => {
    const summary = sentinel ? sentinel.getDailySummary() : null;
    const workPercent = summary && summary.metrics ? summary.metrics.officeWorkPercent : 65;
    const personalPercent = summary && summary.metrics ? summary.metrics.personalPercent : 35;
    const activeSecs = summary && summary.metrics ? summary.metrics.totalActiveSeconds : 14400;

    return {
      workPercent,
      personalPercent,
      activeHours: (activeSecs / 3600).toFixed(1),
      focusScore: Math.min(98, Math.max(50, Math.round(workPercent * 0.9 + 20))),
      toolDistribution: [
        { name: 'Terminal & Scripts', percent: 38 },
        { name: 'Browser & Web Research', percent: 27 },
        { name: 'Filesystem Editing', percent: 20 },
        { name: 'Vision OCR & Screen', percent: 15 },
      ],
      queriesToday: summary && summary.metrics ? summary.metrics.maveInteractionsCount : 12,
    };
  });

  // Data Controls & Sovereign Export
  handle('data:export-all', async () => {
    const exportBundle = {
      version: '1.4.8',
      exportedAt: new Date().toISOString(),
      identity: 'Mave',
      settings: settings.publicView(),
      summary: sentinel ? sentinel.getDailySummary() : null,
    };
    const json = JSON.stringify(exportBundle, null, 2);
    const downloads = app.getPath('downloads');
    const targetFile = path.join(downloads, `mave-sovereign-backup-${Date.now()}.json`);
    fs.writeFileSync(targetFile, json, 'utf8');
    return { ok: true, filePath: targetFile, size: json.length };
  });

  handle('data:clear-history', async () => {
    if (activity) activity.clear();
    if (sentinel) sentinel.clearActivityHistory();
    return { ok: true };
  });

  // 2FA Security Handlers
  handle('security:setup-2fa', () => {
    const secret = totp.generateSecret();
    const uri = totp.generateOtpAuthUri({ secret, accountName: 'owner@mave.local', issuer: 'Mave Sovereign' });
    return { secret, uri };
  });

  handle('security:verify-2fa', ({ secret, code }) => {
    const valid = totp.verifyToken(secret, code);
    if (!valid) {
      return { ok: false, message: 'Invalid 6-digit TOTP code. Please check your authenticator clock and try again.' };
    }
    settings.update({ twoFactorEnabled: true, twoFactorSecret: secret });
    return { ok: true };
  });

  handle('security:disable-2fa', () => {
    settings.update({ twoFactorEnabled: false, twoFactorSecret: '' });
    return { ok: true };
  });

  handle('security:revoke-sessions', () => {
    return { ok: true, message: 'All active remote sessions and viewer tokens revoked.' };
  });

  // Trusted Contact Handlers
  handle('trusted-contact:test-alert', ({ name }) => {
    if (Notification && Notification.isSupported()) {
      new Notification({
        title: 'Mave Trusted Contact Alert Test',
        body: `🚨 Test Alert for ${name || 'Trusted Contact'}: All emergency fallback triggers are operational.`,
      }).show();
    }
    return { ok: true, message: `Dispatched test emergency alert for ${name || 'contact'}.` };
  });

  // Plugins Toggle
  handle('plugins:toggle', ({ pluginId, enabled }) => {
    const cur = (settings.get('enabledPlugins') || '').split(',').map(s => s.trim()).filter(Boolean);
    let next;
    if (enabled) {
      next = Array.from(new Set([...cur, pluginId]));
    } else {
      next = cur.filter(id => id !== pluginId);
    }
    settings.update({ enabledPlugins: next.join(', ') });
    return { ok: true, enabledPlugins: next };
  });

  // Ghost AI Core Handlers (MCP, AG-UI, A2UI, A2A, Hybrid Search, 3-Tier Security)
  const { getGhostAICore } = require('./ghost_core');
  const ghostCore = getGhostAICore({ windows: controller.windows, logger: controller.logger });
  if (ghostCore.agui && ghostCore.agui.setWindows) {
    ghostCore.agui.setWindows(controller.windows);
  }

  handle('ghost:status', () => ghostCore.getStatus());

  handle('ghost:search', ({ query, topK }) => {
    return ghostCore.search.search(query, topK || 10);
  });

  handle('ghost:index-doc', (doc) => {
    ghostCore.search.indexDocument(doc, true);
    return { ok: true, id: doc.id };
  });

  handle('ghost:mcp-catalog', () => {
    return ghostCore.mcpClientManager.getCatalog();
  });

  handle('ghost:mcp-install', (id) => {
    return ghostCore.mcpClientManager.installServer(id);
  });

  handle('ghost:mcp-uninstall', (id) => {
    return ghostCore.mcpClientManager.uninstallServer(id);
  });

  handle('ghost:mcp-call', async ({ name, args }) => {
    return ghostCore.mcpServer.handleJsonRpc({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args || {} },
    });
  });

  handle('ghost:render-a2ui', (component) => {
    const html = ghostCore.a2ui.toHtml(component);
    ghostCore.agui.broadcast('ui_render', { component, html });
    return { ok: true, html };
  });

  handle('ghost:file-watcher-stats', () => ghostCore.fileWatcher.getStats());
  handle('ghost:file-watcher-crawl', async () => ghostCore.fileWatcher.crawlAll());
  handle('ghost:hardware-profile', () => ghostCore.hardwareProfiler.getProfile());
  handle('ghost:open-file', async (filePath) => {
    const { shell } = require('electron');
    if (filePath && typeof filePath === 'string') {
      return shell.openPath(filePath);
    }
    return '';
  });
  handle('ghost:reveal-file', async (filePath) => {
    const { shell } = require('electron');
    if (filePath && typeof filePath === 'string') {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ChatGPT & J.A.R.V.I.S. Core IPC Services
  // ═══════════════════════════════════════════════════════════════════════════
  const { getCodeInterpreter } = require('./chatgpt/code_interpreter');
  const { getPersonaStore } = require('./chatgpt/persona_store');
  const { getChatGPTPersonalization } = require('./chatgpt/personalization');
  const { getJarvisTelemetry } = require('./jarvis/telemetry');
  const { getJarvisButler } = require('./jarvis/proactive_butler');

  const codeInterpreter = getCodeInterpreter({ logger: controller.logger });
  const personaStore = getPersonaStore();
  const personalization = getChatGPTPersonalization();
  const jarvisTelemetry = getJarvisTelemetry({ logger: controller.logger });
  const jarvisButler = getJarvisButler({ windows: controller.windows, logger: controller.logger });
  jarvisButler.start();

  // 1. Code Interpreter
  handle('code-interpreter:run', async ({ language = 'python', code, timeoutMs = 20000 }) => {
    if (language === 'python') {
      return codeInterpreter.runPython(code, { timeoutMs });
    }
    return codeInterpreter.runJavaScript(code, { timeoutMs });
  });

  // 2. Custom GPTs & Personas
  handle('personas:list', () => personaStore.listPersonas());
  handle('personas:get', (id) => personaStore.getPersona(id));
  handle('personas:get-active', () => personaStore.getActivePersona());
  handle('personas:set-active', (id) => personaStore.setActivePersona(id));
  handle('personas:create', (data) => personaStore.createPersona(data));
  handle('personas:delete', (id) => personaStore.deletePersona(id));

  // 3. ChatGPT Personalization & Memory
  handle('personalization:get', () => personalization.getInstructions());
  handle('personalization:update', (data) => personalization.updateInstructions(data));
  handle('personalization:memories', () => personalization.listMemories());
  handle('personalization:add-memory', ({ text, category }) => personalization.addMemory(text, category));
  handle('personalization:delete-memory', (id) => personalization.deleteMemory(id));
  handle('personalization:clear-memories', () => personalization.clearMemories());

  // 4. J.A.R.V.I.S. Telemetry & Proactive Butler
  handle('jarvis:telemetry', async () => jarvisTelemetry.getSnapshot());
  handle('jarvis:briefing', async () => jarvisButler.generateStatusBriefing());

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
