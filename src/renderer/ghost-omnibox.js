'use strict';
// Ghost AI Core Omnibox & Command Palette Controller.
// Provides sub-5ms BM25 + dense semantic vector hybrid search (RRF) across files, code, MCP tools, and system settings.
// Hotkey: Ctrl+K / Cmd+K.

(() => {
  const api = window.buddy;
  if (!api) return;

  const $ = (id) => document.getElementById(id);

  let isOpen = false;
  let activeFilter = 'all';
  let searchDebounceTimer = null;
  let currentResults = [];
  let selectedIndex = 0;

  function openOmnibox(initialQuery = '') {
    const modal = $('ghost-omnibox-modal');
    const input = $('ghost-omnibox-input');
    if (!modal || !input) return;

    isOpen = true;
    modal.hidden = false;
    input.value = initialQuery;
    input.focus();
    input.select();

    updateIndexerStatus();
    performSearch(initialQuery);
  }

  function closeOmnibox() {
    const modal = $('ghost-omnibox-modal');
    if (!modal) return;
    isOpen = false;
    modal.hidden = true;
    currentResults = [];
    selectedIndex = 0;
  }

  async function updateIndexerStatus() {
    try {
      const stats = await api.invoke('ghost:file-watcher-stats');
      const textEl = $('ghost-indexer-text');
      if (textEl && stats) {
        textEl.textContent = `${stats.filesIndexed || 0} files indexed • RRF Active`;
      }
    } catch {}
  }

  async function performSearch(query) {
    const queryStr = String(query || '').trim();
    const body = $('ghost-omnibox-body');
    if (!body) return;

    try {
      let results = [];
      if (queryStr) {
        results = await api.invoke('ghost:search', { query: queryStr, topK: 25 }) || [];
      } else {
        // Default top quick actions and system entries when query is empty
        results = [
          {
            id: 'action:terminal',
            title: 'Open Integrated Terminal',
            content: 'Command line shell execution with bash, powershell, cmd',
            path: 'System Action',
            score: 1.0,
            metadata: { type: 'action', icon: '💻', actionId: 'open_terminal', shortcut: 'Ctrl+`' }
          },
          {
            id: 'action:screenshot',
            title: 'Take Desktop Screenshot',
            content: 'Instant visual perception snapshot of your displays',
            path: 'System Action',
            score: 0.95,
            metadata: { type: 'action', icon: '📸', actionId: 'take_screenshot' }
          },
          {
            id: 'action:settings-security',
            title: 'Security & 2FA Two-Factor Authentication',
            content: 'Configure RFC 6238 TOTP authenticator app and session locks',
            path: 'Settings > Security',
            score: 0.9,
            metadata: { type: 'setting', icon: '🛡️', section: 'security' }
          },
          {
            id: 'action:settings-plugins',
            title: 'MCP Server Catalog & Plugins',
            content: 'Install and manage Model Context Protocol integrations',
            path: 'Settings > Plugins',
            score: 0.88,
            metadata: { type: 'setting', icon: '🔌', section: 'plugins' }
          },
          {
            id: 'action:settings-models',
            title: 'On-Device AI Models & GGUF Hardware Profile',
            content: 'Adaptive local model selection, context limits, and RTX acceleration',
            path: 'Settings > Models',
            score: 0.85,
            metadata: { type: 'setting', icon: '🧠', section: 'models' }
          },
          {
            id: 'action:daily-briefing',
            title: 'Generate Executive Morning Briefing',
            content: 'Unified summary of schedule, weather, vitals, and EV status',
            path: 'Executive Intelligence',
            score: 0.82,
            metadata: { type: 'action', icon: '📋', actionId: 'daily_briefing' }
          }
        ];
      }

      // Filter by active filter tab
      if (activeFilter !== 'all') {
        results = results.filter((r) => {
          const type = (r.metadata && r.metadata.type) || 'file';
          return type === activeFilter;
        });
      }

      currentResults = results;
      selectedIndex = 0;
      renderResults(results);
    } catch (err) {
      body.innerHTML = `<div class="ghost-empty-state">Search error: ${err.message}</div>`;
    }
  }

  function renderResults(results) {
    const body = $('ghost-omnibox-body');
    if (!body) return;

    if (!results || results.length === 0) {
      body.innerHTML = '<div class="ghost-empty-state">No matching files, tools, or actions found.</div>';
      return;
    }

    body.innerHTML = '';
    results.forEach((item, index) => {
      const type = (item.metadata && item.metadata.type) || 'file';
      const icon = (item.metadata && item.metadata.icon) || (type === 'file' ? '📄' : type === 'tool' ? '⚡' : type === 'setting' ? '⚙️' : '✨');
      const scoreStr = item.score ? item.score.toFixed(4) : '';

      const row = document.createElement('div');
      row.className = `ghost-item ${index === selectedIndex ? 'selected' : ''}`;
      row.dataset.index = index;

      row.innerHTML = `
        <div class="ghost-item-icon">${icon}</div>
        <div class="ghost-item-info">
          <div class="ghost-item-title">${escapeHtml(item.title || 'Untitled')}</div>
          <div class="ghost-item-sub">${escapeHtml(item.path || item.content || '')}</div>
        </div>
        <div class="ghost-item-badges">
          <span class="ghost-badge-type">${type}</span>
          ${scoreStr ? `<span class="ghost-badge-score" title="RRF Score">rrf:${scoreStr}</span>` : ''}
        </div>
      `;

      row.addEventListener('click', () => {
        selectedIndex = index;
        executeSelected();
      });

      body.appendChild(row);
    });

    ensureVisible();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureVisible() {
    const body = $('ghost-omnibox-body');
    if (!body) return;
    const selected = body.children[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  async function executeSelected() {
    if (!currentResults || currentResults.length === 0) return;
    const item = currentResults[selectedIndex];
    if (!item) return;

    closeOmnibox();

    const type = (item.metadata && item.metadata.type) || 'file';

    if (type === 'file') {
      const targetPath = item.path || '';
      if (targetPath) {
        try {
          await api.invoke('ghost:reveal-file', targetPath);
        } catch {
          await api.invoke('ghost:open-file', targetPath);
        }
      }
    } else if (type === 'setting') {
      const section = item.metadata && item.metadata.section;
      if (window.__showSettingsSection) {
        window.__showSettingsSection(section);
      } else {
        // Fallback: switch nav to settings and click target section
        const navSettings = document.querySelector('button[data-action="settings"]');
        if (navSettings) navSettings.click();
        setTimeout(() => {
          const itemBtn = document.querySelector(`.settings-nav-item[data-section="${section}"]`);
          if (itemBtn) itemBtn.click();
        }, 100);
      }
    } else if (type === 'action') {
      const actionId = item.metadata && item.metadata.actionId;
      if (actionId === 'open_terminal') {
        const termBtn = document.querySelector('button[data-section="terminal"]');
        if (termBtn) termBtn.click();
      } else if (actionId === 'take_screenshot') {
        api.invoke('task:run', 'take a screenshot of the display');
      } else if (actionId === 'privacy_blind') {
        api.invoke('task:run', 'pause screen vision for 30 minutes');
      } else if (actionId === 'daily_briefing') {
        api.invoke('task:run', 'give me my morning briefing');
      } else if (actionId === 'network_status') {
        api.invoke('sentinel:test-connectivity');
      }
    } else if (type === 'tool') {
      const toolName = item.id.replace(/^tool:/, '');
      api.invoke('ghost:mcp-call', { name: toolName, args: {} });
    }
  }

  // Hotkey & Event Listeners Setup
  function init() {
    // 1. Global Keyboard Shortcut: Ctrl+K / Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) closeOmnibox();
        else openOmnibox();
        return;
      }

      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeOmnibox();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelectedUi();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelectedUi();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelected();
      }
    });

    // 2. Trigger Button Click
    const triggerBtn = $('omnibox-trigger-btn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => openOmnibox());
    }

    // 3. Close Button & Backdrop Click
    const closeBtn = $('ghost-omnibox-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeOmnibox());

    const backdrop = $('ghost-omnibox-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => closeOmnibox());

    // 4. Input debounced search
    const input = $('ghost-omnibox-input');
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          performSearch(input.value);
        }, 120);
      });
    }

    // 5. Filter Tabs
    const filterTabs = document.querySelectorAll('.gof-tab');
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        activeFilter = tab.dataset.filter || 'all';
        performSearch(input ? input.value : '');
      });
    });
  }

  function updateSelectedUi() {
    const body = $('ghost-omnibox-body');
    if (!body) return;
    Array.from(body.children).forEach((child, idx) => {
      if (idx === selectedIndex) child.classList.add('selected');
      else child.classList.remove('selected');
    });
    ensureVisible();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__openGhostOmnibox = openOmnibox;
})();
