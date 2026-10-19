'use strict';
// The main window: sidebar navigation, Home, every settings page, and the Terminal.

(async () => {
  const api = window.buddy;
  const $ = (id) => document.getElementById(id);
  const TITLES = { home: 'Home', terminal: 'Terminal', data: 'Data Tab', channels: 'Channels', assistant: 'Assistant', account: 'Models', voice: 'Voice', superpowers: 'Superpowers', general: 'General' };
  const ALIASES = { listening: 'voice', models: 'account' }; // links to pages
  const update = (patch) => api.invoke('settings:update', patch).then((v) => { s = v; return v; });

  let s = await api.invoke('settings:get');
  function applyTheme(theme) {
    const t = theme || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('theme-light', t === 'light');
    document.body.classList.toggle('theme-dark', t === 'dark');
    document.body.classList.toggle('theme-system', t === 'system');
  }
  applyTheme(s.theme || 'dark');
  UI.titlebar();

  // navigation & ChatGPT layout
  const SETTINGS_SECTIONS = new Set(['general', 'account', 'voice', 'superpowers', 'assistant', 'customization', 'governance']);
  let activeMain = 'home';
  let micTesting = false;

  function openSettingsModal(tab = 'general') {
    tab = ALIASES[tab] || tab;
    if (!SETTINGS_SECTIONS.has(tab)) tab = 'general';
    const modal = $('settings-modal');
    if (modal) modal.hidden = false;
    document.querySelectorAll('.settings-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('#settings-content [data-pane]').forEach((p) => {
      p.hidden = p.dataset.pane !== tab;
    });
    document.dispatchEvent(new CustomEvent('section-shown', { detail: tab }));
    if (tab !== 'voice' && micTesting) toggleMicTest(false);
    if (tab === 'voice') refreshMic();
    if (tab === 'customization' || tab === 'governance') loadGovernanceState();
    requestAnimationFrame(() => {
      document.querySelectorAll('#settings-content [data-pane]:not([hidden]) .segmented').forEach((el) => el._seg && el._seg.set(el._value()));
    });
  }

  function closeSettingsModal() {
    const modal = $('settings-modal');
    if (modal) modal.hidden = true;
    if (micTesting) toggleMicTest(false);
  }

  function show(section) {
    section = ALIASES[section] || section;
    if (SETTINGS_SECTIONS.has(section)) {
      openSettingsModal(section);
      return;
    }
    closeSettingsModal();
    if (!TITLES[section]) section = 'home';
    activeMain = section;
    document.querySelectorAll('nav button').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === section);
      b.setAttribute('aria-current', String(b.dataset.section === section));
    });
    document.querySelectorAll('#pane > [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== section; });
    $('section-title').textContent = section === 'assistant' ? s.assistantName : TITLES[section];
    $('pane').scrollTop = 0;
    $('pane').classList.toggle('fill', section === 'home' || section === 'terminal' || section === 'data' || section === 'channels');
    document.dispatchEvent(new CustomEvent('section-shown', { detail: section }));
  }

  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.section)));
  $('pane').addEventListener('scroll', () => document.querySelector('.content').classList.toggle('scrolled', $('pane').scrollTop > 4));
  document.querySelectorAll('[data-link]').forEach((a) => a.addEventListener('click', () => api.invoke('app:open-link', a.dataset.link)));

  // ChatGPT Sidebar & Settings Modal wiring
  if ($('open-settings-btn')) $('open-settings-btn').addEventListener('click', () => openSettingsModal('general'));
  if ($('settings-modal-close')) $('settings-modal-close').addEventListener('click', closeSettingsModal);
  const modalEl = $('settings-modal');
  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeSettingsModal();
    });
  }
  document.querySelectorAll('.settings-tab-btn').forEach((b) => {
    b.addEventListener('click', () => openSettingsModal(b.dataset.tab));
  });

  if ($('sidebar-toggle')) {
    $('sidebar-toggle').addEventListener('click', () => {
      document.querySelector('.window').classList.toggle('sidebar-collapsed');
    });
  }
  if ($('sidebar-expand-btn')) {
    $('sidebar-expand-btn').addEventListener('click', () => {
      document.querySelector('.window').classList.remove('sidebar-collapsed');
    });
  }
  if ($('sidebar-new-chat')) {
    $('sidebar-new-chat').addEventListener('click', () => {
      show('home');
      if ($('new-chat')) $('new-chat').click();
    });
  }
  document.querySelectorAll('#sidebar-recents .recent-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      show('home');
      const p = btn.dataset.prompt;
      if (p && $('prompt')) {
        $('prompt').value = p;
        $('prompt').dispatchEvent(new Event('input', { bubbles: true }));
        $('prompt').focus();
      }
    });
  });

  // Model Picker Dropdown
  const modelBtn = $('model-picker-btn');
  const modelDropdown = $('model-picker-dropdown');
  function updateModelHeader(label) {
    if ($('model-picker-name')) $('model-picker-name').textContent = label;
  }
  if (modelBtn && modelDropdown) {
    modelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = !modelDropdown.hidden;
      modelDropdown.hidden = hidden;
      modelBtn.setAttribute('aria-expanded', String(!hidden));
    });
    document.addEventListener('click', (e) => {
      if (!modelDropdown.contains(e.target) && e.target !== modelBtn) {
        modelDropdown.hidden = true;
        modelBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.querySelectorAll('#model-picker-dropdown .mp-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const type = item.dataset.modelType;
        modelDropdown.hidden = true;
        modelBtn.setAttribute('aria-expanded', 'false');
        if (!type) return;

        if (type === 'auto') {
          await update({ autoRouting: true });
          updateModelHeader('Mave 4o (Auto)');
        } else if (type === 'local') {
          await update({ provider: 'local', autoRouting: false });
          updateModelHeader('Qwen 3-VL (Local)');
        } else if (type === 'anthropic') {
          await update({ provider: 'anthropic', autoRouting: false });
          updateModelHeader('Claude 3.7 Sonnet');
        } else if (type === 'openai') {
          await update({ provider: 'openai', autoRouting: false });
          updateModelHeader('GPT-4o (ChatGPT)');
        } else if (type === 'airllm') {
          await update({ airllmEnabled: true });
          updateModelHeader('AirLLM 70B MoE');
        }
        renderActive();
      });
    });
    if ($('mp-open-settings')) {
      $('mp-open-settings').addEventListener('click', () => {
        modelDropdown.hidden = true;
        openSettingsModal('account');
      });
    }
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      show('home');
      if ($('new-chat')) $('new-chat').click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal('general');
    } else if (e.key === 'Escape' && $('settings-modal') && !$('settings-modal').hidden) {
      closeSettingsModal();
    }
  });

  function seg(id, get, onChange) {
    const el = $(id);
    el._seg = UI.segmented(el, get(), onChange);
    el._value = get;
    return el._seg;
  }

  // Assistant
  function renderName() {
    const n = s.assistantName || 'Mave';
    if ($('hero-name')) $('hero-name').textContent = n;
    if ($('nav-name')) $('nav-name').textContent = n;
    document.querySelectorAll('.name-slot').forEach((el) => { el.textContent = n; });
    const pane = document.querySelector('[data-pane="assistant"]');
    if (pane && !pane.hidden && $('section-title')) $('section-title').textContent = n;
    document.title = `${n} Settings`;
  }
  async function refreshWake() {
    const st = $('wake-status');
    if (!s.wakeWord) { st.className = 'status'; st.querySelector('.text').textContent = ''; return; }
    st.className = 'status busy';
    st.querySelector('.text').textContent = 'Starting…';
    const res = await api.invoke('wake:status');
    st.className = `status ${res.active ? 'ok' : 'bad'}`;
    st.querySelector('.text').textContent = res.active ? 'Listening' : 'Unavailable';
    $('wake-hint').textContent = res.active
      ? ''
      : 'Windows speech recognition isn’t available. Add the English speech pack in Windows Settings › Time & language › Speech.';
  }
  $('assistant-name').value = s.assistantName;
  const saveName = async () => {
    const v = $('assistant-name').value.trim();
    if (v === s.assistantName) return;
    await update({ assistantName: v });
    $('assistant-name').value = s.assistantName;
    renderName();
    refreshWake();
  };
  $('assistant-name').addEventListener('change', saveName);
  $('assistant-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('assistant-name').blur(); });
  UI.switchControl($('wake'), s.wakeWord, async (v) => { await update({ wakeWord: v }); refreshWake(); });
  $('rerun-setup').addEventListener('click', () => api.invoke('app:open-onboarding'));
  renderName();
  refreshWake();

  // Models
  const LLM = {
    anthropic: { label: 'Claude', keyName: 'anthropicKey', keyLabel: 'Anthropic API key', modelSetting: 'model', placeholder: 'sk-ant-…' },
    openai: { label: 'OpenAI', keyName: 'openaiKey', keyLabel: 'OpenAI API key', modelSetting: 'openaiModel', placeholder: 'sk-…' },
  };
  const current = () => LLM[s.provider] || LLM.anthropic;
  let local = null;
  document.addEventListener('section-shown', (e) => {
    if (e.detail === 'account' && !local) local = LocalAI.picker($('local-ai'), { onChange: renderLocalFoot });
  });
  function renderLocalFoot() {
    if (!local) return;
    renderActive();
  }
  UI.switchControl($('keep-loaded'), s.keepAiLoaded, (v) => update({ keepAiLoaded: v }));
  const autoUpdateToggle = $('auto-update-models');
  if (autoUpdateToggle) {
    UI.switchControl(autoUpdateToggle, s.autoUpdateModels !== false, (v) => update({ autoUpdateModels: v }));
  }
  const checkUpdatesBtn = $('check-model-updates-btn');
  const updateStatusHint = $('model-update-status-hint');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', async () => {
      checkUpdatesBtn.disabled = true;
      checkUpdatesBtn.textContent = 'Checking…';
      try {
        const res = await api.invoke('local:check-updates', true);
        if (res && res.updateAvailable) {
          if (updateStatusHint) updateStatusHint.textContent = `Update found: ${res.targetLabel}. Downloading & installing in background...`;
          checkUpdatesBtn.textContent = 'Installing…';
        } else {
          if (updateStatusHint) updateStatusHint.textContent = (res && res.message) || 'Models are up to date.';
          checkUpdatesBtn.textContent = 'Check for Updates';
          checkUpdatesBtn.disabled = false;
        }
      } catch (err) {
        if (updateStatusHint) updateStatusHint.textContent = 'Check failed: ' + err.message;
        checkUpdatesBtn.textContent = 'Check for Updates';
        checkUpdatesBtn.disabled = false;
      }
    });
    // Fetch initial status if available
    api.invoke('local:auto-update-status').then((info) => {
      if (info && info.lastCheck && updateStatusHint) {
        const d = new Date(info.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        updateStatusHint.textContent = `Auto-checks every ${info.intervalHours}h. Last checked at ${d}.`;
      }
    }).catch(() => {});
  }
  const llmKey = UI.keyField({
    input: $('llm-key'), status: $('llm-key-status'), reveal: $('llm-reveal'), remove: $('llm-remove'),
    key: () => current().keyName, has: s.has[current().keyName], placeholder: () => current().placeholder,
    validate: (value) => api.invoke('provider:test', s.provider, value),
    onSaved: async () => { s = await api.invoke('settings:get'); renderModels(); },
  });
  $('llm-key-link').addEventListener('click', () => api.invoke('app:open-link', s.provider));
  $('llm-test').addEventListener('click', async () => {
    if ($('llm-key').value.trim()) return llmKey.save();
    const st = $('llm-key-status');
    st.className = 'status busy';
    st.querySelector('.text').textContent = 'Checking…';
    const res = await api.invoke('provider:test', s.provider);
    st.className = `status ${res.ok ? 'ok' : 'bad'}`;
    st.querySelector('.text').textContent = res.ok ? 'Connected' : res.message;
  });

  let modelsToken = 0;
  async function renderModels() {
    const cloud = s.provider !== 'local';
    document.querySelectorAll('[data-pane="account"] .cloud-only').forEach((el) => { el.hidden = !cloud; });
    $('effort-row').hidden = s.provider !== 'anthropic';
    $('detail-row').hidden = s.provider !== 'anthropic';
    if ($('endpoint-row')) $('endpoint-row').hidden = s.provider !== 'openai';
    if ($('openai-endpoint') && document.activeElement !== $('openai-endpoint')) $('openai-endpoint').value = s.openaiEndpoint || '';
    $('provider-hint').textContent = cloud ? 'Online only' : 'Private, works offline';
    if (!cloud) { renderActive(); return; }
    const p = current();
    const token = ++modelsToken;
    $('llm-key-label').textContent = p.keyLabel;
    $('llm-key').placeholder = p.placeholder;
    llmKey.setHas(s.has[p.keyName]);

    const sel = $('model');
    const saved = s[p.modelSetting];
    sel.disabled = true;
    sel.innerHTML = '<option>Loading models…</option>';
    let models = [];
    if (s.provider === 'anthropic') models = s.models.map((m) => ({ id: m.id, name: m.label, note: m.note }));
    if (s.has[p.keyName]) {
      const res = await api.invoke('models:list', s.provider);
      if (token !== modelsToken) return;
      if (res.ok) {
        for (const m of res.models) if (!models.some((x) => x.id === m.id)) models.push(m);
      } else {
        $('model-note').textContent = res.message;
      }
    }
    if (!models.some((m) => m.id === saved)) models.unshift({ id: saved, name: saved });
    sel.innerHTML = '';
    for (const m of models) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name === m.id ? m.id : `${m.name}`;
      sel.append(o);
    }
    sel.value = saved;
    sel.disabled = false;
    const note = models.find((m) => m.id === saved);
    $('model-note').textContent = note && note.note ? note.note : s.has[p.keyName] ? saved : `Add your ${p.label} key to load its models.`;
    renderActive();
  }
  $('model').addEventListener('change', async () => {
    await update({ [current().modelSetting]: $('model').value });
    renderModels();
  });
  if ($('openai-endpoint')) {
    $('openai-endpoint').addEventListener('change', async () => {
      await update({ openaiEndpoint: $('openai-endpoint').value.trim() });
      renderModels();
    });
  }
  seg('provider', () => s.provider, async (v) => { await update({ provider: v }); renderModels(); });
  seg('effort', () => s.effort, (v) => update({ effort: v }));
  seg('screen-detail', () => s.screenDetail, (v) => update({ screenDetail: v }));

  async function renderActive() {
    const active = await api.invoke('provider:active');
    const st = $('active-status');
    if ($('model-picker-name')) {
      if (s.autoRouting) {
        $('model-picker-name').textContent = 'Mave 4o (Auto)';
      } else if (s.provider === 'local' || active.id === 'local') {
        $('model-picker-name').textContent = 'Qwen 3-VL (Local)';
      } else if (s.provider === 'anthropic') {
        $('model-picker-name').textContent = 'Claude 3.7 Sonnet';
      } else if (s.provider === 'openai') {
        $('model-picker-name').textContent = 'GPT-4o (ChatGPT)';
      } else if (active.label) {
        $('model-picker-name').textContent = active.label.split('(')[0].trim();
      }
    }
    if (!active.id) {
      $('active-model').textContent = 'No model ready yet';
      $('active-note').textContent = 'Download the model on this PC above.';
      st.className = 'status bad';
      st.querySelector('.text').textContent = 'Not ready';
      return;
    }
    $('active-model').textContent = active.id === 'local' ? `${active.label} · on this PC` : active.label;
    let note = '';
    if (active.id === 'local' && s.provider !== 'local') {
      note = !active.online ? 'You’re offline, so the model on this PC is used.' : `${LLM[s.provider].label} has no key yet, so the model on this PC is used.`;
    } else if (active.id !== 'local' && s.provider === 'local') {
      note = 'The model on this PC isn’t installed yet, so your cloud model is used meanwhile.';
    }
    $('active-note').textContent = note;
    st.className = 'status ok';
    st.querySelector('.text').textContent = active.id === 'local' ? 'Ready · offline capable' : 'Ready · online';
  }
  renderModels();

  // Voice
  const speakHint = () => { $('speak-hint').textContent = ''; };
  UI.switchControl($('speak'), s.speakResponses, async (v) => { await update({ speakResponses: v }); speakHint(); });
  speakHint();
  const previewMsg = 'Built in and private: speech is made on this PC. Press ▶︎ to hear a voice.';
  UI.voicePicker($('voices'), s.voice, {
    onPick: (id) => update({ voice: id }),
    onMessage: (m) => { $('preview-msg').textContent = m || previewMsg; },
  });
  $('rate').value = s.speechRate;
  $('rate').addEventListener('change', () => update({ speechRate: Number($('rate').value) }));

  // Microphone

  const drawMeter = UI.meter($('mic-meter'));
  api.on('level', (l) => { if (micTesting) drawMeter(l); });
  async function refreshMic() {
    const status = await api.invoke('mic:status');
    const st = $('mic-status');
    const ok = status === 'granted' || status === 'not-determined' || status === 'unknown';
    st.className = `status ${ok ? 'ok' : 'bad'}`;
    st.querySelector('.text').textContent = ok ? 'Allowed' : 'Blocked by Windows';
    $('mic-hint').textContent = ok ? '' : 'Turn on “Let desktop apps access your microphone” in Windows Settings.';
  }
  async function toggleMicTest(on) {
    micTesting = on;
    $('mic-test').textContent = on ? 'Stop Test' : 'Test Microphone';
    if (!on) { drawMeter(0); await api.invoke('mic:test', false); return; }
    const res = await api.invoke('mic:test', true);
    if (!res.ok) {
      micTesting = false;
      $('mic-test').textContent = 'Test Microphone';
      const st = $('mic-status');
      st.className = 'status bad';
      st.querySelector('.text').textContent = /denied/i.test(res.message) ? 'Blocked by Windows' : res.message;
    }
  }
  $('mic-test').addEventListener('click', () => toggleMicTest(!micTesting));
  $('mic-settings').addEventListener('click', () => api.invoke('app:open-link', 'micSettings'));
  window.addEventListener('focus', () => { if (!$('mic-status').closest('[hidden]')) refreshMic(); });

  // Superpowers
  async function refreshSuperpowers() {
    const sp = await api.invoke('superpowers:status');
    if (!sp) return;
    if ($('lan-url-link')) {
      $('lan-url-link').textContent = sp.mobileLanUrl;
      $('lan-url-link').href = sp.mobileLanUrl;
      $('lan-url-hint').textContent = `Mobile controller live on your Wi-Fi (${sp.mobileLanUrl}). Also open on this PC: ${sp.mobileLocalUrl}`;
    }
    const tgSt = $('tg-status');
    if (tgSt) {
      const isOk = sp.telegram && sp.telegram.configured;
      tgSt.className = `status ${isOk ? 'ok' : 'bad'}`;
      tgSt.querySelector('.text').textContent = isOk
        ? (sp.telegram.botUsername ? `@${sp.telegram.botUsername} Connected` : 'Connected')
        : 'Token not set';
    }
    if ($('tg-token') && sp.telegram && sp.telegram.token && !$('tg-token').value) {
      $('tg-token').value = sp.telegram.token;
    }
    if ($('tg-chat-id') && sp.telegram && sp.telegram.chatId && !$('tg-chat-id').value) {
      $('tg-chat-id').value = sp.telegram.chatId;
    }
    if ($('pet-mood-hint') && sp.pet) {
      $('pet-mood-hint').textContent = `Energy: ${sp.pet.energy}% · Hunger: ${sp.pet.hunger}% · Mood: ${sp.pet.state || 'Happy'}`;
    }
  }

  if ($('tg-enable')) UI.switchControl($('tg-enable'), s.telegramEnabled, (v) => update({ telegramEnabled: v }));
  if ($('tg-reveal')) {
    let rev = false;
    $('tg-reveal').addEventListener('click', () => {
      rev = !rev;
      $('tg-token').type = rev ? 'text' : 'password';
    });
  }
  if ($('tg-connect')) {
    $('tg-connect').addEventListener('click', async () => {
      const val = $('tg-token').value.trim();
      const tgSt = $('tg-status');
      tgSt.className = 'status busy';
      tgSt.querySelector('.text').textContent = 'Connecting…';
      const res = await api.invoke('telegram:connect', val);
      tgSt.className = `status ${res.ok ? 'ok' : 'bad'}`;
      tgSt.querySelector('.text').textContent = res.ok
        ? `@${res.username || 'bot'} Connected`
        : (res.message || 'Error');
      refreshSuperpowers();
    });
  }
  if ($('tg-chat-id')) {
    $('tg-chat-id').value = s.telegramChatId || '';
    $('tg-chat-id').addEventListener('change', () => update({ telegramChatId: $('tg-chat-id').value.trim() }));
  }

  if ($('insta-username')) {
    $('insta-username').value = s.instagramUsername || 'mave.ai';
    $('insta-username').addEventListener('change', () => update({ instagramUsername: $('insta-username').value.trim() }));
  }
  if ($('insta-deduce-intent')) {
    UI.switchControl($('insta-deduce-intent'), s.instagramDeduceReelIntent !== false, (v) => update({ instagramDeduceReelIntent: v }));
  }
  if ($('insta-learn-trends')) {
    UI.switchControl($('insta-learn-trends'), s.instagramAutoLearnTrends !== false, (v) => update({ instagramAutoLearnTrends: v }));
  }

  if ($('lan-url-copy')) {
    $('lan-url-copy').addEventListener('click', () => {
      navigator.clipboard.writeText($('lan-url-link').textContent);
      $('lan-url-copy').textContent = 'Copied!';
      setTimeout(() => { $('lan-url-copy').textContent = 'Copy Link'; }, 2000);
    });
  }
  if ($('web-port')) {
    $('web-port').value = s.webPort || 4040;
    $('web-port').addEventListener('change', () => update({ webPort: Number($('web-port').value) || 4040 }));
  }

  if ($('sec-read-pin')) {
    $('sec-read-pin').value = s.readPassword || '8080';
    $('sec-read-pin').addEventListener('change', () => update({ readPassword: $('sec-read-pin').value.trim() || '8080' }));
  }
  if ($('sec-operate-pin')) {
    $('sec-operate-pin').value = s.operatePassword || '0509';
    $('sec-operate-pin').addEventListener('change', () => update({ operatePassword: $('sec-operate-pin').value.trim() || '0509' }));
  }
  if ($('sec-admin-pin')) {
    $('sec-admin-pin').value = s.adminPassword || '1508';
    $('sec-admin-pin').addEventListener('change', () => update({ adminPassword: $('sec-admin-pin').value.trim() || '1508' }));
  }

  if ($('pet-enable')) UI.switchControl($('pet-enable'), s.desktopPetEnabled, (v) => update({ desktopPetEnabled: v }));
  if ($('pet-species')) seg('pet-species', () => s.desktopPetSpecies || 'meta_muse', (v) => update({ desktopPetSpecies: v }));
  if ($('pet-theme')) seg('pet-theme', () => s.desktopPetTheme || 'sunset', (v) => update({ desktopPetTheme: v }));
  if ($('pet-size')) seg('pet-size', () => s.desktopPetSize || 'normal', (v) => update({ desktopPetSize: v }));
  if ($('pet-auto-morph')) UI.switchControl($('pet-auto-morph'), s.desktopPetAutoMorph !== false, (v) => update({ desktopPetAutoMorph: v }));
  if ($('pet-name')) {
    $('pet-name').value = s.desktopPetName || 'Muse';
    $('pet-name').addEventListener('change', () => update({ desktopPetName: $('pet-name').value.trim() || 'Muse' }));
  }
  if ($('pet-feed-btn')) {
    $('pet-feed-btn').addEventListener('click', async () => {
      await api.invoke('pet:feed');
      $('pet-feed-btn').textContent = 'Fed! 🍓';
      setTimeout(() => { $('pet-feed-btn').textContent = 'Feed 🍓'; }, 2000);
      refreshSuperpowers();
    });
  }
  if ($('pet-pet-btn')) {
    $('pet-pet-btn').addEventListener('click', async () => {
      await api.invoke('pet:pet');
      $('pet-pet-btn').textContent = 'Loved! ❤️';
      setTimeout(() => { $('pet-pet-btn').textContent = 'Pet ❤️'; }, 2000);
      refreshSuperpowers();
    });
  }
  if ($('pet-play-btn')) {
    $('pet-play-btn').addEventListener('click', async () => {
      await api.invoke('pet:play');
      $('pet-play-btn').textContent = 'Level Up! ⭐';
      setTimeout(() => { $('pet-play-btn').textContent = 'Play ⭐'; }, 2000);
      refreshSuperpowers();
    });
  }
  if ($('pet-summon-btn')) {
    $('pet-summon-btn').addEventListener('click', async () => {
      await api.invoke('pet:summon');
      $('pet-summon-btn').textContent = 'Summoned!';
      setTimeout(() => { $('pet-summon-btn').textContent = 'Summon'; }, 2000);
      refreshSuperpowers();
    });
  }

  if ($('routines-enable')) UI.switchControl($('routines-enable'), s.proactiveRoutinesEnabled !== false, (v) => update({ proactiveRoutinesEnabled: v }));
  if ($('circadian-briefing')) UI.switchControl($('circadian-briefing'), s.circadianBriefing !== false, (v) => update({ circadianBriefing: v }));
  if ($('briefing-test-btn')) {
    $('briefing-test-btn').addEventListener('click', async () => {
      $('briefing-test-btn').disabled = true;
      $('briefing-test-btn').textContent = 'Generating…';
      const res = await api.invoke('routines:briefing');
      $('briefing-test-btn').disabled = false;
      $('briefing-test-btn').textContent = res.ok ? 'Briefing Delivered!' : 'Failed';
      setTimeout(() => { $('briefing-test-btn').textContent = 'Trigger Briefing'; }, 3000);
    });
  }

  if ($('screen-memory')) UI.switchControl($('screen-memory'), s.screenMemoryEnabled !== false, (v) => update({ screenMemoryEnabled: v }));
  if ($('vault-dir')) {
    $('vault-dir').value = s.knowledgeVaultDir || 'E:\\AI-Models';
    $('vault-dir').addEventListener('change', () => update({ knowledgeVaultDir: $('vault-dir').value.trim() }));
  }
  if ($('vault-reindex-btn')) {
    $('vault-reindex-btn').addEventListener('click', async () => {
      $('vault-reindex-btn').disabled = true;
      $('vault-reindex-btn').textContent = 'Indexing…';
      await api.invoke('knowledge:reindex');
      $('vault-reindex-btn').disabled = false;
      $('vault-reindex-btn').textContent = 'Indexed!';
      setTimeout(() => { $('vault-reindex-btn').textContent = 'Re-Index'; }, 2500);
    });
  }

  if ($('auto-routing')) UI.switchControl($('auto-routing'), s.autoModelRouting !== false, (v) => update({ autoModelRouting: v }));
  if ($('routing-strategy')) seg('routing-strategy', () => s.routingStrategy || 'local_first', (v) => update({ routingStrategy: v }));

  if ($('connected-services-enable')) UI.switchControl($('connected-services-enable'), s.connectedServicesEnabled !== false, (v) => update({ connectedServicesEnabled: v }));
  if ($('notes-vault-dir')) {
    $('notes-vault-dir').value = s.notesVaultPath || '';
    $('notes-vault-dir').addEventListener('change', () => update({ notesVaultPath: $('notes-vault-dir').value.trim() }));
  }
  if ($('gdrive-dir')) {
    $('gdrive-dir').value = s.googleDrivePath || '';
    $('gdrive-dir').addEventListener('change', () => update({ googleDrivePath: $('gdrive-dir').value.trim() }));
  }
  if ($('test-services-btn')) {
    $('test-services-btn').addEventListener('click', () => {
      $('test-services-btn').textContent = 'Services Active ✓';
      setTimeout(() => { $('test-services-btn').textContent = 'Status Check'; }, 2500);
    });
  }

  document.addEventListener('section-shown', (e) => {
    if (e.detail === 'superpowers') refreshSuperpowers();
  });

  // General
  if ($('theme-mode')) seg('theme-mode', () => s.theme || 'dark', async (v) => { applyTheme(v); await update({ theme: v }); });
  UI.switchControl($('show-buddy'), s.showBuddy, (v) => update({ showBuddy: v }));
  UI.switchControl($('sounds'), s.soundEffects, (v) => update({ soundEffects: v }));
  UI.switchControl($('login'), s.launchAtLogin, (v) => update({ launchAtLogin: v }));
  UI.switchControl($('tool-tray'), s.toolTray, (v) => update({ toolTray: v }));
  LocalAI.banner($('lai-banner'));
  $('open-logs').addEventListener('click', () => api.invoke('app:open-logs'));
  $('open-plugins').addEventListener('click', () => api.invoke('app:open-plugins'));
  api.invoke('app:info').then((info) => { $('version').textContent = `Version ${info.version}`; });

  // Plugins
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function pluginRow(title, detail, badge, { error = false, action = null, plain = false } = {}) {
    const row = el('div', 'row');
    const label = el('div', 'label');
    label.append(el('span', 'headline', title), el('div', `hint${error ? ' error' : plain ? '' : ' mono-list'}`, detail));
    row.append(label);
    if (action) row.append(action);
    if (badge) row.append(el('span', 'badge custom', badge));
    return row;
  }

  async function renderPlugins() {
    const { builtin, custom } = await api.invoke('plugins:list');
    const list = $('plugin-list');
    list.textContent = '';
    for (const g of builtin) list.append(pluginRow(g.title, g.tools.join(' · '), null));
    if (!custom.length) {
      list.append(pluginRow('No custom plugins yet', 'Add Plugin… opens beside a template you can copy and edit.', null, { plain: true }));
    }
    for (const p of custom) {
      const remove = el('button', 'btn plain small', 'Remove');
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Remove ${p.file}? It moves to the Recycle Bin and its tools stop working.`)) return;
        await api.invoke('plugins:remove', p.file);
        renderPlugins();
      });
      list.append(pluginRow(p.file, p.error || p.tools.join(' · '), p.error ? 'Not loaded' : 'Custom', { error: Boolean(p.error), action: remove }));
    }
  }

  function renderReview(report) {
    const box = $('plugin-review');
    box.textContent = '';
    box.hidden = false;
    box.className = `plugin-review ${report.ok ? 'ok' : 'bad'}`;
    const head = el('div', 'pr-head');
    head.append(el('span', 'headline', report.ok ? `Ready to install ${report.name}` : `${report.name} can’t be installed`));
    box.append(head);
    const section = (title, items, cls) => {
      if (!items.length) return;
      box.append(el('div', 'pr-label', title));
      const ul = el('ul', `pr-list ${cls || ''}`);
      for (const t of items) ul.append(el('li', null, t));
      box.append(ul);
    };
    section('Problems to fix', report.errors, 'bad');
    section('Adds these tools', report.tools.map((t) => `${t.name}: ${t.description}`));
    section('This plugin’s code can', report.capabilities.length ? report.capabilities : ['Nothing beyond its own logic'], 'caps');
    section('Suggestions', report.warnings, 'warn');
    const foot = el('div', 'pr-foot');
    foot.append(el('span', 'caption', report.ok
      ? 'Plugins run with the same access as Mave. Only install plugins you wrote or trust.'
      : 'Fix the problems above, then choose the file again.'));
    foot.append(el('span', 'spacer'));
    const cancel = el('button', 'btn plain small', report.ok ? 'Cancel' : 'Close');
    cancel.addEventListener('click', () => { box.hidden = true; });
    foot.append(cancel);
    if (report.ok) {
      const install = el('button', 'btn primary small', 'Install');
      install.addEventListener('click', async () => {
        install.disabled = true;
        const res = await api.invoke('plugins:install', report.file);
        if (res.ok) {
          box.className = 'plugin-review ok';
          box.textContent = '';
          box.append(el('span', 'headline', `Installed ${report.name}. Its tools are available from your next request.`));
          setTimeout(() => { box.hidden = true; }, 5000);
          renderPlugins();
        } else {
          renderReview({ ...report, ...res.report, ok: false });
        }
      });
      foot.append(install);
    }
    box.append(foot);
  }

  $('plugin-add').addEventListener('click', async () => {
    $('plugin-add').disabled = true;
    try {
      const report = await api.invoke('plugins:pick');
      if (report) renderReview(report);
    } finally {
      $('plugin-add').disabled = false;
    }
  });
  renderPlugins();

  api.on('settings', (v) => {
    if (v && v.section) { show(v.section); return; }
    if (v && v.models) s = v;
  });

  // ==========================================
  // User Freedom & Customization Logic
  // ==========================================
  let govState = null;
  let activeCustomUserId = 'admin';

  async function loadGovernanceState() {
    try {
      govState = await api.invoke('governance:get-state');
      if (govState) {
        activeCustomUserId = govState.activeUserId || 'admin';
        populateCustomizationUI();
        populateGovernanceUI();
      }
    } catch (err) {
      console.warn('Failed to load governance state:', err);
    }
  }

  function populateCustomizationUI() {
    if (!govState || !govState.users) return;
    const userSelect = $('custom-user-select');
    if (userSelect) {
      userSelect.innerHTML = '';
      for (const u of govState.users) {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role.toUpperCase()})`;
        if (u.id === activeCustomUserId) opt.selected = true;
        userSelect.appendChild(opt);
      }
    }

    const curUser = govState.users.find((u) => u.id === activeCustomUserId) || govState.activeUser;
    if (!curUser) return;

    if ($('custom-user-name')) $('custom-user-name').value = curUser.name || '';
    if ($('custom-instructions-text')) $('custom-instructions-text').value = curUser.customInstructions || '';
    if ($('custom-language-select')) $('custom-language-select').value = curUser.language || 'auto';
    if ($('custom-pet-species')) $('custom-pet-species').value = curUser.companionSpecies || 'meta_muse';
    if ($('custom-pet-theme')) $('custom-pet-theme').value = curUser.companionTheme || 'sunset';
    if ($('custom-theme-select')) $('custom-theme-select').value = curUser.theme || 'dark';

    // Populate voice dropdown with available kokoro voices
    const voiceSelect = $('custom-voice-select');
    if (voiceSelect && voiceSelect.children.length === 0) {
      const voiceOptions = [
        ['af_heart', 'Heart (Warm & Organic female)'],
        ['af_bella', 'Bella (Friendly & Expressive female)'],
        ['af_nicole', 'Nicole (Calm & Professional female)'],
        ['bf_emma', 'Emma (British natural female)'],
        ['am_adam', 'Adam (Smart & Focused male)'],
        ['am_echo', 'Echo (Crisp modern male)'],
        ['bm_george', 'George (British distinguished male)'],
      ];
      for (const [id, label] of voiceOptions) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        if (id === curUser.voice) opt.selected = true;
        voiceSelect.appendChild(opt);
      }
    } else if (voiceSelect) {
      voiceSelect.value = curUser.voice || 'af_heart';
    }
  }

  if ($('custom-user-select')) {
    $('custom-user-select').addEventListener('change', async (e) => {
      activeCustomUserId = e.target.value;
      try {
        await api.invoke('governance:set-active-user', activeCustomUserId);
        await loadGovernanceState();
      } catch (err) {
        console.warn('Failed to switch user:', err);
      }
    });
  }

  if ($('custom-save-btn')) {
    $('custom-save-btn').addEventListener('click', async () => {
      const btn = $('custom-save-btn');
      const status = $('custom-save-status');
      btn.disabled = true;
      try {
        const updates = {
          name: $('custom-user-name') ? $('custom-user-name').value.trim() : undefined,
          customInstructions: $('custom-instructions-text') ? $('custom-instructions-text').value.trim() : undefined,
          voice: $('custom-voice-select') ? $('custom-voice-select').value : undefined,
          language: $('custom-language-select') ? $('custom-language-select').value : undefined,
          companionSpecies: $('custom-pet-species') ? $('custom-pet-species').value : undefined,
          companionTheme: $('custom-pet-theme') ? $('custom-pet-theme').value : undefined,
          theme: $('custom-theme-select') ? $('custom-theme-select').value : undefined,
        };
        await api.invoke('governance:save-customization', activeCustomUserId, updates);
        if (updates.theme) applyTheme(updates.theme);
        if (status) {
          status.className = 'status ok';
          status.querySelector('.text').textContent = 'Saved!';
          setTimeout(() => { status.className = 'status'; status.querySelector('.text').textContent = ''; }, 3000);
        }
        await loadGovernanceState();
      } catch (err) {
        if (status) {
          status.className = 'status error';
          status.querySelector('.text').textContent = err.message;
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  if ($('custom-new-user-btn')) {
    $('custom-new-user-btn').addEventListener('click', async () => {
      const pin = prompt('Enter Parent Admin PIN to add a new family profile:');
      if (!pin) return;
      const name = prompt('Enter new family member name:');
      if (!name) return;
      try {
        const res = await api.invoke('governance:admin-create-user', { name, role: 'kid', powerTier: 'safe_kid' }, pin);
        if (res && res.user) {
          activeCustomUserId = res.user.id;
          await loadGovernanceState();
        }
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ==========================================
  // Parent Admin Governance & Device Powers Logic
  // ==========================================
  let adminAuthorizedPin = null;

  if ($('gov-unlock-btn')) {
    $('gov-unlock-btn').addEventListener('click', async () => {
      const pin = $('gov-admin-pin') ? $('gov-admin-pin').value.trim() : '';
      const status = $('gov-auth-status');
      const area = $('gov-authorized-area');
      try {
        const res = await api.invoke('governance:admin-verify-pin', pin);
        if (res.ok) {
          adminAuthorizedPin = pin;
          if (status) {
            status.className = 'status ok';
            status.querySelector('.text').textContent = 'Unlocked 🛡️';
          }
          if (area) {
            area.style.opacity = '1';
            area.style.pointerEvents = 'auto';
          }
          await loadGovernanceState();
        } else {
          if (status) {
            status.className = 'status error';
            status.querySelector('.text').textContent = 'Invalid PIN';
          }
          if (area) {
            area.style.opacity = '0.4';
            area.style.pointerEvents = 'none';
          }
        }
      } catch (err) {
        if (status) {
          status.className = 'status error';
          status.querySelector('.text').textContent = err.message;
        }
      }
    });
  }

  function populateGovernanceUI() {
    if (!govState) return;

    // 1. Global Rules
    const list = $('gov-global-rules-list');
    if (list && govState.globalRules) {
      list.innerHTML = '';
      govState.globalRules.forEach((rule, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); padding:6px 10px; border-radius:6px; font-size:13px;';
        const textSpan = document.createElement('span');
        textSpan.textContent = `${idx + 1}. ${rule}`;
        textSpan.style.flex = '1';

        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Remove Rule';
        delBtn.className = 'btn plain small';
        delBtn.style.color = '#ef4444';
        delBtn.addEventListener('click', async () => {
          if (!adminAuthorizedPin) return alert('Unlock with Admin PIN first.');
          const nextRules = govState.globalRules.filter((_, i) => i !== idx);
          await api.invoke('governance:admin-update-rules', nextRules, adminAuthorizedPin);
          await loadGovernanceState();
        });

        item.appendChild(textSpan);
        item.appendChild(delBtn);
        list.appendChild(item);
      });
    }

    // 2. User Power Matrix
    const userSel = $('gov-user-select');
    if (userSel && govState.users) {
      const prevVal = userSel.value;
      userSel.innerHTML = '';
      for (const u of govState.users) {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} [${u.powerTier || 'standard'}]`;
        if (u.id === prevVal || (!prevVal && u.id === 'kid')) opt.selected = true;
        userSel.appendChild(opt);
      }
      onGovUserSelected();
    }

    // 3. Device Power Matrix
    const devSel = $('gov-device-select');
    if (devSel && govState.devices) {
      const prevVal = devSel.value;
      devSel.innerHTML = '';
      for (const d of govState.devices) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name} (${d.powerTier || 'standard'})`;
        if (d.id === prevVal) opt.selected = true;
        devSel.appendChild(opt);
      }
      onGovDeviceSelected();
    }

    const devUserSel = $('gov-device-user-select');
    if (devUserSel && govState.users) {
      devUserSel.innerHTML = '';
      for (const u of govState.users) {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        devUserSel.appendChild(opt);
      }
    }
  }

  function onGovUserSelected() {
    if (!govState || !govState.users) return;
    const userId = $('gov-user-select') ? $('gov-user-select').value : 'admin';
    const user = govState.users.find((u) => u.id === userId) || govState.users[0];
    if (!user) return;

    if ($('gov-user-tier-select')) $('gov-user-tier-select').value = user.powerTier || 'standard';
    if ($('gov-user-tier-desc') && govState.powerTiers && govState.powerTiers[user.powerTier]) {
      $('gov-user-tier-desc').textContent = govState.powerTiers[user.powerTier].description;
    }

    const perms = user.permissions || (govState.powerTiers && govState.powerTiers[user.powerTier]?.permissions) || {};
    if ($('gov-perm-terminal')) $('gov-perm-terminal').checked = Boolean(perms.canRunTerminal);
    if ($('gov-perm-screen')) $('gov-perm-screen').checked = Boolean(perms.canControlScreen);
    if ($('gov-perm-vault')) $('gov-perm-vault').checked = Boolean(perms.canAccessVault);
    if ($('gov-perm-memory')) $('gov-perm-memory').checked = Boolean(perms.canAccessScreenMemory);
    if ($('gov-perm-remote')) $('gov-perm-remote').checked = Boolean(perms.canControlRemoteDevices);
    if ($('gov-perm-purchase')) $('gov-perm-purchase').checked = Boolean(perms.canMakePurchases);

    const userRules = (govState.perUserRules && govState.perUserRules[userId]) || [];
    if ($('gov-user-rules-text')) $('gov-user-rules-text').value = userRules.join('\n');
  }

  if ($('gov-user-select')) $('gov-user-select').addEventListener('change', onGovUserSelected);

  if ($('gov-user-tier-select')) {
    $('gov-user-tier-select').addEventListener('change', (e) => {
      const tier = e.target.value;
      if (govState && govState.powerTiers && govState.powerTiers[tier]) {
        const tInfo = govState.powerTiers[tier];
        if ($('gov-user-tier-desc')) $('gov-user-tier-desc').textContent = tInfo.description;
        const perms = tInfo.permissions;
        if ($('gov-perm-terminal')) $('gov-perm-terminal').checked = Boolean(perms.canRunTerminal);
        if ($('gov-perm-screen')) $('gov-perm-screen').checked = Boolean(perms.canControlScreen);
        if ($('gov-perm-vault')) $('gov-perm-vault').checked = Boolean(perms.canAccessVault);
        if ($('gov-perm-memory')) $('gov-perm-memory').checked = Boolean(perms.canAccessScreenMemory);
        if ($('gov-perm-remote')) $('gov-perm-remote').checked = Boolean(perms.canControlRemoteDevices);
        if ($('gov-perm-purchase')) $('gov-perm-purchase').checked = Boolean(perms.canMakePurchases);
      }
    });
  }

  if ($('gov-add-rule-btn')) {
    $('gov-add-rule-btn').addEventListener('click', async () => {
      if (!adminAuthorizedPin) return alert('Unlock with Admin PIN first.');
      const text = $('gov-new-rule-text') ? $('gov-new-rule-text').value.trim() : '';
      if (!text) return;
      const current = (govState && govState.globalRules) ? [...govState.globalRules] : [];
      current.push(text);
      try {
        await api.invoke('governance:admin-update-rules', current, adminAuthorizedPin);
        if ($('gov-new-rule-text')) $('gov-new-rule-text').value = '';
        await loadGovernanceState();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if ($('gov-save-user-power-btn')) {
    $('gov-save-user-power-btn').addEventListener('click', async () => {
      if (!adminAuthorizedPin) return alert('Unlock with Admin PIN first.');
      const userId = $('gov-user-select') ? $('gov-user-select').value : null;
      if (!userId) return;
      const powerTier = $('gov-user-tier-select') ? $('gov-user-tier-select').value : 'safe_kid';
      const permissions = {
        canRunTerminal: $('gov-perm-terminal') ? $('gov-perm-terminal').checked : false,
        canControlScreen: $('gov-perm-screen') ? $('gov-perm-screen').checked : false,
        canAccessVault: $('gov-perm-vault') ? $('gov-perm-vault').checked : false,
        canAccessScreenMemory: $('gov-perm-memory') ? $('gov-perm-memory').checked : false,
        canControlRemoteDevices: $('gov-perm-remote') ? $('gov-perm-remote').checked : false,
        canMakePurchases: $('gov-perm-purchase') ? $('gov-perm-purchase').checked : false,
      };
      const rawRules = $('gov-user-rules-text') ? $('gov-user-rules-text').value.split('\n').map((r) => r.trim()).filter(Boolean) : [];
      try {
        await api.invoke('governance:admin-update-user', userId, { powerTier, permissions, rules: rawRules }, adminAuthorizedPin);
        alert(`User power settings updated for ${userId}!`);
        await loadGovernanceState();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  function onGovDeviceSelected() {
    if (!govState || !govState.devices) return;
    const devId = $('gov-device-select') ? $('gov-device-select').value : null;
    const dev = govState.devices.find((d) => d.id === devId) || govState.devices[0];
    if (!dev) return;
    if ($('gov-device-tier-select')) $('gov-device-tier-select').value = dev.powerTier || 'standard';
    if ($('gov-device-user-select')) $('gov-device-user-select').value = dev.assignedUserId || 'admin';
  }

  if ($('gov-device-select')) $('gov-device-select').addEventListener('change', onGovDeviceSelected);

  if ($('gov-save-device-power-btn')) {
    $('gov-save-device-power-btn').addEventListener('click', async () => {
      if (!adminAuthorizedPin) return alert('Unlock with Admin PIN first.');
      const devId = $('gov-device-select') ? $('gov-device-select').value : null;
      if (!devId) return;
      const powerTier = $('gov-device-tier-select') ? $('gov-device-tier-select').value : 'safe_kid';
      const assignedUserId = $('gov-device-user-select') ? $('gov-device-user-select').value : 'admin';
      try {
        await api.invoke('governance:admin-set-device-power', devId, { powerTier, assignedUserId }, adminAuthorizedPin);
        alert(`Device power settings updated for ${devId}!`);
        await loadGovernanceState();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if ($('gov-change-pin-btn')) {
    $('gov-change-pin-btn').addEventListener('click', async () => {
      const curPin = $('gov-admin-pin') ? $('gov-admin-pin').value.trim() : '';
      const newPin = $('gov-new-pin-input') ? $('gov-new-pin-input').value.trim() : '';
      if (!curPin) return alert('Enter current Admin PIN first.');
      if (!newPin || newPin.length < 4) return alert('New PIN must be at least 4 digits.');
      try {
        await api.invoke('governance:admin-change-pin', curPin, newPin);
        alert('Master Admin PIN successfully changed!');
        if ($('gov-admin-pin')) $('gov-admin-pin').value = newPin;
        if ($('gov-new-pin-input')) $('gov-new-pin-input').value = '';
        adminAuthorizedPin = newPin;
      } catch (err) {
        alert(err.message);
      }
    });
  }

  loadGovernanceState();

  show(new URLSearchParams(location.search).get('section') || 'home');
})();
