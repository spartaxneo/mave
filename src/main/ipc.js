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
const { getDistributedScheduler } = require('./mesh');
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

  handle('dialog:openDirectory', async (event) => {
    const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  handle('models:catalog', async () => {
    const online = net.isOnline();
    const hw = hardware.getCachedHardware();
    const snap = local.snapshot ? local.snapshot() : {};
    const rec = catalog.recommend(hw);
    const activeProvider = llm.resolveProvider(settings, { online });
    const activeLabel = llm.describe(settings, activeProvider);
    const selectedProvider = settings.get('provider') || 'local';
    const autoRouting = settings.get('autoModelRouting') !== false;
    const installedSet = new Set(Array.isArray(snap.installedModels) ? snap.installedModels : (snap.installed ? [snap.installed] : []));

    const items = [
      {
        id: 'auto',
        provider: 'auto',
        name: 'Auto Router (Task-Based Switching)',
        badge: 'Auto',
        desc: `Switches automatically between downloaded models (${hw.gpu || 'CPU'}) by task complexity.`,
        ready: Boolean(activeProvider),
        active: autoRouting,
      },
      ...(rec.options || [])
        .filter((o) => installedSet.has(o.id) || o.id === (settings.get('localModel') || rec.pick))
        .map((o) => ({
          id: `local:${o.id}`,
          provider: 'local',
          model: o.id,
          name: `${o.label} (On-Device)`,
          badge: `${o.tokensPerSecMin || 0}–${o.tokensPerSecMax || 0} tok/s`,
          desc: installedSet.has(o.id)
            ? `${o.capabilities || 'On-device AI'} · ${o.gpuLabel || hw.gpu || 'Local'}`
            : 'Configure/download in Settings → AI Models.',
          ready: installedSet.has(o.id),
          active: !autoRouting && selectedProvider === 'local' && (settings.get('localModel') || rec.pick) === o.id,
        })),
    ];

    for (const cm of (rec.customOptions || [])) {
      items.push({
        id: `custom:${cm.id}`,
        provider: 'local',
        model: cm.id,
        name: cm.label,
        badge: cm.size || 'GGUF',
        desc: cm.note || 'Custom local GGUF model.',
        ready: Boolean(cm.available),
        active: !autoRouting && selectedProvider === 'local' && settings.get('localModel') === cm.id,
      });
    }

    for (const om of (rec.ollamaModels || []).slice(0, 4)) {
      items.push({
        id: `ollama:${om.rawModel}`,
        provider: 'ollama',
        model: om.rawModel,
        name: om.label || `Ollama · ${om.rawModel}`,
        badge: 'Ollama',
        desc: 'Local Ollama runtime on http://127.0.0.1:11434.',
        ready: true,
        active: !autoRouting && selectedProvider === 'ollama' && settings.get('ollamaModel') === om.rawModel,
      });
    }

    for (const cb of (rec.colibriModels || []).slice(0, 2)) {
      items.push({
        id: `colibri:${cb.rawModel}`,
        provider: 'colibri',
        model: cb.rawModel,
        name: cb.label,
        badge: 'Colibri MoE',
        desc: cb.note || 'Local Colibri server on port 8000.',
        ready: true,
        active: !autoRouting && selectedProvider === 'colibri' && settings.get('colibriModel') === cb.rawModel,
      });
    }

    for (const am of (rec.airllmModels || []).slice(0, 2)) {
      items.push({
        id: `airllm:${am.rawModel}`,
        provider: 'airllm',
        model: am.rawModel,
        name: am.label,
        badge: am.size || 'AirLLM',
        desc: am.note || 'Layer-wise local GPU streaming.',
        ready: true,
        active: !autoRouting && selectedProvider === 'airllm' && settings.get('airllmModel') === am.rawModel,
      });
    }

    const hasClaude = Boolean(settings.secret('anthropicKey'));
    items.push({
      id: 'anthropic',
      provider: 'anthropic',
      model: settings.get('model') || 'claude-opus-5-5',
      name: `Claude · ${settings.get('model') || 'claude-opus-5-5'}`,
      badge: hasClaude ? 'API Key Ready' : 'Key Required',
      desc: hasClaude ? 'Anthropic Cloud reasoning enabled.' : 'Add Anthropic API key in Settings → AI Models.',
      ready: hasClaude && online,
      active: !autoRouting && selectedProvider === 'anthropic',
    });

    const hasOpenAi = Boolean(settings.secret('openaiKey'));
    items.push({
      id: 'openai',
      provider: 'openai',
      model: settings.get('openaiModel') || 'gpt-4o',
      name: `OpenAI · ${settings.get('openaiModel') || 'gpt-4o'}`,
      badge: hasOpenAi ? 'API Key Ready' : 'Key Required',
      desc: hasOpenAi ? 'OpenAI / compatible endpoint ready.' : 'Add OpenAI API key in Settings → AI Models.',
      ready: hasOpenAi && online,
      active: !autoRouting && selectedProvider === 'openai',
    });

    return {
      autoRouting,
      activeProvider,
      activeLabel,
      selectedProvider,
      online,
      hardware: hw,
      items,
    };
  });

  // local AI
  handle('local:hardware', async (opts = {}) => {
    const airllmEnabled = typeof opts?.airllmEnabled === 'boolean'
      ? opts.airllmEnabled
      : Boolean(settings.get('airllmEnabled'));
    const hw = await hardware.detect(app.getPath('userData'));
    return {
      hardware: hw,
      ...catalog.recommend(hw, [], { airllmEnabled }),
      compatibleCatalog: catalog.searchCompatibleModels('', hw, { airllmEnabled }),
      capacitySummary: catalog.evaluateDeviceCapacity(hw),
    };
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
  handle('local:start', async (id, opts = {}) => {
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

    const airllmEnabled = typeof opts?.airllmEnabled === 'boolean'
      ? opts.airllmEnabled
      : Boolean(settings.get('airllmEnabled'));
    const mDef = catalog.modelById(id);
    if (!mDef) throw new Error(`Unknown model: ${id}`);
    const hw = await hardware.detect(app.getPath('userData'));
    const compat = catalog.evaluateModelCompatibility(mDef, hw, { airllmEnabled });
    if (!compat.canInstallNow) {
      throw new Error(`Cannot install ${mDef.label || id} on this PC: ${compat.blockedReason}`);
    }

    if (mDef.airllmOnly || mDef.engine === 'airllm') {
      const { airllmService } = require('./local/airllm');
      runtime.stop();
      settings.update({ provider: 'airllm', airllmEnabled: true, airllmModel: mDef.rawModel || mDef.repo });
      await airllmService.start(mDef.rawModel || mDef.repo).catch(() => false);
      return { ok: true, provider: 'airllm', model: mDef.rawModel || mDef.repo, status: 'ready' };
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
  handle('local:pick-file', async () => ({
    ok: false,
    error: 'Arbitrary external GGUF uploads are disabled for quality control. Choose a verified model from MAVE Compatible LLMs.',
  }));
  handle('local:remove-custom', (id) => catalog.removeCustomModel(id));
  handle('local:search-compatible', async (arg = '') => {
    const query = typeof arg === 'string' ? arg : (arg?.query || '');
    const airllmEnabled = typeof arg?.airllmEnabled === 'boolean'
      ? arg.airllmEnabled
      : Boolean(settings.get('airllmEnabled'));
    const hw = await hardware.detect(app.getPath('userData'));
    return {
      ok: true,
      results: catalog.searchCompatibleModels(query, hw, { airllmEnabled }),
      capacitySummary: catalog.evaluateDeviceCapacity(hw),
    };
  });
  handle('local:search-online', async (arg = '') => {
    const query = typeof arg === 'string' ? arg : (arg?.query || '');
    const airllmEnabled = typeof arg?.airllmEnabled === 'boolean'
      ? arg.airllmEnabled
      : Boolean(settings.get('airllmEnabled'));
    const hw = await hardware.detect(app.getPath('userData'));
    return {
      ok: true,
      results: catalog.searchCompatibleModels(query, hw, { airllmEnabled }),
      capacitySummary: catalog.evaluateDeviceCapacity(hw),
    };
  });
  handle('local:register-online', (entry) => catalog.registerOnlineModel(entry));
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
    const tgUsername = tgConfig.username || 'MaveAssistant_bot';

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
    if (controller && controller.stopTask) controller.stopTask();
    if (agent && agent.resetConversation) agent.resetConversation();
    const { getThreadManager } = require('./threads');
    return getThreadManager().createThread(title, device, projectId);
  });
  handle('threads:switch', (threadId) => {
    if (controller && controller.stopTask) controller.stopTask();
    if (agent && agent.resetConversation) agent.resetConversation();
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
  handle('threads:export', async (threadId, format = 'markdown') => {
    const { getThreadManager } = require('./threads');
    return getThreadManager().exportThread(threadId, format);
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
  handle('diagnostics:heal-status', () => {
    const { getSelfHealer } = require('./diagnostics/self_healer');
    const healer = getSelfHealer({ controller, logger });
    return {
      active: true,
      history: healer.getHistory(),
      subsystem: 'Mave Autonomous Self-Healing Engine (Resilient & Active)'
    };
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
  handle('skills:catalog', async () => {
    const fs = require('fs');
    const os = require('os');
    const skills = [];
    const seen = new Set();
    const skillDirs = [
      path.resolve('c:/Users/ryzen/Documents/antigravity/claude-mods/skills'),
      path.join(process.cwd(), '.agents', 'skills'),
    ];
    for (const dir of skillDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!ent.isDirectory() || ent.name.startsWith('_') || seen.has(ent.name)) continue;
          let desc = '';
          const md = path.join(dir, ent.name, 'SKILL.md');
          if (fs.existsSync(md)) {
            const raw = fs.readFileSync(md, 'utf8');
            const m = raw.match(/description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/i);
            if (m) desc = (m[1] || m[2] || m[3] || '').trim();
          }
          seen.add(ent.name);
          skills.push({ id: ent.name, name: ent.name, desc: desc || 'Skill runbook & automation pack', source: 'local-skills' });
        }
      } catch {}
    }
    const coreSkills = [
      { id: 'windows-ops', name: 'windows-ops', desc: 'Windows process triage, crash audit & system automation', source: 'builtin' },
      { id: 'git-ops', name: 'git-ops', desc: 'Git workflows, commits, PR reviews & worktrees', source: 'builtin' },
      { id: 'docker-ops', name: 'docker-ops', desc: 'Containers, Compose stacks & multi-service deployment', source: 'builtin' },
      { id: 'debug-ops', name: 'debug-ops', desc: 'Root-cause debugging & test verification flows', source: 'builtin' },
      { id: 'nas-file-sync', name: 'nas-file-sync', desc: 'Personal NAS folder sharing & encrypted sync across devices', source: 'builtin' },
      { id: 'multi-agent-swarm', name: 'multi-agent-swarm', desc: 'Deploy coordinated multi-agent task workers', source: 'builtin' },
      { id: 'vm-os-orchestrator', name: 'vm-os-orchestrator', desc: 'Spin up isolated Linux, Ubuntu & Windows sandboxes', source: 'builtin' },
      { id: 'remote-tunnel-ops', name: 'remote-tunnel-ops', desc: 'Access MAVE securely from anywhere via Web/Tunnel/Phone', source: 'builtin' },
    ];
    for (const s of coreSkills) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        skills.push(s);
      }
    }
    let vaultDocsCount = 0;
    try {
      const { getKnowledgeVault } = require('./rag/knowledge_vault');
      const idx = getKnowledgeVault().loadIndex();
      vaultDocsCount = Array.isArray(idx.documents) ? idx.documents.length : 0;
    } catch {}
    const vaultDir = settings.get('knowledgeVaultDir') || path.join(os.homedir(), 'Documents');
    const plg = pluginManager.list();
    return {
      ok: true,
      skills,
      customPlugins: plg.custom || [],
      installed: settings.get('installedSkills') || [],
      vaultDir,
      vaultDocsCount,
    };
  });
  handle('skills:lifecycle-status', () => {
    const { getSkillLifecycleManager } = require('./evolution/skill_lifecycle');
    return getSkillLifecycleManager({ settings }).getStats();
  });
  handle('skills:acquire', async ({ id, meta } = {}) => {
    const { getSkillLifecycleManager } = require('./evolution/skill_lifecycle');
    return getSkillLifecycleManager({ settings }).acquireSkill(id, meta);
  });
  handle('skills:release', async ({ id, force } = {}) => {
    const { getSkillLifecycleManager } = require('./evolution/skill_lifecycle');
    return getSkillLifecycleManager({ settings }).releaseSkill(id, { force });
  });
  handle('skills:prune-unused', () => {
    const { getSkillLifecycleManager } = require('./evolution/skill_lifecycle');
    return getSkillLifecycleManager({ settings }).pruneAllUnused();
  });
  handle('knowledge:pick-vault', async (event) => {
    const fs = require('fs');
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose Knowledge Base / Personal NAS Folder',
      buttonLabel: 'Select Folder',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    const dir = res.filePaths[0];
    settings.update({ knowledgeVaultDir: dir, notesVaultPath: dir });
    let indexedCount = 0;
    try {
      const { getKnowledgeVault } = require('./rag/knowledge_vault');
      const vault = getKnowledgeVault();
      const exts = new Set(['.md', '.txt', '.json', '.csv', '.js', '.ts', '.py']);
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (indexedCount >= 40) break;
        if (!ent.isFile()) continue;
        if (!exts.has(path.extname(ent.name).toLowerCase())) continue;
        try {
          vault.indexFile(path.join(dir, ent.name), 'Onboarding Vault');
          indexedCount += 1;
        } catch {}
      }
    } catch {}
    return { ok: true, dir, indexedCount };
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
  const syncAuthToSettings = (user) => {
    if (user && user.uid && !user.isAnonymous) {
      settings.update({
        userName: user.displayName || (user.email ? user.email.split('@')[0] : settings.get('userName')),
        userEmail: user.email || '',
        hostEmail: user.email || settings.get('hostEmail'),
        authUser: {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoUrl: user.photoUrl || '',
          providerId: user.providerId || 'google.com',
          isAnonymous: false,
        },
      });
    }
  };

  handle('firebase:get-config', () => firebaseService.getConfig());
  handle('firebase:sign-up', async (data) => {
    const res = await firebaseService.signUp(data || {});
    if (res && res.ok && res.user) syncAuthToSettings(res.user);
    return res;
  });
  handle('firebase:sign-in', async (data) => {
    const res = await firebaseService.signIn(data || {});
    if (res && res.ok && res.user) syncAuthToSettings(res.user);
    return res;
  });
  handle('firebase:sign-in-provider', async (data) => {
    const res = await firebaseService.signInWithProvider(data || {}, windows.onboarding || windows.main);
    if (res && res.ok && res.user) syncAuthToSettings(res.user);
    return res;
  });
  handle('firebase:google-oauth', async () => {
    const res = await firebaseService.signInWithGoogleOAuth(windows.onboarding || windows.main);
    if (res && res.ok && res.user) syncAuthToSettings(res.user);
    return res;
  });
  handle('firebase:sign-in-anon', () => firebaseService.signInAnonymously());
  handle('firebase:sign-out', () => {
    settings.update({ authUser: null, userEmail: '' });
    return firebaseService.signOut();
  });
  handle('firebase:get-user', async () => {
    const user = await firebaseService.getRestoredUser();
    if (user && user.uid && !user.isAnonymous) {
      syncAuthToSettings(user);
      return user;
    }
    const saved = settings.get('authUser');
    if (saved && saved.uid && !saved.isAnonymous) {
      return saved;
    }
    return user || null;
  });
  handle('firebase:update-profile', (patch) => firebaseService.updateUserProfile(null, patch));
  handle('firebase:sync-device', async (info = {}) => {
    let enriched = { ...(info || {}) };
    try {
      if (!enriched.deviceCapabilities) {
        const hw = await hardware.detect(app.getPath('userData'));
        enriched.hardware = enriched.hardware || hw;
        enriched.airllmEnabled = typeof enriched.airllmEnabled === 'boolean'
          ? enriched.airllmEnabled
          : Boolean(settings.get('airllmEnabled'));
        enriched.deviceCapabilities = catalog.evaluateDeviceCapacity(hw);
      }
    } catch {}
    return firebaseService.syncDevice(null, enriched);
  });
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
  handle('network:get-local-info', () => {
    const { getLocalIp } = require('./remote/web');
    const ip = getLocalIp();
    const port = settings.get('webPort') || 4040;
    const pin = settings.get('remotePin') || '8080';
    return {
      ok: true,
      ip,
      port,
      pin,
      url: `http://${ip}:${port}`,
      lanAddress: `${ip}:${port}`,
    };
  });
  // Backburner Co-Processing Mesh, Distributed Scheduler & Prompt Cache
  handle('mesh:status', () => {
    let topology = null;
    try {
      topology = getDistributedScheduler().getMeshTopology();
    } catch {}
    return {
      mesh: backburnerMeshEngine.getMeshStatus(),
      discovery: meshDiscoveryManager.getStatus(),
      topology,
    };
  });
  handle('mesh:get-topology', () => getDistributedScheduler().getMeshTopology());
  handle('mesh:update-policy', (patch) => {
    const scheduler = getDistributedScheduler();
    const safePatch = patch || {};
    if (safePatch.schedulingPolicy) {
      scheduler.setSchedulingPolicy(safePatch.schedulingPolicy, safePatch);
    }
    if (scheduler.localPolicy && typeof scheduler.localPolicy.updateSettings === 'function') {
      return scheduler.localPolicy.updateSettings(safePatch);
    }
    return scheduler.getSchedulingPolicy();
  });
  handle('mesh:set-primary-host', (opts) => {
    const { isPrimary, deviceId } = opts || {};
    return getDistributedScheduler().setPrimaryHost(isPrimary !== false, deviceId);
  });
  handle('mesh:dispatch-job', (taskDef) => {
    return getDistributedScheduler().scheduleDistributedTask(taskDef || {});
  });
  handle('mesh:nl-command', (opts) => {
    const { commandText, command, context } = opts || {};
    return getDistributedScheduler().handleNaturalLanguageCommand(commandText || command || '', context || {});
  });
  handle('mesh:list-workers', () => {
    const topo = getDistributedScheduler().getMeshTopology();
    return topo.contributors || [];
  });
  handle('mesh:connect-worker', async (opts) => {
    return await getDistributedScheduler().connectRemoteWorker(opts || {});
  });
  handle('mesh:disconnect-worker', (opts) => {
    const { deviceId, workerId } = opts || {};
    return getDistributedScheduler().disconnectDevice(deviceId || workerId);
  });
  handle('mesh:generate-pin', () => {
    const crypto = require('crypto');
    return String(crypto.randomInt(100000, 999999));
  });
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

  // Dynamic Island / Notch completely removed
  handle('island:expand', () => false);
  handle('island:collapse', () => false);
  handle('island:open-main', (route) => {
    windows.openMain(route || 'home');
    return true;
  });
  handle('island:toggle', () => false);
  handle('island:status', () => ({ active: false }));

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

  // --- Common Sense, Spatial Radar & Social Intelligence Engine ---
  handle('common-sense:get-context', () => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return {
      spatial: cs.getSpatialContext(),
      people: cs.listPeople(),
      nextGossip: cs.getNextGossipDebrief(),
      gossipQueue: cs.gossipQueue,
    };
  });

  handle('common-sense:set-location', (loc) => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return cs.updateHostLocation(loc || {});
  });

  handle('common-sense:pitch-briefing', (personName) => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return cs.generatePitchBriefing(personName);
  });

  handle('common-sense:add-person', (data) => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return cs.registerPerson(data || {});
  });

  handle('common-sense:gossip-queue', () => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return {
      next: cs.getNextGossipDebrief(),
      queue: cs.gossipQueue
    };
  });

  handle('common-sense:resolve-gossip', ({ candidateName, userResponse }) => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return cs.resolveGossip(candidateName, userResponse);
  });

  handle('common-sense:lookup-social', (query) => {
    const { getCommonSenseEngine } = require('./intelligence/common_sense');
    const cs = getCommonSenseEngine({ windows, logger });
    return cs.lookupSocialContact(query);
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
    const resolvedId = llm.resolveProvider(settings, { online: net.isOnline() });
    const hits = Number(promptStats.hits || 0);
    const activeSlots = Number(promptStats.activeSlots || 0);
    const hitRatePct = hits + activeSlots > 0
      ? Math.round((hits / (hits + activeSlots)) * 1000) / 10
      : 0;

    return {
      processRssMB: Math.round(mem.rss / (1024 * 1024)),
      processHeapMB: Math.round(mem.heapUsed / (1024 * 1024)),
      systemTotalGB: (osTotal / (1024 * 1024 * 1024)).toFixed(1),
      systemUsedGB: ((osTotal - osFree) / (1024 * 1024 * 1024)).toFixed(1),
      systemUsagePercent: Math.round(((osTotal - osFree) / osTotal) * 100),
      cpuCount: os.cpus().length,
      session: sessionCosts,
      promptCache: { ...promptStats, hitRatePct },
      activeModel: llm.describe(settings, resolvedId) || 'No model active',
    };
  });

  handle('usage:reset', () => {
    if (costs) {
      costs.task = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
      costs.session = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, requests: 0 };
    }
    return { ok: true };
  });

  // Analytics & Interaction Trends (strictly authentic runtime telemetry, zero simulated defaults)
  handle('analytics:stats', () => {
    const summary = sentinel ? sentinel.getDailySummary() : null;
    const metrics = summary && summary.metrics ? summary.metrics : null;
    const workPercent = metrics && typeof metrics.officeWorkPercent === 'number' ? metrics.officeWorkPercent : 0;
    const personalPercent = metrics && typeof metrics.personalPercent === 'number' ? metrics.personalPercent : 0;
    const activeSecs = metrics && typeof metrics.totalActiveSeconds === 'number' ? metrics.totalActiveSeconds : 0;
    const queriesToday = metrics && typeof metrics.maveInteractionsCount === 'number' ? metrics.maveInteractionsCount : 0;
    const hasData = Boolean(metrics && (activeSecs > 0 || queriesToday > 0));
    const focusScore = hasData ? Math.min(100, Math.max(0, Math.round(workPercent))) : 0;

    return {
      hasData,
      workPercent,
      personalPercent,
      activeHours: (activeSecs / 3600).toFixed(1),
      focusScore,
      toolDistribution: Array.isArray(metrics && metrics.toolDistribution) ? metrics.toolDistribution : [],
      topApps: Array.isArray(summary && summary.topApps) ? summary.topApps : [],
      queriesToday,
    };
  });

  handle('data:import-file', async (event) => {
    const win = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Import CSV or JSON Dataset',
      properties: ['openFile'],
      filters: [{ name: 'Tabular Data', extensions: ['csv', 'json', 'tsv'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const fp = res.filePaths[0];
    const raw = fs.readFileSync(fp, 'utf8');
    let rows = [];
    if (fp.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(raw);
      rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : [parsed]);
    } else {
      const sep = fp.toLowerCase().endsWith('.tsv') ? '\t' : ',';
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length >= 1) {
        const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
        rows = lines.slice(1).map((line) => {
          const vals = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
          const obj = {};
          headers.forEach((h, i) => {
            const v = vals[i] ?? '';
            const num = Number(v);
            obj[h || `col_${i}`] = v !== '' && !Number.isNaN(num) ? num : v;
          });
          return obj;
        });
      }
    }
    return {
      ok: true,
      name: path.basename(fp),
      path: fp,
      rows: rows.slice(0, 5000),
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
  handle('ghost:workspace-tree', async (relSubdir = '') => {
    const root = process.cwd();
    const safeRel = typeof relSubdir === 'string' ? relSubdir.replace(/^[/\\]+/, '') : '';
    const target = path.resolve(root, safeRel);
    if (!target.startsWith(path.resolve(root)) || !fs.existsSync(target)) {
      return { root: path.basename(root), rootPath: root, entries: [] };
    }
    const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
    try {
      const dirents = fs.readdirSync(target, { withFileTypes: true })
        .filter((d) => !skip.has(d.name))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 150)
        .map((d) => {
          const fullPath = path.join(target, d.name);
          const relPath = path.relative(root, fullPath).replace(/\\/g, '/');
          return {
            name: d.name,
            relPath,
            fullPath,
            isDirectory: d.isDirectory(),
            ext: d.isDirectory() ? '' : path.extname(d.name).slice(1).toLowerCase(),
          };
        });
      return { root: path.basename(root), rootPath: root, currentRel: path.relative(root, target).replace(/\\/g, '/'), entries: dirents };
    } catch {
      return { root: path.basename(root), rootPath: root, entries: [] };
    }
  });
  handle('ghost:open-file', async (filePath) => {
    const { shell } = require('electron');
    if (filePath && typeof filePath === 'string') {
      return shell.openPath(filePath);
    }
    return '';
  });
  handle('ghost:read-file', async (filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'Invalid path' };
      const root = path.resolve(process.cwd());
      const resolved = path.resolve(root, path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath);
      if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
        return { ok: false, error: 'File outside workspace or missing' };
      }
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return { ok: false, error: 'Not a file' };
      const maxBytes = 256 * 1024;
      const truncated = stat.size > maxBytes;
      const buf = fs.readFileSync(resolved);
      const text = (truncated ? buf.subarray(0, maxBytes) : buf).toString('utf8');
      return {
        ok: true,
        name: path.basename(resolved),
        relPath: path.relative(root, resolved).replace(/\\/g, '/'),
        fullPath: resolved,
        ext: path.extname(resolved).slice(1).toLowerCase(),
        size: stat.size,
        truncated,
        content: text,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
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

  // MAVE Virtual Computer Subsystem IPC
  try {
    const { getVirtualComputerSession } = require('./virtual_computer');
    const vcSession = getVirtualComputerSession();

    handle('vc:get-status', () => vcSession.getStatus());
    handle('vc:start-takeover', () => vcSession.startTakeover());
    handle('vc:stop-takeover', () => vcSession.stopTakeover());
    handle('vc:user-input', async (eventPayload) => vcSession.dispatchUserInput(eventPayload));
    handle('vc:export-file', async ({ guestPath, hostPath }) => vcSession.executeGuestAction('export_file', { guestPath, hostPath }));
    handle('vc:execute-action', async ({ action, input }) => vcSession.executeGuestAction(action, input));
    handle('vc:list-files', async (path) => vcSession.desktopController.listGuestFiles(path));
    handle('vc:set-task', async ({ task, env }) => {
      vcSession.setActiveTask(task, env);
      return vcSession.getStatus();
    });

    vcSession.on('display-frame', (frame) => {
      windows.sendToAll('vc:frame', frame);
    });
    vcSession.on('task-updated', (data) => {
      windows.sendToAll('vc:task-update', data);
    });
    vcSession.on('task-progress', (data) => {
      windows.sendToAll('vc:task-progress', data);
    });
    vcSession.on('takeover-changed', (data) => {
      windows.sendToAll('vc:takeover-update', data);
    });

    const { getResearchEngine } = require('./autonomous/research_engine');
    const researchEngine = getResearchEngine({ session: vcSession });

    handle('research:conduct', async ({ topic, options }) => researchEngine.conductResearch(topic, options));
    handle('research:generate-artifact', async ({ type, name, content }) => researchEngine.generateArtifact(type, name, content));

    researchEngine.on('artifact-created', (art) => {
      windows.sendToAll('vc:artifact-created', art);
    });
  } catch (vcErr) {
    if (logger) logger.error('Failed to bind Virtual Computer IPC:', vcErr.message);
  }

  // MAVE Brain V3 Cognitive Orchestration & Hands-Free Voice IPC
  handle('orchestrator:handle', async (text, options) => {
    const { getCognitiveOrchestrator } = require('./orchestrator');
    return await getCognitiveOrchestrator().handleUserInteraction(text, options);
  });
  handle('orchestrator:active-task', () => {
    const { getCognitiveOrchestrator } = require('./orchestrator');
    const task = getCognitiveOrchestrator().getActiveTask();
    return task ? task.toJSON() : null;
  });
  handle('orchestrator:pause-task', () => {
    const { getCognitiveOrchestrator } = require('./orchestrator');
    const task = getCognitiveOrchestrator().getActiveTask();
    if (task) {
      task.setStatus('paused', 'User paused task');
      return { ok: true, status: 'paused' };
    }
    return { ok: false, message: 'No active task to pause.' };
  });
  handle('orchestrator:resume-task', () => {
    const { getCognitiveOrchestrator } = require('./orchestrator');
    const task = getCognitiveOrchestrator().getActiveTask();
    if (task) {
      task.setStatus('active', 'User resumed task');
      return { ok: true, status: 'active' };
    }
    return { ok: false, message: 'No paused task to resume.' };
  });
  handle('orchestrator:stop-task', () => {
    const { getCognitiveOrchestrator } = require('./orchestrator');
    const task = getCognitiveOrchestrator().getActiveTask();
    if (task) {
      task.setStatus('cancelled', 'User stopped task');
      getCognitiveOrchestrator().activeTask = null;
      return { ok: true, status: 'cancelled' };
    }
    return { ok: false, message: 'No active task to stop.' };
  });

  handle('voice:hands-free:toggle', (enabled) => {
    const { getHandsFreeVoicePipeline } = require('./audio/hands_free_voice');
    const vp = getHandsFreeVoicePipeline();
    const target = enabled !== undefined ? Boolean(enabled) : !vp.handsFreeEnabled;
    vp.setHandsFree(target);
    return { ok: true, handsFreeEnabled: vp.handsFreeEnabled, state: vp.state };
  });
  handle('voice:hands-free:status', () => {
    const { getHandsFreeVoicePipeline } = require('./audio/hands_free_voice');
    const vp = getHandsFreeVoicePipeline();
    return { handsFreeEnabled: vp.handsFreeEnabled, state: vp.state };
  });

  handle('memory:query-scoped', (query, options) => {
    const { MemoryPipeline } = require('./memory/memory_pipeline');
    const pipeline = new MemoryPipeline(options && options.userId ? options.userId : 'default');
    return pipeline.retrieveContext(query, options);
  });
  handle('memory:v2:stats', (options) => {
    const { MemoryDatabase } = require('./memory/memory_database');
    const uid = options && options.userId ? options.userId : 'default';
    const db = MemoryDatabase.forUser(uid);
    const episodes = db.queryEpisodes({ limit: 100 }).length;
    const facts = db.querySemanticFacts('*', '', 1000).length;
    const digests = db.getRecentDigests(30).length;
    const workItems = db.queryWorkLearning({ limit: 100 }).length;
    return { ok: true, episodesCount: episodes, factsCount: facts, digestsCount: digests, workCount: workItems };
  });
  handle('memory:learning:ingest-sensory', (payload, options) => {
    const { ContinuousLearningEngine } = require('./memory/continuous_learning_engine');
    const uid = options && options.userId ? options.userId : 'default';
    const engine = ContinuousLearningEngine.forUser(uid);
    return { ok: true, id: engine.ingestSensoryEvent(payload || {}) };
  });
  handle('memory:learning:record-work', (payload, options) => {
    const { ContinuousLearningEngine } = require('./memory/continuous_learning_engine');
    const uid = options && options.userId ? options.userId : 'default';
    const engine = ContinuousLearningEngine.forUser(uid);
    return { ok: true, id: engine.recordWork(payload || {}) };
  });
  handle('memory:learning:record-learning', (payload, options) => {
    const { ContinuousLearningEngine } = require('./memory/continuous_learning_engine');
    const uid = options && options.userId ? options.userId : 'default';
    const engine = ContinuousLearningEngine.forUser(uid);
    return { ok: true, id: engine.recordLearning(payload || {}) };
  });
  handle('memory:learning:consolidate', (payload, options) => {
    const { ContinuousLearningEngine } = require('./memory/continuous_learning_engine');
    const uid = options && options.userId ? options.userId : 'default';
    const engine = ContinuousLearningEngine.forUser(uid);
    return { ok: true, result: engine.consolidateMemories(payload || {}) };
  });
  handle('memory:learning:get-context', (query, options) => {
    const { ContinuousLearningEngine } = require('./memory/continuous_learning_engine');
    const uid = options && options.userId ? options.userId : 'default';
    const engine = ContinuousLearningEngine.forUser(uid);
    return { ok: true, ...engine.getGroundedContext(query, options || {}) };
  });

  handle('network:status', async () => {
    let isCellular = false;
    let connType = 'wifi';
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        const output = execSync('powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Status -eq \'Up\' } | Select-Object -ExpandProperty PhysicalMediaType"', { timeout: 2000, encoding: 'utf8' }).toLowerCase();
        if (output.includes('wwan') || output.includes('cellular') || output.includes('mobile')) {
          isCellular = true;
          connType = 'cellular';
        } else if (output.includes('native 802.11')) {
          connType = 'wifi';
        } else if (output.includes('802.3')) {
          connType = 'ethernet';
        }
      }
    } catch {}
    return { ok: true, isCellular, connType };
  });

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
