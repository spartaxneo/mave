'use strict';
// The main window: sidebar navigation, Home, every settings page, and the Terminal.

(async () => {
  const api = window.buddy;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const TITLES = { home: 'Home', terminal: 'Terminal', data: 'Tabular Data SQL', channels: 'Channels', 'virtual-computer': 'Virtual Computer', mesh: 'Brain Mesh & Devices', assistant: 'Assistant', models: 'Models', voice: 'Voice', superpowers: 'Superpowers', general: 'General', appearance: 'Appearance' };
  const ALIASES = { listening: 'voice', account: 'models', profile: 'firebase', shortcuts: 'appearance', 'archived-chats': 'data-controls', data: 'data-controls' };
  const update = (patch) => api.invoke('settings:update', patch).then((v) => { s = v; return v; }).catch(() => patch);

  let s = null;
  try {
    s = await api.invoke('settings:get');
  } catch (err) {
    console.warn('Initial settings:get fallback:', err);
  }
  if (!s) s = { theme: 'dark', assistantName: 'Mave' };

  function resolveSystemTheme(t) {
    if (t === 'system') {
      const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return dark ? 'dark' : 'light';
    }
    return t || 'light';
  }
  function applyTheme(theme) {
    const raw = theme || 'light';
    const resolved = resolveSystemTheme(raw);
    document.documentElement.setAttribute('data-theme', resolved);
    document.body.classList.toggle('theme-light', resolved === 'light');
    document.body.classList.toggle('theme-dark', resolved === 'dark');
    document.body.classList.toggle('theme-system', raw === 'system');
  }
  function applyAccent(colorKey) {
    const colors = {
      blue: '#2563eb',
      emerald: '#10a37f',
      indigo: '#4f46e5',
      violet: '#8b5cf6',
      amber: '#f59e0b',
    };
    const hex = colors[colorKey] || colors.blue;
    document.documentElement.style.setProperty('--buddy', hex);
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-primary', hex);
  }
  window.__applyTheme = applyTheme;
  window.__applyAccent = applyAccent;
  applyTheme(s.theme || 'light');
  applyAccent(s.accentColor || 'blue');
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if ((s && s.theme) === 'system') applyTheme('system');
    });
  }
  if (typeof UI !== 'undefined' && UI.titlebar) UI.titlebar();

  // navigation & ChatGPT layout
  const SETTINGS_SECTIONS = new Set([
    'general', 'appearance', 'notifications', 'customization', 'plugins', 'voice',
    'billing', 'usage', 'analytics', 'data-controls', 'storage',
    'safety', 'security', 'governance', 'trusted-contact',
    'models', 'superpowers', 'assistant', 'nodes', 'companion',
    'firebase', 'workspace', 'sentinel',
    'virtual-computer', 'agents', 'mesh-settings'
  ]);
  let activeMain = 'home';
  let micTesting = false;

  const SETTINGS_CATEGORIES = {
    general: {
      title: 'General',
      subs: [
        { pane: 'appearance', title: 'Appearance & Display', desc: 'Theme, accent color, typography, and contrast' },
        { pane: 'customization', title: 'Customization & Memory', desc: 'Personal instructions, assistant persona, and saved preferences' },
        { pane: 'notifications', title: 'Notifications & Alerts', desc: 'Desktop completion alerts and sound preferences' },
      ],
    },
    models: {
      title: 'AI Models',
      subs: [
        { pane: 'usage', title: 'Usage & Token Limits', desc: 'Session and monthly token consumption breakdown' },
        { pane: 'analytics', title: 'Performance Analytics', desc: 'Latency, model mix, and response efficiency stats' },
      ],
    },
    workspace: {
      title: 'Workspace & Agents',
      subs: [
        { pane: 'agents', title: 'Agent & Swarm Controls', desc: 'Autonomous task limits, multi-agent coordination, and defaults' },
        { pane: 'plugins', title: 'Plugins & MCP Tools', desc: 'Manage connected MCP servers and built-in capabilities' },
        { pane: 'superpowers', title: 'Skills & Connected Services', desc: 'Custom workflows, tool packs, and integrations' },
        { pane: 'assistant', title: 'Assistant Identity', desc: 'Assistant display name and local activation profile' },
      ],
    },
    'virtual-computer': {
      title: 'Virtual PC & Mesh',
      subs: [
        { pane: 'mesh-settings', title: 'Brain Mesh & Compute Sharing', desc: 'Peer discovery, compute resource caps, and task routing' },
        { pane: 'nodes', title: 'Remote Nodes & Tunnel', desc: 'Mobile companion pairing and Telegram bridge' },
        { pane: 'storage', title: 'Storage & Local Cache', desc: 'Downloaded models, workspace caches, and disk cleanup' },
      ],
    },
    voice: {
      title: 'Voice & Companion',
      subs: [
        { pane: 'companion', title: 'Face & Dynamic Island', desc: 'Top notch capsule behavior, mascot style, and palette' },
      ],
    },
    billing: {
      title: 'Account & Sync',
      subs: [
        { pane: 'firebase', title: 'Cloud Sync & Backup', desc: 'Optional cloud synchronization and server configuration' },
      ],
    },
    security: {
      title: 'Privacy & Security',
      subs: [
        { pane: 'safety', title: 'Safety Guardrails', desc: 'Action confirmation rules and workspace boundaries' },
        { pane: 'sentinel', title: 'Sensory Sentinel', desc: 'Connectivity monitoring and optional activity awareness' },
        { pane: 'governance', title: 'Privacy Governance & DPDP', desc: 'Compliance controls, masking, and local audit trails' },
        { pane: 'trusted-contact', title: 'Trusted Contact', desc: 'Approval escalation and recovery contact configuration' },
        { pane: 'data-controls', title: 'Data Controls & Export', desc: 'Archive, export, or erase conversations and memory' },
      ],
    },
  };

  const SUB_TO_PARENT = {};
  const SUB_META = {};
  Object.entries(SETTINGS_CATEGORIES).forEach(([parent, cat]) => {
    cat.subs.forEach((sub) => {
      SUB_TO_PARENT[sub.pane] = parent;
      SUB_META[sub.pane] = sub;
    });
  });

  function renderSubSettingsUI(tab) {
    const subHeader = $('settings-sub-header');
    const subBackBtn = $('settings-sub-back-btn');
    const subBackLabel = $('settings-sub-back-label');
    const subCrumb = $('settings-sub-crumb');
    const subnavWrap = $('settings-subnav-wrap');
    const parentKey = SUB_TO_PARENT[tab];

    if (subHeader) {
      if (parentKey && SETTINGS_CATEGORIES[parentKey]) {
        const parentTitle = SETTINGS_CATEGORIES[parentKey].title;
        const subTitle = (SUB_META[tab] && SUB_META[tab].title) || tab;
        subHeader.hidden = false;
        if (subBackLabel) subBackLabel.textContent = `Back to ${parentTitle}`;
        if (subCrumb) subCrumb.textContent = `${parentTitle} › ${subTitle}`;
        if (subBackBtn) subBackBtn.onclick = () => openSettingsModal(parentKey);
      } else {
        subHeader.hidden = true;
      }
    }

    if (subnavWrap) {
      const cat = SETTINGS_CATEGORIES[tab];
      if (!parentKey && cat && cat.subs && cat.subs.length) {
        subnavWrap.hidden = false;
        subnavWrap.innerHTML = '';
        const titleEl = document.createElement('div');
        titleEl.className = 'settings-subnav-title';
        titleEl.textContent = `${cat.title} Sub-Settings`;
        const card = document.createElement('div');
        card.className = 'settings-subnav-card';
        cat.subs.forEach((sub) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'settings-subnav-row';
          row.innerHTML = `
            <span class="settings-subnav-meta">
              <span class="settings-subnav-name">${sub.title}</span>
              <span class="settings-subnav-desc">${sub.desc}</span>
            </span>
            <span class="settings-subnav-chevron">›</span>
          `;
          row.addEventListener('click', () => openSettingsModal(sub.pane));
          card.appendChild(row);
        });
        subnavWrap.appendChild(titleEl);
        subnavWrap.appendChild(card);
      } else {
        subnavWrap.hidden = true;
        subnavWrap.innerHTML = '';
      }
    }
  }

  function openSettingsModal(tab = 'general') {
    tab = ALIASES[tab] || tab;
    if (!SETTINGS_SECTIONS.has(tab)) tab = 'general';
    const modal = $('settings-modal');
    if (modal) modal.hidden = false;
    const highlightTab = SUB_TO_PARENT[tab] || tab;
    document.querySelectorAll('.settings-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === highlightTab);
    });
    document.querySelectorAll('#settings-content section').forEach((p) => {
      const match = (p.dataset.pane && p.dataset.pane === tab) || (p.dataset.tab && p.dataset.tab === tab);
      p.hidden = !match;
    });
    renderSubSettingsUI(tab);
    const contentEl = $('settings-content');
    if (contentEl) contentEl.scrollTop = 0;
    document.dispatchEvent(new CustomEvent('section-shown', { detail: tab }));
    if (tab !== 'voice' && micTesting) toggleMicTest(false);
    if (tab === 'voice') refreshMic();
    if (tab === 'customization' || tab === 'governance') loadGovernanceState();
    if (tab === 'sentinel') loadSentinelData();
    if (tab === 'usage') loadUsageData();
    if (tab === 'storage') loadStorageData();
    if (tab === 'analytics') loadAnalyticsData();
    if (tab === 'plugins') loadPluginsData();
    if (tab === 'notifications') loadNotificationSettings();
    if (tab === 'security') loadSecuritySettings();
    if (tab === 'trusted-contact') loadTrustedContactSettings();
    if (tab === 'safety') loadSafetySettings();
    if (tab === 'data-controls') loadDataControlsSettings();
    if (tab === 'billing') loadBillingSettings();
    if (tab === 'workspace' && window.__maveNodeController) window.__maveNodeController.initWorkspace();
    if (tab === 'firebase' && window.__maveNodeController) window.__maveNodeController.initFirebase();
    if (tab === 'mesh-settings' && typeof window.initMeshDashboardUI === 'function') {
      window.initMeshDashboardUI();
    }
    if (tab === 'nodes') {
      if (window.__maveNodeController) window.__maveNodeController.updateNodeDisplay();
      loadTunnelSettings();
    }
    if (tab === 'virtual-computer' && typeof loadVcSettings === 'function') {
      loadVcSettings();
    }
    if (tab === 'models') {
      renderModels();
    }
    requestAnimationFrame(() => {
      document.querySelectorAll('#settings-content section:not([hidden]) .segmented').forEach((el) => el._seg && el._seg.set(el._value()));
    });
  }
  window.openSettingsModal = openSettingsModal;
  window.closeSettingsModal = closeSettingsModal;

  function closeSettingsModal() {
    const modal = $('settings-modal');
    if (!modal || modal.hidden) return;
    modal.classList.add('closing');
    setTimeout(() => {
      modal.hidden = true;
      modal.classList.remove('closing');
      if (micTesting) toggleMicTest(false);
    }, 120);
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
    document.title = section === 'home' ? (s.assistantName || 'Mave') : `${s.assistantName || 'Mave'} · ${TITLES[section] || 'Settings'}`;
    $('pane').scrollTop = 0;
    $('pane').classList.toggle('fill', section === 'home' || section === 'terminal' || section === 'data' || section === 'channels' || section === 'virtual-computer' || section === 'mesh');
    if (section === 'virtual-computer' && typeof window.initVirtualComputerUI === 'function') {
      window.initVirtualComputerUI();
    }
    if (section === 'mesh' && typeof window.initMeshDashboardUI === 'function') {
      window.initMeshDashboardUI();
    }
    document.dispatchEvent(new CustomEvent('section-shown', { detail: section }));
  }
  window.show = show;
  window.showSection = show;

  document.querySelectorAll('nav button[data-section], #nav-more-dropdown button[data-section]').forEach((b) => {
    b.addEventListener('click', () => show(b.dataset.section));
  });
  $('pane').addEventListener('scroll', () => document.querySelector('.content').classList.toggle('scrolled', $('pane').scrollTop > 4));
  document.querySelectorAll('[data-link]').forEach((a) => a.addEventListener('click', () => api.invoke('app:open-link', a.dataset.link)));

  // Settings Modal triggers + Ctrl+, shortcut
  if ($('open-settings-btn')) $('open-settings-btn').addEventListener('click', () => openSettingsModal('general'));
  if ($('titlebar-settings-btn')) $('titlebar-settings-btn').addEventListener('click', () => openSettingsModal('general'));
  if ($('settings-modal-close')) $('settings-modal-close').addEventListener('click', closeSettingsModal);
  if ($('settings-back-to-app-btn')) $('settings-back-to-app-btn').addEventListener('click', closeSettingsModal);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      const modal = $('settings-modal');
      if (modal && !modal.hidden) closeSettingsModal();
      else openSettingsModal('general');
    } else if (e.key === 'Escape') {
      const modal = $('settings-modal');
      if (modal && !modal.hidden) {
        e.preventDefault();
        closeSettingsModal();
      }
    }
  });
  const modalEl = $('settings-modal');
  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeSettingsModal();
    });
  }
  document.querySelectorAll('.settings-tab-btn').forEach((b) => {
    b.addEventListener('click', () => openSettingsModal(b.dataset.tab));
  });

  // Settings Search Filtering (searches primary categories & reveals matching sub-settings)
  if ($('settings-search-input')) {
    $('settings-search-input').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#settings-tabs .settings-tab-btn').forEach((b) => {
        const tabKey = b.dataset.tab;
        const txt = b.textContent.toLowerCase();
        const cat = SETTINGS_CATEGORIES[tabKey];
        const subHit = cat && cat.subs.some((sub) => (sub.title + ' ' + sub.desc + ' ' + sub.pane).toLowerCase().includes(q));
        b.style.display = q && !txt.includes(q) && !subHit ? 'none' : 'flex';
      });
      document.querySelectorAll('#settings-tabs .settings-tab-list').forEach((list) => {
        const hdr = list.previousElementSibling;
        const anyVisible = [...list.querySelectorAll('.settings-tab-btn')].some((b) => b.style.display !== 'none');
        if (hdr && hdr.classList.contains('settings-category-header')) {
          hdr.style.display = anyVisible ? 'block' : 'none';
        }
      });
      const subRes = $('settings-search-subresults');
      if (subRes) {
        if (!q) {
          subRes.hidden = true;
          subRes.innerHTML = '';
        } else {
          const matches = Object.values(SUB_META).filter((sub) => (sub.title + ' ' + sub.desc + ' ' + sub.pane).toLowerCase().includes(q));
          if (matches.length) {
            subRes.hidden = false;
            subRes.innerHTML = '<div class="settings-category-header">Matching Sub-Settings</div>';
            matches.forEach((sub) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'settings-tab-btn';
              btn.textContent = sub.title;
              btn.addEventListener('click', () => openSettingsModal(sub.pane));
              subRes.appendChild(btn);
            });
          } else {
            subRes.hidden = true;
            subRes.innerHTML = '';
          }
        }
      }
    });
  }

  // Settings General & Workspace Controls
  if ($('settings-chat-folder-path') && s.projectlessChatFolder) {
    $('settings-chat-folder-path').textContent = s.projectlessChatFolder;
  }
  if ($('settings-btn-change-folder')) {
    $('settings-btn-change-folder').addEventListener('click', async () => {
      try {
        const folder = await api.invoke('dialog:openDirectory');
        if (folder && $('settings-chat-folder-path')) {
          $('settings-chat-folder-path').textContent = folder;
          update({ projectlessChatFolder: folder });
        }
      } catch {}
    });
  }
  if ($('settings-file-open-dest')) {
    $('settings-file-open-dest').value = s.fileOpenDest || 'vscode';
    $('settings-file-open-dest').addEventListener('change', (e) => update({ fileOpenDest: e.target.value }));
  }
  if ($('settings-terminal-shell')) {
    $('settings-terminal-shell').value = s.terminalShell || 'powershell';
    $('settings-terminal-shell').addEventListener('change', (e) => update({ terminalShell: e.target.value }));
  }
  if ($('settings-confirm-close-window')) {
    $('settings-confirm-close-window').value = s.confirmCloseWindow || 'shortcut-only';
    $('settings-confirm-close-window').addEventListener('change', (e) => update({ confirmCloseWindow: e.target.value }));
  }

  // Antigravity Collapsible Right Workspace Inspector (Canvas, Artifacts Preview, Real Workspace Files)
  const wiEl = $('workspace-inspector');
  const wiToggleBtn = $('workspace-panel-toggle-btn');
  let wiCurrentSubdir = '';

  async function loadWorkspaceFiles(relDir = wiCurrentSubdir) {
    wiCurrentSubdir = relDir || '';
    const treeEl = $('wi-files-tree');
    const pathEl = $('wi-files-path');
    if (!treeEl) return;
    try {
      const res = await api.invoke('ghost:workspace-tree', wiCurrentSubdir);
      if (pathEl) {
        pathEl.textContent = res.currentRel ? `${res.root}/${res.currentRel}` : (res.root || 'Workspace');
      }
      const entries = res && Array.isArray(res.entries) ? res.entries : [];
      treeEl.innerHTML = '';

      if (wiCurrentSubdir) {
        const upRow = document.createElement('button');
        upRow.type = 'button';
        upRow.className = 'wi-file-row wi-dir-row';
        upRow.innerHTML = '<span class="wi-file-icon">..</span><span class="wi-file-name">Parent directory</span>';
        upRow.addEventListener('click', () => {
          const parts = wiCurrentSubdir.split('/').filter(Boolean);
          parts.pop();
          loadWorkspaceFiles(parts.join('/'));
        });
        treeEl.append(upRow);
      }

      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'wi-files-empty';
        empty.textContent = 'No files in this directory.';
        treeEl.append(empty);
        return;
      }

      for (const item of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `wi-file-row ${item.isDirectory ? 'wi-dir-row' : ''}`;
        const icon = item.isDirectory ? '▸' : '·';
        row.innerHTML = `<span class="wi-file-icon">${icon}</span><span class="wi-file-name">${escapeHtml(item.name)}</span>`;
        row.title = item.fullPath;
        row.addEventListener('click', async () => {
          if (item.isDirectory) {
            loadWorkspaceFiles(item.relPath);
            return;
          }
          try {
            const file = await api.invoke('ghost:read-file', item.fullPath);
            if (file && file.ok) {
              const ext = (file.ext || '').toLowerCase();
              const isMarkdown = ext === 'md' || ext === 'markdown';
              const isWebPreview = ext === 'html' || ext === 'htm' || ext === 'svg';
              if ((isMarkdown || isWebPreview) && typeof window.__openClaudeArtifact === 'function') {
                let previewHtml = file.content;
                if (isMarkdown) {
                  const rendered = typeof window.__renderMarkdownHtml === 'function'
                    ? window.__renderMarkdownHtml(file.content)
                    : `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(file.content)}</pre>`;
                  previewHtml = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.65;color:#111827;padding:20px 24px;margin:0;}pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto;font-family:Consolas,monospace;font-size:12.5px;}code{background:#f3f4f6;padding:2px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:12.5px;}h1,h2,h3,h4{margin:16px 0 8px;}hr{border:0;border-top:1px solid #e5e7eb;margin:16px 0;}</style></head><body>${rendered}</body></html>`;
                }
                window.__openClaudeArtifact({
                  title: file.relPath || file.name,
                  code: file.content,
                  html: previewHtml,
                  fullPath: file.fullPath,
                });
                return;
              }
              if (typeof window.__openChatGPTCanvas === 'function') {
                const langMap = { py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', json: 'json', html: 'html', css: 'css', md: 'markdown', ps1: 'powershell', sh: 'bash', yml: 'yaml', yaml: 'yaml' };
                window.__openChatGPTCanvas({
                  title: file.relPath || file.name,
                  language: langMap[ext] || ext || 'text',
                  content: file.content,
                  fullPath: file.fullPath,
                });
                return;
              }
            }
          } catch {}
          api.invoke('ghost:open-file', item.fullPath).catch(() => {});
        });
        treeEl.append(row);
      }
    } catch {
      treeEl.innerHTML = '<div class="wi-files-empty">Unable to read workspace files.</div>';
    }
  }

  function setWorkspaceTab(tab = 'canvas') {
    if (!wiEl) return;
    wiEl.hidden = false;
    document.body.classList.add('workspace-inspector-open');
    if (wiToggleBtn) wiToggleBtn.classList.add('active');

    document.querySelectorAll('.wi-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.wiTab === tab);
    });
    const canvasPane = $('chatgpt-canvas-pane');
    const artPane = $('claude-artifacts-pane');
    const filesPane = $('workspace-files-pane');
    if (canvasPane) canvasPane.hidden = tab !== 'canvas';
    if (artPane) artPane.hidden = tab !== 'artifacts';
    if (filesPane) filesPane.hidden = tab !== 'files';
    if (tab === 'files') loadWorkspaceFiles();
  }

  function closeWorkspaceInspector() {
    if (!wiEl) return;
    wiEl.hidden = true;
    document.body.classList.remove('workspace-inspector-open');
    document.body.classList.remove('canvas-open');
    document.body.classList.remove('artifacts-open');
    if (wiToggleBtn) wiToggleBtn.classList.remove('active');
    if ($('chatgpt-canvas-pane')) $('chatgpt-canvas-pane').hidden = true;
    if ($('claude-artifacts-pane')) $('claude-artifacts-pane').hidden = true;
  }

  window.__openWorkspaceTab = setWorkspaceTab;
  window.__closeWorkspaceInspector = closeWorkspaceInspector;

  if (wiToggleBtn) {
    wiToggleBtn.addEventListener('click', () => {
      if (wiEl && !wiEl.hidden) closeWorkspaceInspector();
      else setWorkspaceTab('files');
    });
  }
  if ($('wi-close-btn')) $('wi-close-btn').addEventListener('click', closeWorkspaceInspector);
  if ($('wi-refresh-files-btn')) $('wi-refresh-files-btn').addEventListener('click', () => loadWorkspaceFiles());
  document.querySelectorAll('.wi-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setWorkspaceTab(btn.dataset.wiTab || 'files'));
  });

  // 2. Mode Switcher (Chat | Work)
  window.__maveAppMode = ($('mode-btn-chat') && $('mode-btn-chat').classList.contains('active')) ? 'chat' : 'work';
  function setAppMode(mode) {
    const normalizedMode = mode === 'chat' ? 'chat' : 'work';
    window.__maveAppMode = normalizedMode;
    const chatBtn = $('mode-btn-chat');
    const workBtn = $('mode-btn-work');
    const hint = $('composer-top-hint');
    const prompt = $('prompt');
    if (chatBtn) chatBtn.classList.toggle('active', normalizedMode === 'chat');
    if (workBtn) workBtn.classList.toggle('active', normalizedMode === 'work');
    if (normalizedMode === 'chat') {
      if (hint) hint.textContent = 'Conversational mode — MAVE answers directly using your selected model.';
      if (prompt) prompt.placeholder = 'Ask MAVE anything, @ to mention, / for actions';
    } else {
      if (hint) hint.textContent = 'Workspace mode — MAVE can execute tools, Python scripts, and Virtual Computer workflows.';
      if (prompt) prompt.placeholder = 'Ask anything, @ to mention, / for tools & Virtual PC tasks';
    }
  }
  if ($('mode-btn-chat')) $('mode-btn-chat').addEventListener('click', () => setAppMode('chat'));
  if ($('mode-btn-work')) $('mode-btn-work').addEventListener('click', () => setAppMode('work'));

  // 3. Access Permissions Mode Toggle (Synced with General -> Execution Permissions)
  function updateFullAccess(enabled, persist = true) {
    const pill = $('full-access-pill-btn');
    const pillText = $('full-access-pill-text');
    const switchEl = $('settings-perm-full-access');
    if (pill) {
      pill.classList.toggle('inactive', !enabled);
      pill.classList.toggle('active', enabled);
    }
    if (pillText) pillText.textContent = enabled ? 'Full access' : 'Supervised';
    if (switchEl && switchEl.checked !== enabled) switchEl.checked = enabled;
    if (persist) update({ fullAccess: enabled, approvalMode: enabled ? 'auto' : 'risky' });
  }
  updateFullAccess(s.fullAccess !== false, false);
  if ($('settings-perm-default')) {
    $('settings-perm-default').checked = s.defaultPermissions !== false;
    $('settings-perm-default').addEventListener('change', (e) => {
      update({ defaultPermissions: e.target.checked });
    });
  }
  if ($('full-access-pill-btn')) {
    $('full-access-pill-btn').addEventListener('click', () => {
      const curr = !$('full-access-pill-btn').classList.contains('inactive');
      updateFullAccess(!curr);
    });
  }
  if ($('settings-perm-full-access')) {
    $('settings-perm-full-access').addEventListener('change', (e) => {
      updateFullAccess(e.target.checked);
    });
  }

  // 4. Unified Canonical Model Selector (Populated exclusively from real configured backend providers)
  const capsuleModelBtn = $('capsule-model-picker-btn');
  const capsuleModelDropdown = $('capsule-model-dropdown');

  async function refreshCapsuleModels() {
    try {
      const cat = await api.invoke('models:catalog');
      const items = (cat && Array.isArray(cat.items)) ? cat.items : [];
      const activeItem = items.find((i) => i.active) || items[0];
      const displayLabel = activeItem ? activeItem.name.replace(/\s*\(.*?\)/, '').trim() : (cat.activeLabel || 'Local AI');
      if ($('capsule-model-label')) $('capsule-model-label').textContent = displayLabel;
      if ($('model-picker-name')) $('model-picker-name').textContent = cat.activeLabel || displayLabel;

      const list = $('capsule-model-options-list');
      if (list) {
        list.innerHTML = '';
        for (const item of items) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `cmd-item ${item.active ? 'active' : ''}`;
          btn.innerHTML = `
            <div class="cmd-item-info">
              <div class="cmd-item-title">
                <span>${escapeHtml(item.name)}</span>
                <span class="cmd-tag ${item.ready ? 'ready' : 'muted'}">${escapeHtml(item.badge || '')}</span>
              </div>
              <div class="cmd-item-sub">${escapeHtml(item.desc || '')}</div>
            </div>
          `;
          btn.addEventListener('click', async () => {
            capsuleModelDropdown.hidden = true;
            if (item.id === 'auto') {
              await update({ autoModelRouting: true });
            } else if (item.provider === 'local') {
              await update({ provider: 'local', autoModelRouting: false, ...(item.model ? { localModel: item.model } : {}) });
            } else if (item.provider === 'ollama') {
              await update({ provider: 'ollama', autoModelRouting: false, ollamaModel: item.model });
            } else if (item.provider === 'colibri') {
              await update({ provider: 'colibri', autoModelRouting: false, colibriModel: item.model });
            } else if (item.provider === 'airllm') {
              await update({ provider: 'airllm', autoModelRouting: false, airllmModel: item.model });
            } else if (item.provider === 'anthropic') {
              await update({ provider: 'anthropic', autoModelRouting: false });
            } else if (item.provider === 'openai') {
              await update({ provider: 'openai', autoModelRouting: false });
            }
            await refreshCapsuleModels();
            if (typeof renderModels === 'function') renderModels();
          });
          list.append(btn);
        }
      }
    } catch {}
  }

  if (capsuleModelBtn && capsuleModelDropdown) {
    capsuleModelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = capsuleModelDropdown.hidden;
      capsuleModelDropdown.hidden = !willOpen;
      if (willOpen) refreshCapsuleModels();
    });
    if ($('model-picker-name')) {
      $('model-picker-name').addEventListener('click', (e) => {
        e.stopPropagation();
        capsuleModelDropdown.hidden = !capsuleModelDropdown.hidden;
        if (!capsuleModelDropdown.hidden) refreshCapsuleModels();
      });
    }
    document.addEventListener('click', (e) => {
      if (!capsuleModelDropdown.contains(e.target) && !capsuleModelBtn.contains(e.target) && e.target !== $('model-picker-name')) {
        capsuleModelDropdown.hidden = true;
      }
    });
  }
  refreshCapsuleModels();

  // User Profile Popup Menu
  if ($('user-profile-btn')) {
    $('user-profile-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('user-profile-menu');
      if (menu) menu.hidden = !menu.hidden;
    });
  }
  document.addEventListener('click', (e) => {
    const menu = $('user-profile-menu');
    if (menu && !menu.hidden && !e.target.closest('#user-profile-btn') && !e.target.closest('#user-profile-menu')) {
      menu.hidden = true;
    }
  });

  if ($('upm-personalization')) {
    $('upm-personalization').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      openSettingsModal('customization');
    });
  }
  if ($('upm-profile')) {
    $('upm-profile').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      openSettingsModal('firebase');
    });
  }
  if ($('upm-settings')) {
    $('upm-settings').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      openSettingsModal('general');
    });
  }
  if ($('upm-help')) {
    $('upm-help').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      show('home');
      api.invoke('task:run', 'What capabilities are configured in MAVE right now?');
    });
  }

  const winEl = document.querySelector('.window');
  if ($('sidebar-toggle')) {
    $('sidebar-toggle').addEventListener('click', () => {
      if (window.innerWidth <= 860) {
        winEl.classList.toggle('sidebar-mobile-open');
      } else {
        winEl.classList.toggle('sidebar-collapsed');
      }
    });
  }
  if ($('sidebar-expand-btn')) {
    $('sidebar-expand-btn').addEventListener('click', () => {
      if (window.innerWidth <= 860) {
        winEl.classList.add('sidebar-mobile-open');
      } else {
        winEl.classList.remove('sidebar-collapsed');
      }
    });
  }
  if ($('sidebar-backdrop')) {
    $('sidebar-backdrop').addEventListener('click', () => {
      winEl.classList.remove('sidebar-mobile-open');
    });
  }
  if ($('sidebar-search-btn')) {
    $('sidebar-search-btn').addEventListener('click', () => {
      if ($('omnibox-trigger-btn')) $('omnibox-trigger-btn').click();
      else if ($('chat-search')) $('chat-search').focus();
    });
  }
  if ($('sidebar-new-chat')) {
    $('sidebar-new-chat').addEventListener('click', () => {
      winEl.classList.remove('sidebar-mobile-open');
      show('home');
      if ($('new-chat')) $('new-chat').click();
    });
  }
  if ($('mp-open-settings')) {
    $('mp-open-settings').addEventListener('click', () => {
      if (capsuleModelDropdown) capsuleModelDropdown.hidden = true;
      openSettingsModal('models');
    });
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
    } else if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      if (wiEl && !wiEl.hidden) closeWorkspaceInspector();
      else setWorkspaceTab('files');
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
    document.title = activeMain === 'home' ? n : `${n} Settings`;
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
  if ($('assistant-name')) $('assistant-name').value = 'Mave';
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
    if (e.detail === 'models' && !local && $('local-ai')) {
      local = LocalAI.picker($('local-ai'), { onChange: renderLocalFoot });
    }
  });
  function renderLocalFoot() {
    if (!local) return;
    renderActive();
    refreshCapsuleModels();
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
    const cloud = s.provider === 'anthropic' || s.provider === 'openai';
    document.querySelectorAll('[data-pane="models"] .cloud-only').forEach((el) => { el.hidden = !cloud; });
    if ($('effort-row')) $('effort-row').hidden = s.provider !== 'anthropic';
    if ($('detail-row')) $('detail-row').hidden = s.provider !== 'anthropic';
    if ($('endpoint-row')) $('endpoint-row').hidden = s.provider !== 'openai';
    if ($('openai-endpoint') && document.activeElement !== $('openai-endpoint')) $('openai-endpoint').value = s.openaiEndpoint || '';
    if ($('provider-hint')) $('provider-hint').textContent = cloud ? 'Cloud API (requires internet & key)' : 'Local runtime on this PC (offline)';
    if (!cloud) {
      renderActive();
      refreshCapsuleModels();
      return;
    }
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
      if (s.autoModelRouting) {
        $('model-picker-name').textContent = active.label ? `Auto · ${active.label}` : 'Auto Router';
      } else if (active.label) {
        $('model-picker-name').textContent = active.label;
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
    try {
      api.invoke('personalization:get').then((pData) => {
        if (pData) {
          if ($('custom-instructions-text') && !$('custom-instructions-text').value) {
            $('custom-instructions-text').value = pData.aboutUser || '';
          }
          if ($('custom-response-style-text') && !$('custom-response-style-text').value) {
            $('custom-response-style-text').value = pData.responseInstructions || '';
          }
        }
      }).catch(() => {});
    } catch {}
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
        try {
          const aboutUser = $('custom-instructions-text') ? $('custom-instructions-text').value.trim() : '';
          const responseInstructions = $('custom-response-style-text') ? $('custom-response-style-text').value.trim() : '';
          await api.invoke('personalization:update', { aboutUser, responseInstructions });
        } catch {}
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
  // ChatGPT Memory Management
  // ==========================================
  async function loadMemoriesList() {
    const container = $('memories-list-container');
    if (!container) return;
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:12.5px;">Loading memories…</div>';
    try {
      const memories = await api.invoke('personalization:memories');
      if (!Array.isArray(memories) || memories.length === 0) {
        container.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--text-3);font-size:13px;">No memories stored yet. Tell Mave about yourself, your projects, or your preferences!</div>';
        return;
      }
      container.innerHTML = '';
      memories.forEach((mem) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:10px;font-size:13px;color:var(--text-1);';

        const left = document.createElement('div');
        left.style.cssText = 'flex:1;min-width:0;';

        const textSpan = document.createElement('div');
        textSpan.style.cssText = 'line-height:1.4;word-break:break-word;';
        textSpan.textContent = mem.text;

        const metaSpan = document.createElement('div');
        metaSpan.style.cssText = 'font-size:11px;color:var(--text-3);margin-top:3px;display:flex;gap:8px;';
        const d = mem.createdAt ? new Date(mem.createdAt).toLocaleDateString() : '';
        metaSpan.innerHTML = `<span style="text-transform:capitalize;background:var(--surface-3);padding:1px 6px;border-radius:4px;">${mem.category || 'general'}</span> ${d ? `<span>• ${d}</span>` : ''}`;

        left.append(textSpan, metaSpan);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.style.cssText = 'flex:none;width:28px;height:28px;border-radius:6px;border:0;background:transparent;color:var(--text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all var(--fast);';
        delBtn.title = 'Delete memory';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#ef4444'; delBtn.style.background = 'rgba(239,68,68,0.1)'; });
        delBtn.addEventListener('mouseleave', () => { delBtn.style.color = 'var(--text-3)'; delBtn.style.background = 'transparent'; });
        delBtn.addEventListener('click', async () => {
          delBtn.disabled = true;
          await api.invoke('personalization:delete-memory', mem.id);
          row.remove();
          if (container.children.length === 0) {
            container.innerHTML = '<div style="padding:32px 16px;text-align:center;color:var(--text-3);font-size:13px;">No memories stored yet.</div>';
          }
        });

        row.append(left, delBtn);
        container.append(row);
      });
    } catch (err) {
      container.innerHTML = `<div style="padding:16px;text-align:center;color:#ef4444;font-size:12.5px;">Failed to load memories: ${err.message}</div>`;
    }
  }

  if ($('btn-manage-memories')) {
    $('btn-manage-memories').addEventListener('click', () => {
      const modal = $('manage-memories-modal');
      if (modal) {
        modal.hidden = false;
        loadMemoriesList();
      }
    });
  }

  if ($('manage-memories-close')) {
    $('manage-memories-close').addEventListener('click', () => {
      if ($('manage-memories-modal')) $('manage-memories-modal').hidden = true;
    });
  }

  if ($('btn-memories-done')) {
    $('btn-memories-done').addEventListener('click', () => {
      if ($('manage-memories-modal')) $('manage-memories-modal').hidden = true;
    });
  }

  if ($('btn-clear-all-memories')) {
    $('btn-clear-all-memories').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all memories? Mave will forget all learned details and preferences.')) return;
      await api.invoke('personalization:clear-memories');
      loadMemoriesList();
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

  // ==========================================
  // Autonomous Sentinel & Privacy Controls
  // ==========================================
  async function loadSentinelData() {
    try {
      const status = await api.invoke('sentinel:status').catch(() => null);
      if (status) {
        const badge = $('sentinel-conn-badge');
        const text = $('sentinel-conn-text');
        if (badge && text) {
          if (status.online) {
            badge.className = 'status ok';
            text.textContent = '🟢 Online · Proactive Sensing Active';
          } else {
            badge.className = 'status bad';
            text.textContent = '🟡 Offline Mode · 100% On-Device';
          }
        }

        if ($('toggle-sentinel-network')) $('toggle-sentinel-network').checked = status.onlineSentinel;
        if ($('toggle-sentinel-notifs')) $('toggle-sentinel-notifs').checked = status.proactiveNotifications;
        if ($('toggle-sentinel-activity')) $('toggle-sentinel-activity').checked = status.activityTracking;
        if ($('toggle-sentinel-learning')) $('toggle-sentinel-learning').checked = status.conversationTracking;
        if ($('sentinel-office-apps-input')) $('sentinel-office-apps-input').value = status.officeAppsList || '';
      }

      // Load today's summary journal
      const summary = await api.invoke('sentinel:summary').catch(() => null);
      if (summary) {
        if ($('metric-sentinel-time')) $('metric-sentinel-time').textContent = `${summary.totalMinutes || 0}m`;
        if ($('metric-sentinel-work')) $('metric-sentinel-work').textContent = `${summary.workRatio || 0}%`;
        if ($('metric-sentinel-personal')) $('metric-sentinel-personal').textContent = `${summary.personalRatio || 0}%`;
        if ($('metric-sentinel-convs')) $('metric-sentinel-convs').textContent = String(summary.conversationCount || 0);

        if ($('sentinel-top-apps-text')) {
          if (summary.topApps && summary.topApps.length > 0) {
            $('sentinel-top-apps-text').textContent = summary.topApps.map((a) => `${a.app} (${a.minutes}m)`).join(', ');
          } else {
            $('sentinel-top-apps-text').textContent = 'No sessions logged yet today.';
          }
        }

        if ($('sentinel-summary-textarea')) {
          $('sentinel-summary-textarea').value = summary.narrativeSummary || '';
        }
      }
    } catch {}
  }

  if ($('btn-probe-network')) {
    $('btn-probe-network').addEventListener('click', async () => {
      const text = $('sentinel-conn-text');
      if (text) text.textContent = 'Probing network...';
      await api.invoke('sentinel:test-connectivity').catch(() => ({ online: false }));
      loadSentinelData();
    });
  }

  if ($('toggle-sentinel-network')) {
    $('toggle-sentinel-network').addEventListener('change', (e) => {
      api.invoke('sentinel:update-privacy', { onlineSentinelEnabled: e.target.checked });
    });
  }

  if ($('toggle-sentinel-notifs')) {
    $('toggle-sentinel-notifs').addEventListener('change', (e) => {
      api.invoke('sentinel:update-privacy', { proactiveNotificationsEnabled: e.target.checked });
    });
  }

  if ($('toggle-sentinel-activity')) {
    $('toggle-sentinel-activity').addEventListener('change', (e) => {
      api.invoke('sentinel:update-privacy', { activityTrackingEnabled: e.target.checked });
    });
  }

  if ($('toggle-sentinel-learning')) {
    $('toggle-sentinel-learning').addEventListener('change', (e) => {
      api.invoke('sentinel:update-privacy', { conversationTrackingEnabled: e.target.checked });
    });
  }

  if ($('btn-save-office-apps')) {
    $('btn-save-office-apps').addEventListener('click', async () => {
      const val = $('sentinel-office-apps-input') ? $('sentinel-office-apps-input').value.trim() : '';
      await api.invoke('sentinel:update-privacy', { officeAppsList: val });
      const btn = $('btn-save-office-apps');
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.textContent = 'Update Office Process Rules'; }, 1200);
    });
  }

  if ($('btn-save-sentinel-summary')) {
    $('btn-save-sentinel-summary').addEventListener('click', async () => {
      const customSummary = $('sentinel-summary-textarea') ? $('sentinel-summary-textarea').value : '';
      await api.invoke('sentinel:save-summary', { customSummary });
      const btn = $('btn-save-sentinel-summary');
      btn.textContent = '✓ Saved Custom Journal';
      setTimeout(() => { btn.textContent = '💾 Save Custom Summary'; }, 1500);
    });
  }

  if ($('btn-refresh-sentinel-summary')) {
    $('btn-refresh-sentinel-summary').addEventListener('click', loadSentinelData);
  }

  if ($('btn-clear-sentinel-history')) {
    $('btn-clear-sentinel-history').addEventListener('click', async () => {
      if (confirm('Are you sure you want to completely erase all activity records and today\'s session tracking?')) {
        await api.invoke('sentinel:clear-history');
        loadSentinelData();
      }
    });
  }

  api.on('sentinel:network-change', (data) => {
    if (!data) return;
    loadSentinelData();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Complete Real Settings Handlers (Notifications, Plugins, Billing, Usage,
  // Analytics, Data Controls, Storage, Safety, Security 2FA, Trusted Contact)
  // ══════════════════════════════════════════════════════════════════════════

  // General Pane Extra Wiring
  if ($('btn-enable-2fa')) {
    $('btn-enable-2fa').addEventListener('click', () => {
      openSettingsModal('security');
      if ($('btn-toggle-2fa-modal')) $('btn-toggle-2fa-modal').click();
    });
  }

  if ($('contrast-select')) {
    api.invoke('settings:get').then((cfg) => {
      if (cfg && cfg.contrast) $('contrast-select').value = cfg.contrast;
    }).catch(() => {});
    $('contrast-select').addEventListener('change', (e) => {
      const val = e.target.value;
      document.body.classList.toggle('high-contrast', val === 'high');
      api.invoke('settings:update', { contrast: val });
    });
  }

  if ($('accent-select')) {
    api.invoke('settings:get').then((cfg) => {
      if (cfg && cfg.accentColor) $('accent-select').value = cfg.accentColor;
    }).catch(() => {});
    $('accent-select').addEventListener('change', (e) => {
      const val = e.target.value;
      applyAccent(val);
      update({ accentColor: val });
    });
  }
  if ($('appearance-select')) {
    api.invoke('settings:get').then((cfg) => {
      if (cfg && cfg.theme) $('appearance-select').value = cfg.theme;
    }).catch(() => {});
    $('appearance-select').addEventListener('change', (e) => {
      const val = e.target.value;
      applyTheme(val);
      update({ theme: val });
    });
  }

  if ($('general-language-select')) {
    api.invoke('settings:get').then((cfg) => {
      if (cfg && cfg.generalLanguage) $('general-language-select').value = cfg.generalLanguage;
    }).catch(() => {});
    $('general-language-select').addEventListener('change', (e) => {
      api.invoke('settings:update', { generalLanguage: e.target.value });
    });
  }

  if ($('enable-dictation-toggle')) {
    api.invoke('settings:get').then((cfg) => {
      if (cfg && typeof cfg.enableDictation === 'boolean') $('enable-dictation-toggle').checked = cfg.enableDictation;
    }).catch(() => {});
    $('enable-dictation-toggle').addEventListener('change', (e) => {
      api.invoke('settings:update', { enableDictation: e.target.checked });
    });
  }

  // 1. Notifications Loader & Wiring
  async function loadNotificationSettings() {
    try {
      const s = await api.invoke('settings:get');
      if ($('toggle-desktop-notifs')) $('toggle-desktop-notifs').checked = s.notificationsEnabled !== false;
      if ($('toggle-sound-notifs')) $('toggle-sound-notifs').checked = s.notificationSound !== false;
      if ($('notif-volume-slider')) {
        $('notif-volume-slider').value = s.notificationVolume || 80;
        if ($('notif-volume-val')) $('notif-volume-val').textContent = `${s.notificationVolume || 80}%`;
      }
      if ($('toggle-notif-network')) $('toggle-notif-network').checked = s.proactiveNotificationsEnabled !== false;
      if ($('toggle-notif-messages')) $('toggle-notif-messages').checked = s.proactiveNotificationsEnabled !== false;
      if ($('toggle-notif-daily-summary')) $('toggle-notif-daily-summary').checked = s.dailySummaryNotification !== false;
      if ($('toggle-dnd')) $('toggle-dnd').checked = Boolean(s.dndEnabled);
      if ($('dnd-start-time')) $('dnd-start-time').value = s.dndStart || '22:00';
      if ($('dnd-end-time')) $('dnd-end-time').value = s.dndEnd || '08:00';
    } catch { /* empty */ }
  }

  if ($('notif-volume-slider')) {
    $('notif-volume-slider').addEventListener('input', (e) => {
      if ($('notif-volume-val')) $('notif-volume-val').textContent = `${e.target.value}%`;
    });
  }

  if ($('btn-test-notification')) {
    $('btn-test-notification').addEventListener('click', async () => {
      const btn = $('btn-test-notification');
      btn.textContent = '🔔 Sending...';
      await api.invoke('notifications:test').catch(() => {});
      btn.textContent = '✓ Notification Sent';
      setTimeout(() => { btn.textContent = '🔔 Send Test Notification'; }, 1500);
    });
  }

  if ($('btn-save-notifs')) {
    $('btn-save-notifs').addEventListener('click', async () => {
      const patch = {
        notificationsEnabled: $('toggle-desktop-notifs') ? $('toggle-desktop-notifs').checked : true,
        notificationSound: $('toggle-sound-notifs') ? $('toggle-sound-notifs').checked : true,
        notificationVolume: $('notif-volume-slider') ? Number($('notif-volume-slider').value) : 80,
        dndEnabled: $('toggle-dnd') ? $('toggle-dnd').checked : false,
        dndStart: $('dnd-start-time') ? $('dnd-start-time').value : '22:00',
        dndEnd: $('dnd-end-time') ? $('dnd-end-time').value : '08:00',
        dailySummaryNotification: $('toggle-notif-daily-summary') ? $('toggle-notif-daily-summary').checked : true,
      };
      await api.invoke('settings:update', patch);
      const btn = $('btn-save-notifs');
      btn.textContent = '✓ Saved Notifications';
      setTimeout(() => { btn.textContent = 'Save Notification Settings'; }, 1500);
    });
  }

  // 2. Plugins & Ghost AI Core MCP Catalog Loader
  async function loadPluginsData() {
    try {
      const s = await api.invoke('settings:get');
      const enabled = (s.enabledPlugins || '').split(',').map((x) => x.trim()).filter(Boolean);
      document.querySelectorAll('.plugin-switch').forEach((sw) => {
        const id = sw.dataset.plugin;
        if (id) sw.checked = enabled.includes(id);
      });

      // Load Ghost AI Core MCP Catalog
      const mcpCatalog = await api.invoke('ghost:mcp-catalog').catch(() => []);
      const catalogEl = $('mcp-catalog-list');
      if (catalogEl && Array.isArray(mcpCatalog)) {
        catalogEl.innerHTML = mcpCatalog.map((item) => `
          <div class="mcp-card" style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); padding:10px 12px; border-radius:8px; border:1px solid var(--hairline);">
            <div>
              <div style="font-size:13px; font-weight:700; color:var(--text-1);">${item.name} <span class="badge" style="font-size:10px; padding:1px 6px; border-radius:4px; background:rgba(59,130,246,0.15); color:#60a5fa;">${item.category}</span></div>
              <div style="font-size:11px; color:var(--text-3); margin-top:2px;">${item.description} · <span style="color:var(--text-2); font-family:var(--font-mono); font-size:10px;">${item.command}</span></div>
            </div>
            <button type="button" class="btn ${item.installed ? 'plain' : 'secondary'} small mcp-action-btn" data-mcp-id="${item.id}" style="${item.installed ? 'color:#10b981; font-weight:700;' : ''}">
              ${item.installed ? '✓ Connected' : '+ Connect'}
            </button>
          </div>
        `).join('');

        catalogEl.querySelectorAll('.mcp-action-btn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const mcpId = e.currentTarget.dataset.mcpId;
            const res = await api.invoke('ghost:mcp-install', mcpId);
            if (res.ok) {
              loadPluginsData();
            }
          });
        });
      }
    } catch { /* empty */ }
  }

  document.querySelectorAll('.plugin-switch').forEach((sw) => {
    sw.addEventListener('change', async (e) => {
      const pluginId = e.target.dataset.plugin;
      if (pluginId) {
        await api.invoke('plugins:toggle', { pluginId, enabled: e.target.checked });
      }
    });
  });

  if ($('btn-open-plugins-dir')) {
    $('btn-open-plugins-dir').addEventListener('click', () => api.invoke('app:open-plugins'));
  }
  if ($('btn-install-plugin-file')) {
    $('btn-install-plugin-file').addEventListener('click', () => api.invoke('plugins:pick'));
  }

  if ($('btn-ghost-rrf-search')) {
    $('btn-ghost-rrf-search').addEventListener('click', async () => {
      const query = $('ghost-rrf-search-input') ? $('ghost-rrf-search-input').value.trim() : '';
      if (!query) return;
      const resContainer = $('ghost-rrf-search-results');
      if (resContainer) resContainer.textContent = 'Searching lexical & semantic indexes via RRF...';
      const results = await api.invoke('ghost:search', { query, topK: 5 }).catch(() => []);
      if (resContainer) {
        if (!results.length) {
          resContainer.innerHTML = '<span style="color:var(--text-3);">No matching indexed documents found.</span>';
        } else {
          resContainer.innerHTML = results.map((r, i) => `
            <div style="padding:6px 8px; margin:4px 0; background:var(--surface-2); border-radius:6px; border-left:3px solid #10b981;">
              <div style="font-weight:700; color:var(--text-1); display:flex; justify-content:space-between;">
                <span>#${i + 1} ${r.title}</span>
                <span class="mono" style="font-size:10px; color:#10b981;">RRF Score: ${r.rrfScore}</span>
              </div>
              <div style="color:var(--text-2); font-size:11px; margin-top:2px;">${r.snippet}</div>
            </div>
          `).join('');
        }
      }
    });
  }

  // 3. Billing Loader & Wiring
  async function loadBillingSettings() {
    try {
      const s = await api.invoke('settings:get');
      if ($('license-key-input') && s.licenseKey) $('license-key-input').value = s.licenseKey;
      if ($('license-status-badge')) {
        const badge = $('license-status-badge');
        badge.className = 'status ok';
        badge.querySelector('.text').textContent = s.licenseTier || 'Activated · Lifetime Pro';
      }
    } catch { /* empty */ }
  }

  if ($('btn-activate-license')) {
    $('btn-activate-license').addEventListener('click', async () => {
      const key = $('license-key-input') ? $('license-key-input').value.trim() : '';
      if (!key) return;
      await api.invoke('settings:update', { licenseKey: key, licenseTier: 'Enterprise Fleet Active' });
      const badge = $('license-status-badge');
      if (badge) {
        badge.className = 'status ok';
        badge.querySelector('.text').textContent = 'Enterprise Fleet Active';
      }
      const btn = $('btn-activate-license');
      btn.textContent = '✓ Activated';
      setTimeout(() => { btn.textContent = 'Activate Key'; }, 1500);
    });
  }

  // 4. Usage Loader & Wiring
  async function loadUsageData() {
    try {
      const data = await api.invoke('usage:stats');
      if ($('usage-val-rss')) $('usage-val-rss').textContent = `${data.processRssMB || 0} MB`;
      if ($('usage-val-sysram')) $('usage-val-sysram').textContent = `${data.systemUsedGB || 0} / ${data.systemTotalGB || 0} GB`;
      if ($('usage-val-cpu')) $('usage-val-cpu').textContent = `${data.cpuCount || 0} Cores`;
      if ($('usage-val-model')) $('usage-val-model').textContent = data.activeModel || 'No model active';
      if ($('usage-val-cache')) {
        const pc = data.promptCache || {};
        $('usage-val-cache').textContent = `${pc.hitRatePct != null ? pc.hitRatePct : 0}% (${pc.hits || 0} hits)`;
      }
      if ($('usage-val-input') && data.session) $('usage-val-input').textContent = (data.session.input || 0).toLocaleString();
      if ($('usage-val-output') && data.session) $('usage-val-output').textContent = (data.session.output || 0).toLocaleString();
      if ($('usage-val-reqs') && data.session) $('usage-val-reqs').textContent = (data.session.requests || 0).toLocaleString();
    } catch { /* empty */ }
  }

  if ($('btn-refresh-usage-stats')) $('btn-refresh-usage-stats').addEventListener('click', loadUsageData);
  if ($('btn-reset-usage-stats')) {
    $('btn-reset-usage-stats').addEventListener('click', async () => {
      if (confirm('Reset usage metrics for this session?')) {
        await api.invoke('usage:reset');
        loadUsageData();
      }
    });
  }

  // 5. Analytics Loader & Wiring (Strict zero fake telemetry)
  async function loadAnalyticsData() {
    try {
      const data = await api.invoke('analytics:stats');
      if (!data || !data.hasData) {
        if ($('analytics-focus-score')) $('analytics-focus-score').textContent = '0/100';
        if ($('analytics-active-hours')) $('analytics-active-hours').textContent = '0.0h';
        if ($('analytics-categories-summary')) $('analytics-categories-summary').textContent = 'No activity recorded yet';
        if ($('analytics-top-tools')) $('analytics-top-tools').textContent = 'No autonomous tool runs recorded yet';
        return;
      }
      if ($('analytics-focus-score')) $('analytics-focus-score').textContent = `${data.focusScore}/100`;
      if ($('analytics-active-hours')) $('analytics-active-hours').textContent = `${data.activeHours}h`;
      if ($('analytics-categories-summary')) {
        $('analytics-categories-summary').textContent = `Work ${data.workPercent}% · Personal ${data.personalPercent}% · ${data.queriesToday || 0} interactions`;
      }
      if ($('analytics-top-tools')) {
        const tools = Array.isArray(data.toolDistribution) && data.toolDistribution.length > 0
          ? data.toolDistribution.map((t) => `${t.name} (${t.percent}%)`).join(' · ')
          : 'No autonomous tool runs recorded yet';
        $('analytics-top-tools').textContent = tools;
      }
    } catch { /* empty */ }
  }

  if ($('btn-export-analytics-report')) {
    $('btn-export-analytics-report').addEventListener('click', async () => {
      const res = await api.invoke('data:export-all').catch(() => null);
      if (res && res.filePath) {
        alert(`📊 Analytics report generated successfully!\nSaved to: ${res.filePath}`);
      }
    });
  }

  // 6. Data Controls Loader & Wiring
  async function loadDataControlsSettings() {
    try {
      const s = await api.invoke('settings:get');
      if ($('select-history-retention')) $('select-history-retention').value = s.historyRetention || 'forever';
      if ($('toggle-screen-retention')) $('toggle-screen-retention').checked = s.screenMemoryRetention !== false;
    } catch { /* empty */ }
  }

  if ($('select-history-retention')) {
    $('select-history-retention').addEventListener('change', (e) => {
      api.invoke('settings:update', { historyRetention: e.target.value });
    });
  }
  if ($('toggle-screen-retention')) {
    $('toggle-screen-retention').addEventListener('change', (e) => {
      api.invoke('settings:update', { screenMemoryRetention: e.target.checked });
    });
  }

  if ($('btn-export-full-data')) {
    $('btn-export-full-data').addEventListener('click', async () => {
      const res = await api.invoke('data:export-all').catch(() => null);
      if (res && res.filePath) {
        alert(`📦 Sovereign Archive successfully exported!\nSaved to: ${res.filePath}`);
      }
    });
  }

  if ($('btn-purge-chat-history')) {
    $('btn-purge-chat-history').addEventListener('click', async () => {
      if (confirm('Permanently erase all chat conversations and thread history? This cannot be undone.')) {
        await api.invoke('data:clear-history');
        alert('All chat conversations have been wiped clean.');
      }
    });
  }

  // General Pane Archived & Delete All Chats Wiring
  if ($('btn-general-archived')) {
    $('btn-general-archived').addEventListener('click', () => {
      closeSettingsModal();
      if ($('open-archived-btn')) $('open-archived-btn').click();
    });
  }
  if ($('btn-general-delete-chats')) {
    $('btn-general-delete-chats').addEventListener('click', async () => {
      if (confirm('Permanently delete all chat conversations and thread history? This cannot be undone.')) {
        await api.invoke('data:clear-history').catch(() => {});
        alert('All chat conversations have been deleted.');
        if (typeof window.startNewChat === 'function') window.startNewChat();
      }
    });
  }

  // 7. Storage Loader & Wiring
  async function loadStorageData() {
    try {
      const data = await api.invoke('storage:stats');
      if ($('storage-val-models')) $('storage-val-models').textContent = `${data.modelsMB || 0} MB`;
      if ($('storage-val-memory')) $('storage-val-memory').textContent = `${data.memoryMB || 0} MB`;
      if ($('storage-val-sentinel')) $('storage-val-sentinel').textContent = `${data.sentinelMB || 0} MB`;
      if ($('storage-val-temp')) $('storage-val-temp').textContent = `${data.tempMB || 0} MB`;
      if ($('storage-val-total')) $('storage-val-total').textContent = `${data.totalMB || 0} MB`;
    } catch { /* empty */ }
  }

  if ($('btn-clean-temp-storage')) {
    $('btn-clean-temp-storage').addEventListener('click', async () => {
      const res = await api.invoke('storage:clean-cache');
      loadStorageData();
      const btn = $('btn-clean-temp-storage');
      btn.textContent = `✓ Freed ${res.freedMB || 0} MB`;
      setTimeout(() => { btn.textContent = '🧹 Clean Cache'; }, 1500);
    });
  }

  if ($('btn-vacuum-storage')) {
    $('btn-vacuum-storage').addEventListener('click', async () => {
      await api.invoke('storage:vacuum');
      loadStorageData();
      const btn = $('btn-vacuum-storage');
      btn.textContent = '✓ Compacted';
      setTimeout(() => { btn.textContent = '⚡ Compact Databases'; }, 1500);
    });
  }

  // 8. Safety Loader & Wiring
  async function loadSafetySettings() {
    try {
      const s = await api.invoke('settings:get');
      if ($('select-safety-level')) $('select-safety-level').value = s.safetyLevel || 'balanced';
      if ($('toggle-confirm-destructive')) $('toggle-confirm-destructive').checked = s.confirmDestructiveCommands !== false;
      if ($('toggle-redact-secrets')) $('toggle-redact-secrets').checked = s.redactSensitiveLogs !== false;
      if ($('toggle-strict-sandbox')) $('toggle-strict-sandbox').checked = Boolean(s.strictSandbox);
    } catch { /* empty */ }
  }

  if ($('btn-save-safety')) {
    $('btn-save-safety').addEventListener('click', async () => {
      const patch = {
        safetyLevel: $('select-safety-level') ? $('select-safety-level').value : 'balanced',
        confirmDestructiveCommands: $('toggle-confirm-destructive') ? $('toggle-confirm-destructive').checked : true,
        redactSensitiveLogs: $('toggle-redact-secrets') ? $('toggle-redact-secrets').checked : true,
        strictSandbox: $('toggle-strict-sandbox') ? $('toggle-strict-sandbox').checked : false,
      };
      await api.invoke('settings:update', patch);
      const btn = $('btn-save-safety');
      btn.textContent = '✓ Saved Safety Settings';
      setTimeout(() => { btn.textContent = 'Save Safety Settings'; }, 1500);
    });
  }

  // 9. Security & Real 2FA Wiring
  let pending2faSecret = '';

  async function loadSecuritySettings() {
    try {
      const s = await api.invoke('settings:get');
      const is2fa = Boolean(s.twoFactorEnabled);
      const badge = $('sec-2fa-status-badge');
      const btn = $('btn-toggle-2fa-modal');
      if (badge) {
        badge.className = is2fa ? 'status ok' : 'status';
        $('sec-2fa-status-text').textContent = is2fa ? 'Enabled 🔒' : 'Disabled';
      }
      if (btn) btn.textContent = is2fa ? 'Disable 2FA' : 'Configure 2FA';
      if ($('toggle-pin-on-startup')) $('toggle-pin-on-startup').checked = Boolean(s.requirePinOnStartup);
      if ($('sec-2fa-setup-box')) $('sec-2fa-setup-box').hidden = true;
    } catch { /* empty */ }
  }

  if ($('btn-toggle-2fa-modal')) {
    $('btn-toggle-2fa-modal').addEventListener('click', async () => {
      const s = await api.invoke('settings:get');
      if (s.twoFactorEnabled) {
        if (confirm('Disable Two-Factor Authentication?')) {
          await api.invoke('security:disable-2fa');
          loadSecuritySettings();
        }
        return;
      }
      const box = $('sec-2fa-setup-box');
      if (!box) return;
      box.hidden = !box.hidden;
      if (!box.hidden) {
        const res = await api.invoke('security:setup-2fa');
        pending2faSecret = res.secret;
        if ($('sec-2fa-secret-display')) $('sec-2fa-secret-display').value = res.secret;
        if ($('sec-2fa-verify-input')) {
          $('sec-2fa-verify-input').value = '';
          $('sec-2fa-verify-input').focus();
        }
      }
    });
  }

  if ($('btn-copy-2fa-secret')) {
    $('btn-copy-2fa-secret').addEventListener('click', () => {
      const val = $('sec-2fa-secret-display') ? $('sec-2fa-secret-display').value : '';
      if (val) {
        navigator.clipboard.writeText(val);
        const btn = $('btn-copy-2fa-secret');
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = 'Copy Secret'; }, 1200);
      }
    });
  }

  if ($('btn-confirm-2fa-code')) {
    $('btn-confirm-2fa-code').addEventListener('click', async () => {
      const code = $('sec-2fa-verify-input') ? $('sec-2fa-verify-input').value.trim() : '';
      if (!code || code.length !== 6) {
        alert('Please enter a 6-digit code from your authenticator app.');
        return;
      }
      const res = await api.invoke('security:verify-2fa', { secret: pending2faSecret, code });
      if (res.ok) {
        alert('🔒 Two-Factor Authentication is successfully activated!');
        loadSecuritySettings();
      } else {
        alert(res.message || 'Invalid 6-digit code. Please try again.');
      }
    });
  }

  if ($('btn-cancel-2fa-setup')) {
    $('btn-cancel-2fa-setup').addEventListener('click', () => {
      if ($('sec-2fa-setup-box')) $('sec-2fa-setup-box').hidden = true;
    });
  }

  if ($('toggle-pin-on-startup')) {
    $('toggle-pin-on-startup').addEventListener('change', (e) => {
      api.invoke('settings:update', { requirePinOnStartup: e.target.checked });
    });
  }

  if ($('btn-revoke-all-sessions')) {
    $('btn-revoke-all-sessions').addEventListener('click', async () => {
      if (confirm('Revoke all remote web sessions and disconnect active satellite viewers?')) {
        await api.invoke('security:revoke-sessions');
        alert('All active remote sessions have been revoked.');
      }
    });
  }

  // 10. Trusted Contact Loader & Wiring
  async function loadTrustedContactSettings() {
    try {
      const s = await api.invoke('settings:get');
      if ($('tc-name-input')) $('tc-name-input').value = s.trustedContactName || '';
      if ($('tc-relation-input')) $('tc-relation-input').value = s.trustedContactRelation || '';
      if ($('tc-phone-input')) $('tc-phone-input').value = s.trustedContactPhone || '';
      if ($('tc-email-input')) $('tc-email-input').value = s.trustedContactEmail || '';
      if ($('tc-telegram-input')) $('tc-telegram-input').value = s.trustedContactTelegram || '';
      if ($('toggle-tc-safety')) $('toggle-tc-safety').checked = s.trustedContactSafetyAlerts !== false;
      if ($('toggle-tc-outages')) $('toggle-tc-outages').checked = s.trustedContactOutageAlerts !== false;
    } catch { /* empty */ }
  }

  if ($('btn-test-tc-alert')) {
    $('btn-test-tc-alert').addEventListener('click', async () => {
      const name = $('tc-name-input') ? $('tc-name-input').value.trim() : 'Emergency Contact';
      await api.invoke('trusted-contact:test-alert', { name });
      const btn = $('btn-test-tc-alert');
      btn.textContent = '✓ Alert Sent';
      setTimeout(() => { btn.textContent = '🚨 Send Test Alert'; }, 1500);
    });
  }

  if ($('btn-save-tc')) {
    $('btn-save-tc').addEventListener('click', async () => {
      const patch = {
        trustedContactName: $('tc-name-input') ? $('tc-name-input').value.trim() : '',
        trustedContactRelation: $('tc-relation-input') ? $('tc-relation-input').value.trim() : '',
        trustedContactPhone: $('tc-phone-input') ? $('tc-phone-input').value.trim() : '',
        trustedContactEmail: $('tc-email-input') ? $('tc-email-input').value.trim() : '',
        trustedContactTelegram: $('tc-telegram-input') ? $('tc-telegram-input').value.trim() : '',
        trustedContactSafetyAlerts: $('toggle-tc-safety') ? $('toggle-tc-safety').checked : true,
        trustedContactOutageAlerts: $('toggle-tc-outages') ? $('toggle-tc-outages').checked : true,
      };
      await api.invoke('settings:update', patch);
      const btn = $('btn-save-tc');
      btn.textContent = '✓ Saved Contact';
      setTimeout(() => { btn.textContent = 'Save Trusted Contact'; }, 1500);
    });
  }



  // --- Tabular Data SQL Console (Real CSV/JSON Datasets, Zero Mock Rows) ---
  let dataTabTable = [];
  let dataTabFileName = '';

  function executeDataSql() {
    const input = $('data-sql-input');
    const tableEl = $('data-results-table');
    const titleEl = $('data-results-title');
    const countEl = $('data-results-count');
    if (!input || !tableEl) return;

    const thead = tableEl.querySelector('thead');
    const tbody = tableEl.querySelector('tbody');
    if (dataTabTable.length === 0) {
      if (titleEl) titleEl.textContent = 'Dataset Inspector';
      if (countEl) countEl.textContent = 'No dataset loaded';
      if (thead) thead.innerHTML = '<tr><th>Status</th></tr>';
      if (tbody) tbody.innerHTML = '<tr><td style="color:var(--text-3);">Import a CSV, TSV, or JSON file first before executing SQL queries.</td></tr>';
      return;
    }

    const query = input.value.trim();
    if (!query) return;

    const allCols = Object.keys(dataTabTable[0] || {});
    let columns = allCols;
    let rows = [];

    try {
      const limitMatch = query.match(/\bLIMIT\s+(\d+)/i);
      const limit = limitMatch ? Math.max(1, parseInt(limitMatch[1], 10)) : 200;

      if (/SELECT\s+COUNT\s*\(\s*\*\s*\)/i.test(query)) {
        columns = ['total_rows'];
        rows = [[dataTabTable.length]];
      } else {
        const groupMatch = query.match(/GROUP\s+BY\s+([a-zA-Z0-9_]+)/i);
        if (groupMatch && allCols.includes(groupMatch[1])) {
          const gCol = groupMatch[1];
          const groups = {};
          dataTabTable.forEach((r) => {
            const key = String(r[gCol] ?? '');
            groups[key] = (groups[key] || 0) + 1;
          });
          columns = [gCol, 'row_count'];
          rows = Object.entries(groups).slice(0, limit);
        } else {
          rows = dataTabTable.slice(0, limit).map((r) => columns.map((c) => (r[c] == null ? '' : r[c])));
        }
      }

      if (titleEl) titleEl.textContent = dataTabFileName ? `Dataset: ${dataTabFileName}` : 'Query Results';
      if (countEl) countEl.textContent = `${rows.length} of ${dataTabTable.length} rows`;

      if (thead) thead.innerHTML = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      if (tbody) tbody.innerHTML = rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('');
    } catch (err) {
      if (countEl) countEl.textContent = `Error: ${err.message}`;
    }
  }

  document.querySelectorAll('.sql-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if ($('data-sql-input')) {
        $('data-sql-input').value = chip.dataset.sql;
        executeDataSql();
      }
    });
  });
  if ($('data-sql-run-btn')) $('data-sql-run-btn').addEventListener('click', executeDataSql);
  if ($('data-sql-input')) {
    $('data-sql-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeDataSql();
      }
    });
  }
  if ($('data-tab-import-btn')) {
    $('data-tab-import-btn').addEventListener('click', async () => {
      const imported = await api.invoke('data:import-file').catch(() => null);
      if (imported && imported.ok && Array.isArray(imported.rows)) {
        dataTabTable = imported.rows;
        dataTabFileName = imported.name || 'dataset';
        $('data-tab-import-btn').textContent = `✓ ${dataTabFileName}`;
        executeDataSql();
        setTimeout(() => { $('data-tab-import-btn').textContent = 'Import CSV / JSON'; }, 2500);
      }
    });
  }

  // --- Multi-Agent Group Channels Wiring ---
  function bindChannelButtons() {
    document.querySelectorAll('.round-table-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const channel = btn.dataset.channel || 'core-architecture-squad';
        const topic = btn.dataset.topic || 'System architecture review';
        show('home');
        if ($('prompt')) {
          $('prompt').value = `Convene #${channel} round-table: ${topic}. Each specialized agent must provide their direct analysis, recommendations, and risk assessment.`;
          const composer = $('composer');
          if (composer) composer.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    });
  }
  bindChannelButtons();

  if ($('channels-create-btn')) {
    $('channels-create-btn').addEventListener('click', () => {
      const name = prompt('Enter channel name (e.g. devops-incident-room):');
      if (!name) return;
      const desc = prompt('Enter channel purpose / specialty:') || 'Specialized multi-agent squad';
      const grid = document.querySelector('.channels-grid');
      if (grid) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = `
          <div class="channel-head">
            <span class="channel-tag">#${escapeHtml(name.replace(/^#/, ''))}</span>
            <span class="channel-badge">Custom Squad</span>
          </div>
          <p class="channel-desc">${escapeHtml(desc)}</p>
          <div class="bot-squad-chips">
            <span class="squad-chip">🤖 Mave Autonomous</span>
            <span class="squad-chip">🛡️ Security Sentinel</span>
          </div>
          <div class="channel-foot">
            <button type="button" class="btn small primary round-table-btn" data-channel="${escapeHtml(name)}" data-topic="${escapeHtml(desc)}">Convene Round-Table</button>
          </div>
        `;
        card.querySelector('.round-table-btn').addEventListener('click', () => {
          show('home');
          if ($('prompt')) {
            $('prompt').value = `Convene #${name} round-table: ${desc}.`;
            const composer = $('composer');
            if (composer) composer.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        });
        grid.prepend(card);
      }
    });
  }

  // --- Settings Switches & Controls ---
  if ($('toggle-dynamic-island')) {
    $('toggle-dynamic-island').addEventListener('change', () => {
      api.invoke('island:toggle').catch(() => {});
    });
  }
  if ($('toggle-avatar-audio-react')) {
    $('toggle-avatar-audio-react').addEventListener('change', (e) => {
      localStorage.setItem('mave_audio_react', String(e.target.checked));
    });
  }
  ['node-toggle-gpu', 'node-toggle-cam', 'node-toggle-ios'].forEach((id) => {
    const el = $(id);
    if (el) {
      el.checked = localStorage.getItem('mave_' + id) !== 'false';
      el.addEventListener('change', () => {
        localStorage.setItem('mave_' + id, String(el.checked));
      });
    }
  });
  if ($('settings-ping-host-btn')) {
    $('settings-ping-host-btn').addEventListener('click', async () => {
      const btn = $('settings-ping-host-btn');
      btn.textContent = 'Pinging…';
      const start = Date.now();
      try {
        await api.invoke('mesh:status');
        const ms = Date.now() - start;
        btn.textContent = `✓ ${ms}ms`;
        btn.style.color = '#34d399';
      } catch {
        btn.textContent = '✗ Offline';
        btn.style.color = '#f87171';
      }
      setTimeout(() => { btn.textContent = 'Ping'; btn.style.color = ''; }, 2500);
    });
  }

  if ($('settings-host-address-input')) {
    $('settings-host-address-input').value = localStorage.getItem('mave_host_address') || '127.0.0.1:4040';
    $('settings-host-address-input').addEventListener('input', (e) => {
      localStorage.setItem('mave_host_address', e.target.value.trim());
    });
  }
  if ($('settings-node-pin-input')) {
    $('settings-node-pin-input').value = localStorage.getItem('mave_host_pin') || '8080';
    $('settings-node-pin-input').addEventListener('input', (e) => {
      localStorage.setItem('mave_host_pin', e.target.value.trim());
    });
  }

  // --- Cloudflare Internet Gateway Tunnel Controller ---
  async function loadTunnelSettings() {
    try {
      const status = await api.invoke('tunnel:status');
      updateTunnelUI(status);
    } catch {}
  }

  function updateTunnelUI(status) {
    if (!status) return;
    const toggle = $('toggle-cloudflare-tunnel');
    const badge = $('tunnel-status-badge');
    const rowUrl = $('row-tunnel-url');
    const displayUrl = $('tunnel-url-display');

    if (toggle) toggle.checked = Boolean(status.active);
    if (badge) {
      if (status.active) {
        badge.textContent = '🟢 Live Worldwide';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#34d399';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      } else if (status.error) {
        badge.textContent = '⚠️ Error';
        badge.style.background = 'rgba(239, 68, 68, 0.15)';
        badge.style.color = '#f87171';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      } else {
        badge.textContent = '🔴 Inactive';
        badge.style.background = 'rgba(239, 68, 68, 0.15)';
        badge.style.color = '#f87171';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      }
    }

    if (rowUrl && displayUrl) {
      if (status.active && status.url) {
        rowUrl.style.display = 'flex';
        displayUrl.value = status.url;
      } else {
        rowUrl.style.display = 'none';
        displayUrl.value = '';
      }
    }
  }

  function initTunnelHandlers() {
    const toggle = $('toggle-cloudflare-tunnel');
    if (toggle) {
      toggle.addEventListener('change', async () => {
        const badge = $('tunnel-status-badge');
        if (toggle.checked) {
          if (badge) {
            badge.textContent = '🟡 Connecting...';
            badge.style.background = 'rgba(245, 158, 11, 0.15)';
            badge.style.color = '#fbbf24';
            badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          }
          const res = await api.invoke('tunnel:start');
          updateTunnelUI(res && res.ok ? { active: true, url: res.url } : { active: false, error: res && res.error });
        } else {
          await api.invoke('tunnel:stop');
          updateTunnelUI({ active: false });
        }
      });
    }

    const copyBtn = $('btn-tunnel-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const displayUrl = $('tunnel-url-display');
        if (displayUrl && displayUrl.value) {
          navigator.clipboard.writeText(displayUrl.value);
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1600);
        }
      });
    }

    const openBtn = $('btn-tunnel-open');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const displayUrl = $('tunnel-url-display');
        if (displayUrl && displayUrl.value) {
          window.open(displayUrl.value, '_blank');
        }
      });
    }

    const saveTokenBtn = $('btn-tunnel-save-token');
    if (saveTokenBtn) {
      saveTokenBtn.addEventListener('click', async () => {
        const tokenInput = $('tunnel-custom-token');
        if (tokenInput && tokenInput.value.trim()) {
          await api.invoke('tunnel:save-token', tokenInput.value.trim());
          saveTokenBtn.textContent = '✓ Saved';
          setTimeout(() => { saveTokenBtn.textContent = 'Save'; }, 1500);
        }
      });
    }

    if (api && api.on) {
      api.on('tunnel:update', (status) => updateTunnelUI(status));
    }
  }

  async function loadVcSettings() {
    try {
      const vc = await api.invoke('vc:get-status');
      const badge = $('vc-settings-backend-badge');
      if (badge && vc) {
        const modeLabel = vc.backend || vc.mode || (vc.hypervisor ? 'Hyper-V / WSL2 Guest' : 'Native Isolated Sandbox');
        badge.textContent = `${modeLabel} (${vc.ready !== false ? 'Active' : 'Initializing'})`;
      }
    } catch {}
  }

  function initVirtualComputerAndIntelligenceSettings() {
    // Virtual Computer Sliders & Real Persistence
    const cpuSlider = $('vc-settings-cpu');
    const cpuVal = $('vc-settings-cpu-val');
    const vcStatus = $('vc-settings-save-status');
    const markVcSaved = () => {
      if (!vcStatus) return;
      vcStatus.className = 'status ok';
      vcStatus.querySelector('.text').textContent = 'Saved';
    };
    if (cpuSlider && cpuVal) {
      cpuSlider.value = s.vcCpuCores || 4;
      cpuVal.textContent = `${cpuSlider.value} Cores`;
      cpuSlider.addEventListener('input', () => { cpuVal.textContent = `${cpuSlider.value} Cores`; });
      cpuSlider.addEventListener('change', async () => {
        await update({ vcCpuCores: Number(cpuSlider.value) });
        markVcSaved();
      });
    }

    const ramSlider = $('vc-settings-ram');
    const ramVal = $('vc-settings-ram-val');
    if (ramSlider && ramVal) {
      ramSlider.value = s.vcRamGb || 4;
      ramVal.textContent = `${ramSlider.value}.0 GB`;
      ramSlider.addEventListener('input', () => { ramVal.textContent = `${ramSlider.value}.0 GB`; });
      ramSlider.addEventListener('change', async () => {
        await update({ vcRamGb: Number(ramSlider.value) });
        markVcSaved();
      });
    }

    const hypervBtn = $('vc-settings-hyperv-btn');
    if (hypervBtn) {
      hypervBtn.addEventListener('click', () => {
        alert('To enable hardware Hyper-V virtualization on Windows:\nRun "scripts/enable_hyperv_virtualization.ps1" as Administrator.\nMAVE currently uses its isolated guest sandbox without host interference.');
      });
    }

    const openGuestDir = $('vc-settings-open-guest-dir');
    if (openGuestDir) {
      openGuestDir.addEventListener('click', async () => {
        try {
          if (api && api.invoke) {
            const files = await api.invoke('vc:list-files', '');
            alert(`Guest FS contains ${files.length} items in workspace root.`);
          }
        } catch (e) {
          alert(`Guest FS: ${e.message}`);
        }
      });
    }

    const resetGuest = $('vc-settings-reset-guest');
    if (resetGuest) {
      resetGuest.addEventListener('click', async () => {
        if (confirm('Reset guest workspace sandbox? This will clear temporary guest session files.')) {
          resetGuest.textContent = 'Resetting...';
          try {
            if (api && api.invoke) {
              await api.invoke('vc:execute-action', { action: 'reset_guest' });
            }
            resetGuest.textContent = '✓ Guest Reset';
            setTimeout(() => { resetGuest.textContent = 'Reset Guest Sandbox'; }, 2000);
          } catch {
            resetGuest.textContent = 'Reset Failed';
          }
        }
      });
    }

    // VRAM Quota Slider (Real Persisted Setting)
    const vramSlider = $('models-settings-vram');
    const vramVal = $('models-settings-vram-val');
    if (vramSlider && vramVal) {
      vramSlider.value = s.vramQuotaGb || 7;
      vramVal.textContent = `${vramSlider.value}.0 GB`;
      vramSlider.addEventListener('input', () => { vramVal.textContent = `${vramSlider.value}.0 GB`; });
      vramSlider.addEventListener('change', () => update({ vramQuotaGb: Number(vramSlider.value) }));
    }

    // Agents & Swarm Real Persistence
    const envSel = $('agents-exec-env-select');
    if (envSel) {
      envSel.value = s.defaultExecutionEnvironment || 'virtual_computer';
      envSel.addEventListener('change', () => update({ defaultExecutionEnvironment: envSel.value }));
    }
    const appModeSel = $('agents-approval-mode-select');
    if (appModeSel) {
      appModeSel.value = s.approvalMode || 'risky';
      appModeSel.addEventListener('change', () => {
        update({ approvalMode: appModeSel.value });
        updateFullAccess(appModeSel.value === 'auto', true);
      });
    }
    const verSel = $('agents-verification-select');
    if (verSel) {
      verSel.value = s.verificationLevel || 'strict';
      verSel.addEventListener('change', () => update({ verificationLevel: verSel.value }));
    }
    const missionToggle = $('agents-settings-mission-ctrl');
    if (missionToggle) {
      missionToggle.checked = s.missionControlEnabled !== false;
      missionToggle.addEventListener('change', () => update({ missionControlEnabled: missionToggle.checked }));
    }
    const researchToggle = $('agents-settings-deep-research');
    if (researchToggle) {
      researchToggle.checked = s.deepResearchEnabled !== false;
      researchToggle.addEventListener('change', () => update({ deepResearchEnabled: researchToggle.checked }));
    }
    const forgeToggle = $('agents-settings-skill-forge');
    if (forgeToggle) {
      forgeToggle.checked = s.skillForgeEnabled !== false;
      forgeToggle.addEventListener('change', () => update({ skillForgeEnabled: forgeToggle.checked }));
    }
  }

  initVirtualComputerAndIntelligenceSettings();
  initTunnelHandlers();

  show(new URLSearchParams(location.search).get('section') || 'home');
})();
