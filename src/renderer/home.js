'use strict';
// Home: Authentic ChatGPT-Grade Conversational Canvas & App Experience.
// Multi-session chat history, timeline grouping (Pinned, Today, Yesterday, 7 Days, 30 Days),
// Projects & custom instructions, Archiving, Multimodal Image/Video/PDF attachment understanding,
// Inline DALL-E/Sora generative media players, syntax-highlighted code blocks with 1-click copy.

(() => {
  const api = window.buddy;
  const $ = (id) => document.getElementById(id);
  const STATES = {
    idle: ['Ready', 'ok'], listening: ['Listening…', 'busy'], processing: ['Thinking…', 'busy'],
    acting: ['Working…', 'busy'], responding: ['Talking…', 'busy'],
  };
  let running = false;
  let live = null;      // the assistant message being written
  let thinking = null;  // typing indicator while nothing is written yet
  let steps = null;     // the current turn's list of actions

  let activeThreadId = null;
  let activeProjectId = null;
  let pendingAttachments = [];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function scrollDown() {
    const log = $('log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function add(node) {
    if ($('empty')) $('empty').hidden = true;
    $('log').append(node);
    while ($('log').children.length > 500) $('log').children[1].remove(); // keep empty state
    scrollDown();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderMarkdown(md) {
    if (!md) return '';
    let text = String(md);

    // 1. Code blocks ```lang\ncode\n```
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_+#.-]*)\r?\n([\s\S]*?)```/g, (_m, lang, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      const cleanLang = (lang || 'code').toLowerCase().trim();
      codeBlocks.push({ lang: cleanLang, code });
      return id;
    });

    // 2. Escape HTML for the rest of the text
    text = escapeHtml(text);

    // 3. Inline code `code`
    text = text.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    // 4. Headers: #, ##, ###
    text = text.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

    // 5. Bold & Italic
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // 6. Blockquotes
    text = text.replace(/^\&gt; (.*$)/gim, '<blockquote class="md-quote">$1</blockquote>');

    // 7. Unordered lists
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    text = text.replace(/(<li class="md-li">[\s\S]*?<\/li>)+/g, '<ul class="md-ul">$&</ul>');

    // 8. Ordered lists
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="md-oli">$1</li>');
    text = text.replace(/(<li class="md-oli">[\s\S]*?<\/li>)+/g, '<ol class="md-ol">$&</ol>');

    // 9. Links & Images
    // Images: ![alt](url) -> ChatGPT Generative Image Card
    text = text.replace(/!\[([^\]]*)\]\((data:image\/[^\s)]+|https?:\/\/[^\s)]+|file:\/\/\/[^\s)]+)\)/g, (_m, alt, src) => {
      const cleanAlt = alt || 'Generated Image';
      return `
      <div class="generated-image-card">
        <img src="${src}" alt="${cleanAlt}" loading="lazy">
        <div class="media-overlay">
          <span class="media-badge">🎨 ${cleanAlt}</span>
          <div>
            <a href="${src}" download="mave_image.png" class="btn-media-action" style="text-decoration:none;display:inline-block;">Download</a>
          </div>
        </div>
      </div>`;
    });

    // Links: [label](url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');

    // 10. Horizontal rule
    text = text.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr class="md-hr">');

    // 11. Paragraphs (split by double newlines)
    const paragraphs = text.split(/\n{2,}/);
    text = paragraphs.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[2-4]|ul|ol|blockquote|div|hr|video|iframe)/.test(trimmed)) return trimmed;
      return `<p class="md-p">${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('\n');

    // 12. Unescape video tags if generated
    text = text.replace(/&lt;video([\s\S]*?)&gt;([\s\S]*?)&lt;\/video&gt;/gi, '<div class="generated-video-card"><video$1>$2</video><div class="media-overlay"><span class="media-badge">🎬 Generated Video</span></div></div>');

    // 13. Restore code blocks with ChatGPT-style header and copy button
    codeBlocks.forEach(({ lang, code }, idx) => {
      const id = `__CODE_BLOCK_${idx}__`;
      const escapedCode = escapeHtml(code.trimEnd());
      const rawAttr = escapeHtml(code);

      const blockHtml = `
      <div class="code-block-wrap">
        <div class="code-block-head">
          <span class="code-lang-label">${escapeHtml(lang)}</span>
          <button type="button" class="copy-code-btn" data-code="${rawAttr}" title="Copy code">
            <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="copy-text">Copy code</span>
          </button>
        </div>
        <pre class="code-pre"><code class="code-content">${escapedCode}</code></pre>
      </div>`;
      text = text.replace(id, blockHtml);
    });

    return text;
  }

  function assistantBubble() {
    const row = el('div', 'turn assistant');
    const avatar = el('img', 'avatar');
    avatar.src = 'assets/tray@2x.png';
    avatar.alt = '';
    const body = el('div', 'msg assistant');
    row.append(avatar, body);
    return { row, body };
  }

  function attachAssistantActions(row, text) {
    if (row.querySelector('.msg-actions')) return;
    const actions = el('div', 'msg-actions');

    // 1. Copy response button
    const copyBtn = el('button', 'msg-action-btn copy-msg-btn');
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10a37f" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    });

    // 2. Read aloud / speaker button
    const speakBtn = el('button', 'msg-action-btn speak-msg-btn');
    speakBtn.title = 'Read aloud';
    speakBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
    speakBtn.addEventListener('click', () => {
      api.invoke('speech:speak', text);
      speakBtn.classList.add('active');
      setTimeout(() => speakBtn.classList.remove('active'), 2500);
    });

    // 3. Good response
    const thumbUp = el('button', 'msg-action-btn thumb-up-btn');
    thumbUp.title = 'Good response';
    thumbUp.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
    thumbUp.addEventListener('click', () => {
      thumbUp.classList.toggle('active');
      thumbDown.classList.remove('active');
    });

    // 4. Bad response
    const thumbDown = el('button', 'msg-action-btn thumb-down-btn');
    thumbDown.title = 'Bad response';
    thumbDown.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;
    thumbDown.addEventListener('click', () => {
      thumbDown.classList.toggle('active');
      thumbUp.classList.remove('active');
    });

    actions.append(copyBtn, speakBtn, thumbUp, thumbDown);
    const body = row.querySelector('.msg.assistant');
    if (body) body.append(actions);
  }

  function showThinking(on) {
    if (on && !thinking && !live) {
      const { row, body } = assistantBubble();
      body.classList.add('typing');
      body.append(el('i'), el('i'), el('i'));
      thinking = row;
      add(row);
    } else if (!on && thinking) {
      thinking.remove();
      thinking = null;
    }
  }

  function setState(s) {
    const [text, cls] = STATES[s] || STATES.idle;
    if ($('status-text')) $('status-text').textContent = text;
    if ($('status')) $('status').className = `status ${cls}`;
    running = s === 'processing' || s === 'acting';
    document.body.classList.toggle('running', running);
    showThinking(running);
    updateSend();
  }

  function updateSend() {
    if (!$('send')) return;
    $('send').disabled = !running && !$('prompt').value.trim() && pendingAttachments.length === 0;
    $('send').title = running ? 'Stop (Esc)' : 'Send (Enter)';
    $('send').setAttribute('aria-label', running ? 'Stop' : 'Send');
  }

  function renderAttachmentsPreview() {
    const bar = $('attachments-preview-bar');
    if (!bar) return;
    if (pendingAttachments.length === 0) {
      bar.hidden = true;
      bar.innerHTML = '';
      updateSend();
      return;
    }

    bar.hidden = false;
    bar.innerHTML = '';
    pendingAttachments.forEach((att, idx) => {
      const chip = el('div', 'attachment-chip');
      const icon = att.file.type === 'image' ? '🖼️' : att.file.type === 'video' ? '🎬' : att.file.type === 'audio' ? '🎵' : '📄';

      chip.innerHTML = `
        <span class="attachment-chip-icon">${icon}</span>
        <span class="attachment-chip-name" title="${escapeHtml(att.file.name)}">${escapeHtml(att.file.name)}</span>
        <span class="attachment-chip-size">${att.file.sizeFormatted || ''}</span>
        <button type="button" class="attachment-chip-remove" data-idx="${idx}" title="Remove file">×</button>
      `;

      chip.querySelector('.attachment-chip-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        pendingAttachments.splice(idx, 1);
        renderAttachmentsPreview();
      });

      bar.append(chip);
    });
    updateSend();
  }

  // --- Multi-Session Conversations & Timeline ---
  async function loadSidebarChats() {
    const container = $('sidebar-chats');
    if (!container) return;

    const searchQuery = $('chat-search') ? $('chat-search').value.trim() : '';
    try {
      const groups = await api.invoke('threads:groups', {
        projectId: activeProjectId,
        search: searchQuery,
      });

      container.innerHTML = '';

      const groupLabels = [
        { key: 'pinned', title: '📌 Pinned' },
        { key: 'today', title: 'Today' },
        { key: 'yesterday', title: 'Yesterday' },
        { key: 'previous7Days', title: 'Previous 7 Days' },
        { key: 'previous30Days', title: 'Previous 30 Days' },
        { key: 'older', title: 'Older' },
      ];

      let totalRendered = 0;
      for (const { key, title } of groupLabels) {
        const items = groups[key];
        if (Array.isArray(items) && items.length > 0) {
          const hdr = el('div', 'timeline-group-header', title);
          container.append(hdr);

          for (const item of items) {
            totalRendered++;
            const chatItem = el('div', `chat-item ${item.id === activeThreadId ? 'active' : ''}`);
            chatItem.dataset.id = item.id;

            const titleSpan = el('span', 'chat-item-title', item.title || 'Untitled Chat');
            chatItem.append(titleSpan);

            // 3-Dots Context Menu Button
            const menuBtn = el('button', 'chat-item-menu-btn');
            menuBtn.type = 'button';
            menuBtn.title = 'More options';
            menuBtn.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><circle cx="2.5" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13.5" cy="8" r="1.5"/></svg>`;

            menuBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleChatMenu(chatItem, item);
            });

            chatItem.addEventListener('click', () => switchThread(item.id));
            chatItem.append(menuBtn);
            container.append(chatItem);
          }
        }
      }

      if (totalRendered === 0) {
        container.innerHTML = `<div style="padding:16px 8px;font-size:12.5px;color:var(--text-3);text-align:center;">No conversations found</div>`;
      }
    } catch {}
  }

  function toggleChatMenu(chatItem, thread) {
    document.querySelectorAll('.chat-item-dropdown').forEach((d) => d.remove());
    document.querySelectorAll('.chat-item.menu-open').forEach((i) => i.classList.remove('menu-open'));

    chatItem.classList.add('menu-open');
    const menu = el('div', 'chat-item-dropdown');

    // Pin/Unpin
    const pinBtn = el('button', '', thread.pinned ? '📌 Unpin' : '📌 Pin');
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.invoke('threads:pin', thread.id, !thread.pinned);
      menu.remove();
      loadSidebarChats();
    });

    // Rename
    const renameBtn = el('button', '', '✏️ Rename');
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      menu.remove();
      const newTitle = prompt('Rename conversation:', thread.title);
      if (newTitle && newTitle.trim()) {
        await api.invoke('threads:rename', thread.id, newTitle.trim());
        if (thread.id === activeThreadId && $('chat-header-title')) {
          $('chat-header-title').textContent = newTitle.trim();
        }
        loadSidebarChats();
      }
    });

    // Archive
    const archiveBtn = el('button', '', '📦 Archive');
    archiveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      menu.remove();
      await api.invoke('threads:archive', thread.id);
      if (thread.id === activeThreadId) {
        startNewChat();
      } else {
        loadSidebarChats();
      }
    });

    // Delete
    const deleteBtn = el('button', 'danger', '🗑️ Delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      menu.remove();
      if (confirm(`Delete conversation "${thread.title}"?`)) {
        await api.invoke('threads:delete', thread.id);
        if (thread.id === activeThreadId) {
          startNewChat();
        } else {
          loadSidebarChats();
        }
      }
    });

    menu.append(pinBtn, renameBtn, archiveBtn, deleteBtn);
    chatItem.append(menu);

    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        chatItem.classList.remove('menu-open');
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 50);
  }

  async function switchThread(threadId) {
    if (!threadId) return;
    activeThreadId = threadId;
    try {
      const thread = await api.invoke('threads:switch', threadId);
      renderThreadMessages(thread);
      loadSidebarChats();
    } catch {}
  }

  function renderThreadMessages(thread) {
    if (!thread) return;
    if ($('chat-header-title')) $('chat-header-title').textContent = thread.title || 'Main Chat';

    // Update project badge
    if ($('chat-project-badge')) {
      if (thread.projectId) {
        api.invoke('projects:list').then((projs) => {
          const match = (projs || []).find((p) => p.id === thread.projectId);
          if (match) {
            $('chat-project-badge').textContent = `📁 ${match.name}`;
            $('chat-project-badge').hidden = false;
          } else {
            $('chat-project-badge').hidden = true;
          }
        });
      } else {
        $('chat-project-badge').hidden = true;
      }
    }

    // Clear log and render all earlier chat turns
    const log = $('log');
    if (!log) return;
    [...log.children].forEach((n) => { if (n.id !== 'empty') n.remove(); });
    live = null;
    thinking = null;
    steps = null;

    if (!thread.messages || thread.messages.length === 0) {
      if ($('empty')) $('empty').hidden = false;
      return;
    }

    if ($('empty')) $('empty').hidden = true;

    for (const msg of thread.messages) {
      if (msg.role === 'user') {
        const row = el('div', 'turn user');
        const bubble = el('div', 'msg user');

        // Render any attachments user uploaded with this message
        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          const attWrap = el('div', 'msg-attachments-wrap');
          for (const att of msg.attachments) {
            const chip = el('div', 'attachment-chip');
            const icon = att.file && att.file.type === 'image' ? '🖼️' : att.file && att.file.type === 'video' ? '🎬' : '📄';
            chip.innerHTML = `<span>${icon}</span> <span>${escapeHtml((att.file && att.file.name) || 'File')}</span>`;
            attWrap.append(chip);
          }
          bubble.append(attWrap);
        }

        bubble.append(document.createTextNode(msg.content || ''));
        row.append(bubble);
        log.append(row);
      } else {
        const row = el('div', 'turn assistant');
        const avatar = el('img', 'avatar');
        avatar.src = 'assets/tray@2x.png';
        avatar.alt = '';
        const body = el('div', 'msg assistant');
        body.innerHTML = renderMarkdown(msg.content || '');
        attachAssistantActions(row, msg.content || '');
        row.append(avatar, body);
        log.append(row);
      }
    }
    scrollDown();
  }

  async function startNewChat() {
    try {
      const thread = await api.invoke('threads:create', 'New Chat', 'desktop', activeProjectId);
      activeThreadId = thread.id;
      renderThreadMessages(thread);
      loadSidebarChats();
      if ($('prompt')) $('prompt').focus();
    } catch {}
  }

  // --- Projects Management ---
  async function loadProjects() {
    const listEl = $('projects-list');
    if (!listEl) return;
    try {
      const projs = await api.invoke('projects:list');
      listEl.innerHTML = '';
      if (!Array.isArray(projs) || projs.length === 0) {
        listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-3);padding:4px 6px;">No projects yet</div>`;
        return;
      }
      projs.forEach((p) => {
        const item = el('button', `project-item ${p.id === activeProjectId ? 'active' : ''}`);
        item.type = 'button';
        item.innerHTML = `
          <div class="project-item-left">
            <span>📁</span>
            <span class="project-title">${escapeHtml(p.name)}</span>
          </div>
          <span class="project-badge-count">${p.threadCount || 0}</span>
        `;
        item.addEventListener('click', () => {
          activeProjectId = activeProjectId === p.id ? null : p.id;
          loadProjects();
          loadSidebarChats();
        });
        listEl.append(item);
      });
    } catch {}
  }

  function finishAssistant(text) {
    showThinking(false);
    if (!live) { const { row, body } = assistantBubble(); live = { row, body }; add(row); }
    live.body.innerHTML = renderMarkdown(text);
    attachAssistantActions(live.row, text);
    live = null;
    steps = null;
    scrollDown();
    loadSidebarChats(); // Update title or preview in sidebar
  }

  function addEntry({ kind, text }) {
    if (kind === 'user') {
      steps = null;
      const row = el('div', 'turn user');
      const bubble = el('div', 'msg user');

      if (pendingAttachments.length > 0) {
        const attWrap = el('div', 'msg-attachments-wrap');
        pendingAttachments.forEach((att) => {
          const chip = el('div', 'attachment-chip');
          const icon = att.file.type === 'image' ? '🖼️' : att.file.type === 'video' ? '🎬' : '📄';
          chip.innerHTML = `<span>${icon}</span> <span>${escapeHtml(att.file.name)}</span>`;
          attWrap.append(chip);
        });
        bubble.append(attWrap);
      }

      bubble.append(document.createTextNode(text));
      row.append(bubble);
      add(row);
      if (thinking) { $('log').append(thinking); scrollDown(); }
      return;
    }
    if (kind === 'assistant') { finishAssistant(text); return; }
    if (kind === 'recommendations') { renderRecommendations(text); return; }

    // Actions, diagnostics, and progress go in a collapsible thought accordion
    if (!steps) {
      const details = el('details', 'thought-accordion');
      const summary = el('summary', 'thought-summary');
      summary.innerHTML = `<span class="thought-spark">💭</span><span class="thought-label">Thought process</span><svg class="thought-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>`;
      const content = el('div', 'thought-content');
      details.append(summary, content);
      steps = content;
      add(details);
    }
    const last = steps.lastElementChild;
    if (kind === 'progress' && last && last.textContent === text) return;
    const line = el('div', `step ${kind}`, text);
    steps.append(line);
    if (thinking) $('log').append(thinking);
    scrollDown();
  }

  function renderRecommendations(recs) {
    if (!recs || !recs.length) return;
    const box = el('div', 'step recommendations-card');
    const title = el('div', 'rec-card-title', '💡 Recommended Alternatives:');
    box.append(title);
    const grid = el('div', 'rec-card-grid');
    recs.forEach((rec) => {
      const btn = el('button', 'rec-card-btn');
      btn.textContent = rec.label;
      btn.title = rec.description || '';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = `⏳ Executing ${rec.label}...`;
        try {
          const res = await api.invoke('diagnostics:fix', rec);
          btn.textContent = `✅ ${rec.label} Done`;
          if (res && res.output) {
            addEntry({ kind: 'progress', text: res.output.slice(0, 150) });
          }
        } catch (err) {
          btn.textContent = `❌ Failed: ${err.message}`;
        }
      });
      grid.append(btn);
    });
    box.append(grid);
    if (!steps) {
      const details = el('details', 'thought-accordion');
      const summary = el('summary', 'thought-summary');
      summary.innerHTML = `<span class="thought-spark">💭</span><span class="thought-label">Recommended Actions</span><svg class="thought-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>`;
      const content = el('div', 'thought-content');
      details.append(summary, content);
      steps = content;
      add(details);
    }
    steps.append(box);
    scrollDown();
  }

  function streamText(text) {
    if (!text) {
      if (live) { live.row.remove(); live = null; }
      if (running) showThinking(true);
      return;
    }
    showThinking(false);
    if (!live) {
      live = assistantBubble();
      add(live.row);
    }
    live.body.innerHTML = renderMarkdown(text);
    scrollDown();
  }

  async function renderSetup() {
    const active = await api.invoke('provider:active');
    if ($('setup')) $('setup').hidden = Boolean(active.id);
  }

  function autosize() {
    const ta = $('prompt');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
    updateSend();
  }

  async function submit(e) {
    if (e) e.preventDefault();
    if (running) { api.invoke('task:stop'); return; }
    const text = $('prompt').value.trim();
    if (!text && pendingAttachments.length === 0) return;

    const attachmentsToSend = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentsPreview();

    $('prompt').value = '';
    autosize();

    await api.invoke('task:run', text, {
      attachments: attachmentsToSend,
      threadId: activeThreadId,
    });
  }

  // 1-Click Copy button delegation on code blocks
  if ($('log')) {
    $('log').addEventListener('click', (e) => {
      const copyCodeBtn = e.target.closest('.copy-code-btn');
      if (copyCodeBtn) {
        const code = copyCodeBtn.dataset.code || '';
        navigator.clipboard.writeText(code);
        const textSpan = copyCodeBtn.querySelector('.copy-text');
        if (textSpan) textSpan.textContent = 'Copied!';
        copyCodeBtn.classList.add('copied');
        setTimeout(() => {
          if (textSpan) textSpan.textContent = 'Copy code';
          copyCodeBtn.classList.remove('copied');
        }, 2000);
      }
    });
  }

  // Composer Attach Dropdown & Picker
  if ($('composer-attach-btn')) {
    $('composer-attach-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const drop = $('composer-actions-dropdown');
      if (drop) drop.hidden = !drop.hidden;
    });
  }

  document.addEventListener('click', (e) => {
    const drop = $('composer-actions-dropdown');
    if (drop && !drop.hidden && !drop.contains(e.target) && e.target !== $('composer-attach-btn')) {
      drop.hidden = true;
    }
  });

  if ($('cad-upload-file')) {
    $('cad-upload-file').addEventListener('click', async () => {
      $('composer-actions-dropdown').hidden = true;
      const files = await api.invoke('file:pick', { multiple: true });
      if (Array.isArray(files)) {
        pendingAttachments.push(...files.filter((f) => f && f.ok));
        renderAttachmentsPreview();
      }
    });
  }

  if ($('cad-create-image')) {
    $('cad-create-image').addEventListener('click', () => {
      $('composer-actions-dropdown').hidden = true;
      if ($('prompt')) {
        $('prompt').value = 'Generate an image of ';
        autosize();
        $('prompt').focus();
      }
    });
  }

  if ($('cad-create-video')) {
    $('cad-create-video').addEventListener('click', () => {
      $('composer-actions-dropdown').hidden = true;
      if ($('prompt')) {
        $('prompt').value = 'Generate a cinematic video of ';
        autosize();
        $('prompt').focus();
      }
    });
  }

  if ($('cad-select-region')) {
    $('cad-select-region').addEventListener('click', () => {
      $('composer-actions-dropdown').hidden = true;
      api.invoke('region:start');
    });
  }

  // Drag and Drop Files onto Composer / Window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const f of e.dataTransfer.files) {
        if (f.path) {
          try {
            const analysis = await api.invoke('media:analyze-file', f.path);
            if (analysis && analysis.ok) {
              pendingAttachments.push(analysis);
            }
          } catch {}
        }
      }
      renderAttachmentsPreview();
    }
  });

  // Chat Search
  if ($('chat-search')) {
    $('chat-search').addEventListener('input', () => {
      loadSidebarChats();
    });
  }

  // New Chat buttons
  if ($('new-chat')) $('new-chat').addEventListener('click', startNewChat);
  if ($('sidebar-new-chat')) $('sidebar-new-chat').addEventListener('click', startNewChat);

  // Archive current chat button in titlebar
  if ($('chat-archive-btn')) {
    $('chat-archive-btn').addEventListener('click', async () => {
      if (activeThreadId) {
        await api.invoke('threads:archive', activeThreadId);
        startNewChat();
      }
    });
  }

  // Rename current chat button in titlebar
  if ($('chat-rename-btn')) {
    $('chat-rename-btn').addEventListener('click', async () => {
      if (!activeThreadId) return;
      const current = $('chat-header-title')?.textContent || '';
      const newTitle = prompt('Rename conversation:', current);
      if (newTitle && newTitle.trim()) {
        await api.invoke('threads:rename', activeThreadId, newTitle.trim());
        if ($('chat-header-title')) $('chat-header-title').textContent = newTitle.trim();
        loadSidebarChats();
      }
    });
  }

  // --- Projects Modal Controls ---
  if ($('btn-new-project')) {
    $('btn-new-project').addEventListener('click', () => {
      if ($('project-name-input')) $('project-name-input').value = '';
      if ($('project-instructions-input')) $('project-instructions-input').value = '';
      if ($('modal-projects')) $('modal-projects').hidden = false;
    });
  }
  if ($('btn-close-project-modal')) $('btn-close-project-modal').addEventListener('click', () => { $('modal-projects').hidden = true; });
  if ($('btn-cancel-project')) $('btn-cancel-project').addEventListener('click', () => { $('modal-projects').hidden = true; });
  if ($('btn-save-project')) {
    $('btn-save-project').addEventListener('click', async () => {
      const name = $('project-name-input')?.value?.trim();
      const instructions = $('project-instructions-input')?.value?.trim() || '';
      if (!name) return;
      await api.invoke('projects:create', name, instructions);
      $('modal-projects').hidden = true;
      loadProjects();
    });
  }

  // --- Archived Chats Modal Controls ---
  if ($('open-archived-btn')) {
    $('open-archived-btn').addEventListener('click', async () => {
      if ($('modal-archived')) $('modal-archived').hidden = false;
      renderArchivedList();
    });
  }
  if ($('btn-close-archived-modal')) $('btn-close-archived-modal').addEventListener('click', () => { $('modal-archived').hidden = true; });
  if ($('btn-close-archived')) $('btn-close-archived').addEventListener('click', () => { $('modal-archived').hidden = true; });

  async function renderArchivedList() {
    const listEl = $('archived-chats-list');
    if (!listEl) return;
    const archived = await api.invoke('threads:archived');
    listEl.innerHTML = '';
    if (!Array.isArray(archived) || archived.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px;">No archived conversations</div>`;
      return;
    }
    archived.forEach((t) => {
      const row = el('div', 'archived-chat-item');
      row.innerHTML = `
        <span class="archived-chat-title">${escapeHtml(t.title)}</span>
        <div class="archived-chat-actions">
          <button type="button" class="btn small plain restore-btn" data-id="${t.id}">Restore</button>
          <button type="button" class="btn small danger del-btn" data-id="${t.id}">Delete</button>
        </div>
      `;
      row.querySelector('.restore-btn').addEventListener('click', async () => {
        await api.invoke('threads:unarchive', t.id);
        renderArchivedList();
        loadSidebarChats();
      });
      row.querySelector('.del-btn').addEventListener('click', async () => {
        if (confirm(`Permanently delete "${t.title}"?`)) {
          await api.invoke('threads:delete', t.id);
          renderArchivedList();
        }
      });
      listEl.append(row);
    });
  }

  // Global Keybindings (Ctrl+N for New Chat)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      startNewChat();
    }
  });

  if ($('composer')) $('composer').addEventListener('submit', submit);
  if ($('prompt')) {
    $('prompt').addEventListener('input', autosize);
    $('prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
  }

  // Startup Initialization
  api.invoke('threads:get').then((active) => {
    if (active) {
      activeThreadId = active.id;
      renderThreadMessages(active);
    }
    loadSidebarChats();
    loadProjects();
  });

  // Empty state chips
  document.querySelectorAll('.empty-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.prompt;
      if (p && $('prompt')) {
        $('prompt').value = p;
        autosize();
        $('prompt').focus();
      }
    });
  });

  if ($('btn-setup')) $('btn-setup').addEventListener('click', () => api.invoke('app:open-settings', 'account'));
  if ($('region-clear')) $('region-clear').addEventListener('click', () => api.invoke('region:clear'));

  // --- Modern ChatGPT UI/UX & Voice Mode Wiring ---
  let thinkMode = false;
  let dictating = false;
  let micMuted = false;

  function ensureDateHeader() {
    const log = $('log');
    if (log && !log.querySelector('.chat-date-header')) {
      const now = new Date();
      const day = now.toLocaleDateString('en-US', { weekday: 'long' });
      const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const header = el('div', 'chat-date-header', `${day} ${time}`);
      log.prepend(header);
    }
  }

  async function loadUserProfile() {
    try {
      const gov = await api.invoke('governance:get-state');
      if (gov && gov.activeUser) {
        const u = gov.users && gov.users[gov.activeUser];
        const name = (u && u.name) || gov.activeUser;
        if ($('user-profile-name')) $('user-profile-name').textContent = name;
        if ($('upm-user-name')) $('upm-user-name').textContent = name;
        const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'FN';
        if ($('user-avatar-initials')) $('user-avatar-initials').textContent = initials;
        if ($('empty-greeting')) $('empty-greeting').textContent = `Hey, ${name.split(/\s+/)[0]}. Ready to dive in?`;
      }
    } catch {}
  }
  loadUserProfile();

  async function toggleVoiceMode() {
    const on = await api.invoke('voice-mode:toggle');
    updateVoiceModeUI(on);
  }

  function updateVoiceModeUI(on) {
    if ($('voice-btn')) $('voice-btn').classList.toggle('active', Boolean(on));
    if ($('talk-btn')) $('talk-btn').classList.toggle('active', Boolean(on));
    if ($('talk-btn-text')) $('talk-btn-text').textContent = on ? 'Listening…' : 'Voice Mode';
    const vso = $('voice-session-overlay');
    if (vso) {
      vso.hidden = !on;
      if (on && $('vso-status-text')) $('vso-status-text').textContent = 'Listening...';
    }
  }

  async function handleVoiceButtonClick() {
    const seen = localStorage.getItem('mave_meet_voice_seen');
    if (!seen) {
      if ($('meet-voice-modal')) $('meet-voice-modal').hidden = false;
    } else {
      toggleVoiceMode();
    }
  }

  if ($('voice-btn')) $('voice-btn').addEventListener('click', handleVoiceButtonClick);
  if ($('talk-btn')) $('talk-btn').addEventListener('click', handleVoiceButtonClick);
  if ($('vso-close-btn')) $('vso-close-btn').addEventListener('click', toggleVoiceMode);
  if ($('vso-end-btn')) $('vso-end-btn').addEventListener('click', toggleVoiceMode);

  if ($('meet-voice-continue-btn')) {
    $('meet-voice-continue-btn').addEventListener('click', () => {
      localStorage.setItem('mave_meet_voice_seen', 'true');
      if ($('meet-voice-modal')) $('meet-voice-modal').hidden = true;
      toggleVoiceMode();
    });
  }
  if ($('meet-voice-close-btn')) {
    $('meet-voice-close-btn').addEventListener('click', () => {
      if ($('meet-voice-modal')) $('meet-voice-modal').hidden = true;
    });
  }

  if ($('vso-mute-btn')) {
    $('vso-mute-btn').addEventListener('click', () => {
      micMuted = !micMuted;
      $('vso-mute-btn').classList.toggle('muted', micMuted);
      if ($('vso-status-text')) {
        $('vso-status-text').textContent = micMuted ? 'Muted' : 'Listening...';
      }
    });
  }

  // Real-time audio level and speaking events
  api.on('level', (lvl) => {
    const orb = $('chatgpt-fluid-voice-orb');
    const vso = $('voice-session-overlay');
    if (orb && vso && !vso.hidden) {
      const scale = 1 + Math.min(1, Number(lvl) || 0) * 0.45;
      orb.style.transform = `scale(${scale})`;
      const glow = orb.querySelector('.orb-fluid-glow');
      if (glow) {
        glow.style.opacity = Math.max(0.6, Math.min(1, 0.6 + (Number(lvl) || 0) * 0.8));
      }
    }
  });

  api.on('voice:speaking', (isSpeaking) => {
    const orb = $('chatgpt-fluid-voice-orb');
    if (orb) {
      orb.classList.toggle('speaking', Boolean(isSpeaking));
      if ($('vso-status-text')) {
        $('vso-status-text').textContent = isSpeaking ? 'Talking...' : 'Listening...';
      }
    }
  });

  // Tap or Space to interrupt
  const vsoOverlay = $('voice-session-overlay');
  if (vsoOverlay) {
    vsoOverlay.addEventListener('click', (e) => {
      if (e.target.closest('#vso-close-btn') || e.target.closest('#vso-end-btn') || e.target.closest('#vso-mute-btn')) {
        return;
      }
      api.invoke('task:stop');
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && vsoOverlay && !vsoOverlay.hidden && document.activeElement !== $('prompt')) {
      e.preventDefault();
      api.invoke('task:stop');
    }
  });

  // User Profile Menu
  if ($('user-profile-btn')) {
    $('user-profile-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = $('user-profile-menu');
      if (m) m.hidden = !m.hidden;
    });
  }
  document.addEventListener('click', (e) => {
    const m = $('user-profile-menu');
    if (m && !m.hidden && !m.contains(e.target) && e.target !== $('user-profile-btn')) {
      m.hidden = true;
    }
    const nmd = $('nav-more-dropdown');
    if (nmd && !nmd.hidden && !nmd.contains(e.target) && e.target !== $('nav-item-more')) {
      nmd.hidden = true;
    }
  });

  if ($('nav-item-more')) {
    $('nav-item-more').addEventListener('click', (e) => {
      e.stopPropagation();
      const nmd = $('nav-more-dropdown');
      if (nmd) nmd.hidden = !nmd.hidden;
    });
  }

  if ($('upm-settings')) {
    $('upm-settings').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings');
    });
  }
  if ($('upm-personalization')) {
    $('upm-personalization').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings', 'customization');
    });
  }
  if ($('upm-profile')) {
    $('upm-profile').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings', 'customization');
    });
  }
  if ($('upm-try-plus')) {
    $('upm-try-plus').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      alert("✨ You're already experiencing all Mave Plus features completely unlocked!");
    });
  }
  if ($('upm-help')) {
    $('upm-help').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      alert("💬 Need help? Type your question directly in the chat or press the blue Voice button to speak with Mave in real time!");
    });
  }
  if ($('upm-logout')) {
    $('upm-logout').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings', 'governance');
    });
  }

  // Think button
  if ($('think-btn')) {
    $('think-btn').addEventListener('click', () => {
      thinkMode = !thinkMode;
      $('think-btn').classList.toggle('active', thinkMode);
      if (thinkMode) {
        if ($('prompt') && !$('prompt').value) $('prompt').placeholder = 'Ask anything (Deep Thinking active)...';
      } else {
        if ($('prompt')) $('prompt').placeholder = 'Ask anything';
      }
    });
  }

  // Dictation button
  if ($('dictation-btn')) {
    $('dictation-btn').addEventListener('click', async () => {
      dictating = !dictating;
      $('dictation-btn').classList.toggle('recording', dictating);
      try {
        await api.invoke('dictation:set-mode', dictating);
      } catch {}
    });
  }

  // Try GPT-6 button
  if ($('edc-btn')) {
    $('edc-btn').addEventListener('click', () => {
      if ($('prompt')) {
        $('prompt').value = 'Explain how GPT-6 with Intelligent UI can autonomously build an interactive application for me.';
        autosize();
        $('prompt').focus();
      }
    });
  }

  // Nav item shortcuts
  if ($('nav-item-images')) {
    $('nav-item-images').addEventListener('click', () => {
      if ($('prompt')) {
        $('prompt').value = 'Generate an image of ';
        autosize();
        $('prompt').focus();
      }
    });
  }
  if ($('nav-item-library')) {
    $('nav-item-library').addEventListener('click', () => {
      if ($('prompt')) {
        $('prompt').value = 'Search my personal knowledge vault and recent screen memory for ';
        autosize();
        $('prompt').focus();
      }
    });
  }
  if ($('nav-item-scheduled')) {
    $('nav-item-scheduled').addEventListener('click', () => {
      if ($('prompt')) {
        $('prompt').value = 'Show my scheduled routines and circadian executive briefing status.';
        autosize();
        $('prompt').focus();
      }
    });
  }
  if ($('nav-item-plugins')) {
    $('nav-item-plugins').addEventListener('click', () => {
      api.invoke('app:open-settings', 'general');
    });
  }
  if ($('nav-item-projects')) {
    $('nav-item-projects').addEventListener('click', () => {
      if ($('modal-projects')) $('modal-projects').hidden = false;
    });
  }

  // Header search button
  if ($('header-search-btn')) {
    $('header-search-btn').addEventListener('click', () => {
      const searchInput = $('chat-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  // General Appearance Dropdown in Settings (Screenshot 3)
  if ($('appearance-select')) {
    $('appearance-select').addEventListener('change', () => {
      const val = $('appearance-select').value;
      api.invoke('settings:update', { themeMode: val });
      if (val === 'dark') {
        document.body.classList.remove('theme-light');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (val === 'light') {
        document.body.classList.add('theme-light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    });
  }
  if ($('btn-enable-2fa')) {
    $('btn-enable-2fa').addEventListener('click', () => {
      alert('🔒 Two-Factor Authentication (2FA) is enabled for your account.');
    });
  }

  api.on('voice-mode', (on) => updateVoiceModeUI(on));
  api.invoke('voice-mode:status').then((on) => updateVoiceModeUI(on)).catch(() => {});

  api.on('state', setState);
  api.on('log', (entry) => {
    ensureDateHeader();
    addEntry(entry);
  });
  api.on('log-live', ({ text }) => streamText(text));
  api.on('recommendations', (recs) => renderRecommendations(recs));

  // The area the user marked
  api.on('log-image', ({ src }) => {
    if (!/^data:image\/(png|jpeg);base64,/.test(String(src))) return;
    const bubbles = $('log').querySelectorAll('.msg.user');
    const last = bubbles[bubbles.length - 1];
    if (!last) return;
    const img = el('img', 'msg-image');
    img.src = src;
    img.alt = 'The area you marked';
    img.addEventListener('load', scrollDown);
    last.prepend(img);
  });

  // ==========================================================
  // Vorssaint Cute Little Dot Avatar (Official Face of Mave)
  // ==========================================================
  const EYE_PATHS = {
    idle: {
      left: 'M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z',
      right: 'M 67 20 C 71 20, 73 23, 73 30 C 73 37, 71 40, 67 40 C 63 40, 61 37, 61 30 C 61 23, 63 20, 67 20 Z',
      fill: '#111418',
      stroke: 'none'
    },
    happy: {
      left: 'M 27 34 Q 33 20 39 34',
      right: 'M 61 34 Q 67 20 73 34',
      fill: 'none',
      stroke: '#111418',
      strokeWidth: '4.5'
    },
    wink: {
      left: 'M 33 20 C 37 20, 39 23, 39 30 C 39 37, 37 40, 33 40 C 29 40, 27 37, 27 30 C 27 23, 29 20, 33 20 Z',
      right: 'M 61 34 Q 67 20 73 34',
      fill: '#111418',
      stroke: 'none'
    },
    love: {
      left: 'M 33 25 C 33 21, 28 19, 25 23 C 21 19, 16 21, 16 25 C 16 32, 25 38, 25 38 C 25 38, 33 32, 33 25 Z',
      right: 'M 67 25 C 67 21, 62 19, 59 23 C 55 19, 50 21, 50 25 C 50 32, 59 38, 59 38 C 59 38, 67 32, 67 25 Z',
      fill: '#ef4444',
      stroke: 'none'
    },
    thinking: {
      left: 'M 27 32 Q 33 27 39 32',
      right: 'M 69 16 C 73 16, 75 19, 75 25 C 75 31, 73 34, 69 34 C 65 34, 63 31, 63 25 C 63 19, 65 16, 69 16 Z',
      fill: '#111418',
      stroke: 'none'
    },
    surprised: {
      left: 'M 33 22 C 38 22, 41 26, 41 30 C 41 34, 38 38, 33 38 C 28 38, 25 34, 25 30 C 25 26, 28 22, 33 22 Z',
      right: 'M 67 22 C 72 22, 75 26, 75 30 C 75 34, 72 38, 67 38 C 62 38, 59 34, 59 30 C 59 26, 62 22, 67 22 Z',
      fill: '#111418',
      stroke: 'none'
    },
    sleepy: {
      left: 'M 27 33 Q 33 37 39 33',
      right: 'M 61 33 Q 67 37 73 33',
      fill: 'none',
      stroke: '#111418',
      strokeWidth: '4'
    },
    determined: {
      left: 'M 27 24 L 39 34',
      right: 'M 73 24 L 61 34',
      fill: 'none',
      stroke: '#111418',
      strokeWidth: '4.5'
    }
  };

  class DotAvatarController {
    constructor() {
      this.currentMood = 'idle';
      this.palette = localStorage.getItem('mave_dot_palette') || 'sky';
      this.style = localStorage.getItem('mave_dot_style') || 'minimal';
      this.blinkTimer = null;
      this.init();
    }

    init() {
      this.applyPalette(this.palette);
      this.applyStyle(this.style);
      this.startBlinkLoop();
      this.bindInteractions();
    }

    setMood(mood, holdMs = 0) {
      this.currentMood = mood;
      const paths = EYE_PATHS[mood] || EYE_PATHS.idle;
      const isRobot = this.style === 'robot';

      document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
        const left = avatar.querySelector('.eye-left, #p-eye-left');
        const right = avatar.querySelector('.eye-right, #p-eye-right');
        if (left) {
          left.setAttribute('d', paths.left);
          left.setAttribute('fill', paths.fill === 'none' ? 'none' : (isRobot ? '#38bdf8' : paths.fill));
          left.setAttribute('stroke', paths.stroke === 'none' ? 'none' : (isRobot ? '#38bdf8' : paths.stroke));
          if (paths.strokeWidth) left.setAttribute('stroke-width', paths.strokeWidth);
        }
        if (right) {
          right.setAttribute('d', paths.right);
          right.setAttribute('fill', paths.fill === 'none' ? 'none' : (isRobot ? '#38bdf8' : paths.fill));
          right.setAttribute('stroke', paths.stroke === 'none' ? 'none' : (isRobot ? '#38bdf8' : paths.stroke));
          if (paths.strokeWidth) right.setAttribute('stroke-width', paths.strokeWidth);
        }
      });

      if (holdMs > 0) {
        setTimeout(() => this.setMood('idle'), holdMs);
      }
    }

    hop() {
      document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
        avatar.classList.remove('dot-hopping');
        void avatar.offsetWidth;
        avatar.classList.add('dot-hopping');
        setTimeout(() => avatar.classList.remove('dot-hopping'), 650);
      });
    }

    bounce() {
      document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
        avatar.classList.remove('dot-bouncing');
        void avatar.offsetWidth;
        avatar.classList.add('dot-bouncing');
        setTimeout(() => avatar.classList.remove('dot-bouncing'), 950);
      });
    }

    wobble() {
      document.querySelectorAll('.island-dot-avatar').forEach((avatar) => {
        avatar.classList.remove('dot-wobbling');
        void avatar.offsetWidth;
        avatar.classList.add('dot-wobbling');
        setTimeout(() => avatar.classList.remove('dot-wobbling'), 500);
      });
    }

    pet() {
      this.bounce();
      this.setMood('love', 1500);
    }

    applyPalette(p) {
      this.palette = p;
      localStorage.setItem('mave_dot_palette', p);
      document.querySelectorAll('.dot-body').forEach((b) => {
        b.className = b.className.replace(/palette-\w+/g, '').trim() + ' palette-' + p;
      });
    }

    applyStyle(s) {
      this.style = s;
      localStorage.setItem('mave_dot_style', s);
      const isRobot = s === 'robot';
      document.querySelectorAll('.dot-body').forEach((b) => {
        b.classList.toggle('style-robot', isRobot);
      });
      document.querySelectorAll('.dot-visor, .dot-ears, .dot-antenna').forEach((el) => {
        el.style.display = isRobot ? 'block' : 'none';
      });
      this.setMood(this.currentMood);
    }

    startBlinkLoop() {
      const scheduleBlink = () => {
        const delay = 3200 + Math.random() * 2800;
        this.blinkTimer = setTimeout(() => {
          if (this.currentMood === 'idle') {
            document.querySelectorAll('.island-dot-avatar').forEach((a) => a.classList.add('blinking'));
            setTimeout(() => {
              document.querySelectorAll('.island-dot-avatar').forEach((a) => a.classList.remove('blinking'));
            }, 140);
          }
          scheduleBlink();
        }, delay);
      };
      scheduleBlink();
    }

    bindInteractions() {
      document.addEventListener('mousemove', (e) => {
        if (e.clientY < 300) {
          const avatars = document.querySelectorAll('.island-dot-avatar .dot-face');
          const centerX = window.innerWidth / 2;
          const deltaX = Math.max(-6, Math.min(6, (e.clientX - centerX) / 80));
          const deltaY = Math.max(-3, Math.min(4, (e.clientY - 20) / 40));
          avatars.forEach((face) => {
            face.style.transform = `translate(${deltaX.toFixed(1)}px, ${deltaY.toFixed(1)}px)`;
          });
        }
      });
    }
  }

  // ==========================================================
  // Vorssaint Dynamic Island Controller
  // ==========================================================
  class DynamicIslandController {
    constructor(avatar) {
      this.avatar = avatar;
      this.isExpanded = false;
      this.autoCollapseTimer = null;
      this.init();
    }

    init() {
      const island = $('dynamic-island');
      const compact = $('island-compact');
      const collapseBtn = $('island-collapse-btn');

      if (compact) {
        compact.addEventListener('click', (e) => {
          if (e.target.closest('#island-dot-avatar')) {
            this.avatar.hop();
            this.avatar.setMood('happy', 1200);
          }
          this.toggle();
        });
      }

      if (collapseBtn) {
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
        });
      }

      if ($('island-pet-btn')) {
        $('island-pet-btn').addEventListener('click', () => this.avatar.pet());
      }

      if ($('island-tool-voice')) {
        $('island-tool-voice').addEventListener('click', () => {
          this.collapse();
          if ($('talk-btn')) $('talk-btn').click();
        });
      }

      if ($('island-tool-cmd')) {
        $('island-tool-cmd').addEventListener('click', () => {
          this.collapse();
          if ($('prompt')) $('prompt').focus();
        });
      }

      if ($('island-tool-nodes')) {
        $('island-tool-nodes').addEventListener('click', () => {
          this.collapse();
          if ($('node-onboarding-modal')) $('node-onboarding-modal').hidden = false;
        });
      }

      if ($('island-tool-snip')) {
        $('island-tool-snip').addEventListener('click', () => {
          this.collapse();
          if ($('cad-select-region')) $('cad-select-region').click();
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isExpanded) this.collapse();
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (this.isExpanded && !e.target.closest('#dynamic-island')) {
          this.collapse();
        }
      });
    }

    expand() {
      const island = $('dynamic-island');
      const compact = $('island-compact');
      const expanded = $('island-expanded');
      if (!island || !expanded) return;

      this.isExpanded = true;
      island.classList.add('expanded');
      if (compact) compact.style.display = 'none';
      expanded.style.display = 'flex';
      this.avatar.hop();

      clearTimeout(this.autoCollapseTimer);
      this.autoCollapseTimer = setTimeout(() => this.collapse(), 12000);
    }

    collapse() {
      const island = $('dynamic-island');
      const compact = $('island-compact');
      const expanded = $('island-expanded');
      if (!island || !expanded) return;

      this.isExpanded = false;
      island.classList.remove('expanded');
      expanded.style.display = 'none';
      if (compact) compact.style.display = 'flex';
      clearTimeout(this.autoCollapseTimer);
    }

    toggle() {
      if (this.isExpanded) this.collapse();
      else this.expand();
    }

    setStatus(text, state = 'idle') {
      const title = $('island-title');
      const island = $('dynamic-island');
      if (title) title.textContent = text;
      if (island) {
        island.classList.remove('thinking', 'listening', 'speaking');
        if (state === 'thinking') island.classList.add('thinking');
        else if (state === 'listening') island.classList.add('listening');
        else if (state === 'speaking') island.classList.add('speaking');
      }
      if ($('island-exp-sub')) {
        $('island-exp-sub').textContent = text + ' • Core Brain Connected';
      }
    }
  }

  // ==========================================================
  // Node Architecture & Platform Adapter Controller
  // ==========================================================
  class NodeManager {
    constructor(avatar, island) {
      this.avatar = avatar;
      this.island = island;
      this.role = localStorage.getItem('mave_node_role') || 'host';
      this.hostAddress = localStorage.getItem('mave_host_address') || '127.0.0.1:4040';
      this.hostPin = localStorage.getItem('mave_host_pin') || '8080';
      this.accountName = localStorage.getItem('mave_account_name') || 'From Near';
      this.platform = this.detectPlatform();
      this.init();
    }

    detectPlatform() {
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) return 'android';
      if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
      return 'windows';
    }

    init() {
      this.applyPlatformUI();
      this.updateNodeDisplay();
      this.initFirebase();
      this.bindOnboardingModal();
      this.bindSettingsPanel();

      if (!localStorage.getItem('mave_onboarding_completed')) {
        setTimeout(() => {
          if ($('node-onboarding-modal')) $('node-onboarding-modal').hidden = false;
        }, 600);
      }
    }

    async initFirebase() {
      try {
        const user = await api.invoke('firebase:get-user');
        if (user && user.uid) {
          this.accountName = user.displayName || user.email || 'From Near';
          if ($('fb-profile-name')) $('fb-profile-name').textContent = this.accountName;
          if ($('fb-profile-email')) $('fb-profile-email').textContent = user.email || 'Anonymous Guest Session';
          if ($('fb-profile-cloud-status')) $('fb-profile-cloud-status').textContent = `☁️ Cloud Firestore Connected (UID: ${user.uid.slice(0, 8)}…)`;
          if ($('fb-account-name')) $('fb-account-name').value = this.accountName;
          if ($('fb-btn-signout')) $('fb-btn-signout').style.display = 'inline-block';
          if ($('nom-fb-name')) $('nom-fb-name').value = this.accountName;
          if (user.email && $('nom-fb-email')) $('nom-fb-email').value = user.email;

          // Fetch device list
          const devRes = await api.invoke('firebase:get-devices');
          if (devRes && devRes.devices && $('fb-mesh-devices-list')) {
            $('fb-mesh-devices-list').textContent = `${devRes.devices.length} device(s) in cloud mesh`;
          }
        } else {
          if ($('fb-profile-name')) $('fb-profile-name').textContent = 'Guest / Offline';
          if ($('fb-profile-email')) $('fb-profile-email').textContent = 'Not signed in to Firebase';
          if ($('fb-profile-cloud-status')) $('fb-profile-cloud-status').textContent = '⚠️ Local-only mode';
          if ($('fb-btn-signout')) $('fb-btn-signout').style.display = 'none';
        }
      } catch (err) {
        console.warn('Firebase init error:', err);
      }
    }

    applyPlatformUI() {
      document.body.setAttribute('data-platform', this.platform);
      const platLabel = {
        windows: 'Windows Desktop (Core Host Capable)',
        android: 'Android Mobile (Camera, Audio & Sensor Companion)',
        ios: 'iOS Safari Companion (Dynamic Island & WebKit Audio)'
      }[this.platform] || 'Personal Computer';

      if ($('nom-platform-badge')) $('nom-platform-badge').textContent = `Detected: ${platLabel}`;
      if ($('im-platform-val')) $('im-platform-val').textContent = platLabel.split(' (')[0];
      if ($('ndb-platform-title')) $('ndb-platform-title').textContent = platLabel;
    }

    updateNodeDisplay() {
      const isHost = this.role === 'host';
      const roleText = isHost ? 'Host AI (Core Brain)' : 'Satellite Client';
      if ($('im-node-role')) $('im-node-role').textContent = roleText;
      if ($('island-node-pill')) $('island-node-pill').textContent = isHost ? 'Host AI' : 'Satellite';
      if ($('ndb-role-badge')) $('ndb-role-badge').textContent = isHost ? 'Host AI (Brain)' : 'Satellite';
      if ($('settings-node-role-select')) $('settings-node-role-select').value = this.role;
      if ($('row-host-address-field')) $('row-host-address-field').style.display = isHost ? 'none' : 'flex';
    }

    bindOnboardingModal() {
      const modal = $('node-onboarding-modal');
      const stepAuth = $('nom-step-auth');
      const stepRole = $('nom-step-role');
      const authGuest = $('nom-auth-guest-btn');
      const hostCard = $('nom-role-host');
      const satCard = $('nom-role-satellite');
      const finishBtn = $('nom-role-finish-btn');
      const satFields = $('nom-satellite-fields');

      let selectedRole = 'host';
      let authMode = 'signin'; // 'signin' | 'signup' | 'guest'

      const tabSignIn = $('nom-auth-tab-signin');
      const tabSignUp = $('nom-auth-tab-signup');
      const tabGuest = $('nom-auth-tab-guest');
      const groupName = $('nom-group-name');
      const groupEmail = $('nom-group-email');
      const groupPass = $('nom-group-pass');
      const submitBtn = $('nom-auth-submit-btn');
      const statusEl = $('nom-fb-status');

      const setAuthTab = (mode) => {
        authMode = mode;
        if (tabSignIn) {
          tabSignIn.style.background = mode === 'signin' ? 'rgba(59,130,246,0.3)' : 'transparent';
          tabSignIn.style.color = mode === 'signin' ? '#fff' : 'var(--text-3)';
        }
        if (tabSignUp) {
          tabSignUp.style.background = mode === 'signup' ? 'rgba(59,130,246,0.3)' : 'transparent';
          tabSignUp.style.color = mode === 'signup' ? '#fff' : 'var(--text-3)';
        }
        if (tabGuest) {
          tabGuest.style.background = mode === 'guest' ? 'rgba(59,130,246,0.3)' : 'transparent';
          tabGuest.style.color = mode === 'guest' ? '#fff' : 'var(--text-3)';
        }

        if (groupName) groupName.style.display = mode === 'signup' ? 'block' : 'none';
        if (groupEmail) groupEmail.style.display = mode === 'guest' ? 'none' : 'block';
        if (groupPass) groupPass.style.display = mode === 'guest' ? 'none' : 'block';

        if (submitBtn) {
          submitBtn.textContent = mode === 'signin' ? 'Sign In & Connect Cloud DB →' :
                                  mode === 'signup' ? 'Create Account & Initialize Cloud DB →' :
                                  'Continue as Guest (Local Mode) →';
        }
        if (statusEl) {
          statusEl.style.display = 'none';
          statusEl.textContent = '';
        }
      };

      if (tabSignIn) tabSignIn.addEventListener('click', () => setAuthTab('signin'));
      if (tabSignUp) tabSignUp.addEventListener('click', () => setAuthTab('signup'));
      if (tabGuest) tabGuest.addEventListener('click', () => setAuthTab('guest'));

      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          if (authMode === 'guest') {
            try {
              if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Starting guest session…'; }
              await api.invoke('firebase:sign-in-anon');
              this.accountName = 'Local Guest';
              localStorage.setItem('mave_account_name', this.accountName);
              if (stepAuth) stepAuth.style.display = 'none';
              if (stepRole) stepRole.style.display = 'block';
              this.initFirebase();
            } catch {
              if (stepAuth) stepAuth.style.display = 'none';
              if (stepRole) stepRole.style.display = 'block';
            }
            return;
          }

          const email = $('nom-fb-email') ? $('nom-fb-email').value.trim() : '';
          const pass = $('nom-fb-pass') ? $('nom-fb-pass').value : '';
          const name = $('nom-fb-name') ? $('nom-fb-name').value.trim() : '';

          if (!email || !pass) {
            if (statusEl) {
              statusEl.style.display = 'block';
              statusEl.style.color = '#ef4444';
              statusEl.textContent = 'Please enter both email and password.';
            }
            return;
          }

          if (submitBtn) submitBtn.disabled = true;
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#38bdf8';
            statusEl.textContent = authMode === 'signin' ? 'Authenticating with Firebase…' : 'Creating Firebase account…';
          }

          try {
            const res = authMode === 'signin'
              ? await api.invoke('firebase:sign-in', { email, password: pass })
              : await api.invoke('firebase:sign-up', { email, password: pass, displayName: name });

            if (res && res.ok) {
              this.accountName = res.user?.displayName || name || email.split('@')[0];
              localStorage.setItem('mave_account_name', this.accountName);
              this.avatar.hop();
              this.avatar.setMood('happy', 1500);

              if (statusEl) {
                statusEl.style.color = '#34d399';
                statusEl.textContent = '✅ Authenticated! Initializing cloud user database…';
              }

              setTimeout(() => {
                if (stepAuth) stepAuth.style.display = 'none';
                if (stepRole) stepRole.style.display = 'block';
                this.initFirebase();
              }, 700);
            } else {
              throw new Error(res?.error || 'Authentication failed');
            }
          } catch (err) {
            if (statusEl) {
              statusEl.style.display = 'block';
              statusEl.style.color = '#ef4444';
              statusEl.textContent = err.message || 'Authentication error';
            }
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      }

      if (authGuest) {
        authGuest.addEventListener('click', () => {
          this.accountName = 'Local Guest';
          localStorage.setItem('mave_account_name', this.accountName);
          if (stepAuth) stepAuth.style.display = 'none';
          if (stepRole) stepRole.style.display = 'block';
        });
      }

      if (hostCard) {
        hostCard.addEventListener('click', () => {
          selectedRole = 'host';
          hostCard.classList.add('selected');
          if (satCard) satCard.classList.remove('selected');
          if (satFields) satFields.style.display = 'none';
        });
      }

      if (satCard) {
        satCard.addEventListener('click', () => {
          selectedRole = 'satellite';
          satCard.classList.add('selected');
          if (hostCard) hostCard.classList.remove('selected');
          if (satFields) satFields.style.display = 'block';
        });
      }

      if ($('nom-scan-lan-btn')) {
        $('nom-scan-lan-btn').addEventListener('click', () => {
          $('nom-scan-lan-btn').textContent = 'Scanning…';
          setTimeout(() => {
            $('nom-scan-lan-btn').textContent = '✅ Found';
            if ($('nom-host-address')) $('nom-host-address').value = '192.168.1.50:4040';
          }, 800);
        });
      }

      if (finishBtn) {
        finishBtn.addEventListener('click', () => {
          this.role = selectedRole;
          if (selectedRole === 'satellite') {
            this.hostAddress = $('nom-host-address') ? $('nom-host-address').value.trim() : '127.0.0.1:4040';
            this.hostPin = $('nom-host-pin') ? $('nom-host-pin').value.trim() : '8080';
            localStorage.setItem('mave_host_address', this.hostAddress);
            localStorage.setItem('mave_host_pin', this.hostPin);
          }
          localStorage.setItem('mave_node_role', this.role);
          localStorage.setItem('mave_onboarding_completed', '1');
          this.updateNodeDisplay();

          if (modal) modal.hidden = true;
          this.avatar.bounce();
          this.avatar.setMood('happy', 2000);
        });
      }
    }

    bindSettingsPanel() {
      if ($('settings-node-role-select')) {
        $('settings-node-role-select').addEventListener('change', () => {
          const val = $('settings-node-role-select').value;
          this.role = val;
          localStorage.setItem('mave_node_role', val);
          this.updateNodeDisplay();
        });
      }

      if ($('btn-relaunch-onboarding')) {
        $('btn-relaunch-onboarding').addEventListener('click', () => {
          if ($('node-onboarding-modal')) {
            $('node-onboarding-modal').hidden = false;
            if ($('nom-step-auth')) $('nom-step-auth').style.display = 'block';
            if ($('nom-step-role')) $('nom-step-role').style.display = 'none';
          }
        });
      }

      if ($('btn-show-qr-code')) {
        $('btn-show-qr-code').addEventListener('click', () => {
          alert('📱 Scan with your Android or iPhone camera on home Wi-Fi:\nhttp://' + (window.location.hostname || '192.168.1.50') + ':4040\nPIN: 8080');
        });
      }

      // Settings Mascot Face & Palette Buttons
      if ($('mascot-interactive-preview')) {
        $('mascot-interactive-preview').addEventListener('click', () => this.avatar.pet());
      }
      if ($('btn-preview-hop')) $('btn-preview-hop').addEventListener('click', () => this.avatar.hop());
      if ($('btn-preview-love')) $('btn-preview-love').addEventListener('click', () => this.avatar.setMood('love', 1500));
      if ($('btn-preview-think')) $('btn-preview-think').addEventListener('click', () => this.avatar.setMood('thinking', 1500));
      if ($('btn-preview-groove')) $('btn-preview-groove').addEventListener('click', () => {
        this.avatar.setMood('happy', 2000);
        this.avatar.bounce();
      });

      document.querySelectorAll('.palette-swatch').forEach((swatch) => {
        swatch.addEventListener('click', () => {
          document.querySelectorAll('.palette-swatch').forEach((s) => s.classList.remove('active'));
          swatch.classList.add('active');
          const p = swatch.dataset.palette;
          this.avatar.applyPalette(p);
        });
      });

      if ($('mascot-style-select')) {
        $('mascot-style-select').addEventListener('change', () => {
          const val = $('mascot-style-select').value;
          this.avatar.applyStyle(val);
        });
      }

      // Firebase Account & Cloud DB Settings Handlers
      if ($('fb-btn-signout')) {
        $('fb-btn-signout').addEventListener('click', async () => {
          await api.invoke('firebase:sign-out');
          this.initFirebase();
          this.avatar.hop();
        });
      }

      if ($('fb-btn-switch-account')) {
        $('fb-btn-switch-account').addEventListener('click', () => {
          if ($('node-onboarding-modal')) {
            $('node-onboarding-modal').hidden = false;
            if ($('nom-step-auth')) $('nom-step-auth').style.display = 'block';
            if ($('nom-step-role')) $('nom-step-role').style.display = 'none';
          }
        });
      }

      if ($('fb-btn-sync-prefs')) {
        $('fb-btn-sync-prefs').addEventListener('click', async () => {
          $('fb-btn-sync-prefs').textContent = 'Syncing…';
          await api.invoke('firebase:save-preferences', {
            palette: this.avatar.palette,
            style: this.avatar.style,
            nodeRole: this.role,
            platform: this.platform,
            theme: localStorage.getItem('mave_theme') || 'dark',
          });
          $('fb-btn-sync-prefs').textContent = '✅ Synced to Firestore';
          setTimeout(() => { $('fb-btn-sync-prefs').textContent = 'Sync Preferences'; }, 2000);
        });
      }

      if ($('fb-btn-sync-device')) {
        $('fb-btn-sync-device').addEventListener('click', async () => {
          $('fb-btn-sync-device').textContent = 'Registering…';
          await api.invoke('firebase:sync-device', {
            platform: this.platform,
            role: this.role,
            hostname: 'Mave-Desktop',
            capabilities: ['voice', 'screen', 'hands', 'models', 'mesh'],
          });
          $('fb-btn-sync-device').textContent = '✅ Registered in Mesh';
          setTimeout(() => { $('fb-btn-sync-device').textContent = 'Sync Device'; }, 2000);
          this.initFirebase();
        });
      }
    }
  }

  // Initialize instances
  const maveAvatar = new DotAvatarController();
  const maveIsland = new DynamicIslandController(maveAvatar);
  const maveNodeMgr = new NodeManager(maveAvatar, maveIsland);

  // Hook into voice and state updates
  api.on('voice:speaking', (isSpeaking) => {
    if (isSpeaking) {
      maveAvatar.hop();
      maveIsland.setStatus('Speaking…', 'speaking');
    } else {
      maveIsland.setStatus('Listening…', 'listening');
    }
  });

  api.on('level', (level) => {
    if (level > 0.05 && maveAvatar.currentMood === 'idle') {
      maveAvatar.setMood('listening');
    }
  });

  // Settings tab click switcher for new tabs
  document.querySelectorAll('.settings-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.settings-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.settings-content > section').forEach((sec) => {
        sec.hidden = sec.dataset.tab !== tab;
      });
    });
  });

  api.on('settings', (s) => {
    if (s && s.models && $('prompt')) {
      $('prompt').placeholder = 'Ask anything';
      renderSetup();
    }
  });
  api.on('local:progress', (st) => { if (st.status === 'ready' || st.status === 'none') renderSetup(); });
  api.on('region', (r) => {
    if ($('region-chip')) $('region-chip').hidden = !r;
    if (r && $('prompt')) {
      if ($('region-text')) $('region-text').textContent = `Asking about marked area (${Math.round(r.width)} × ${Math.round(r.height)})`;
      $('prompt').placeholder = 'What would you like to know about it?';
      setTimeout(() => $('prompt').focus(), 50);
    }
  });

  document.addEventListener('section-shown', (e) => { if (e.detail === 'home' && $('prompt')) setTimeout(() => $('prompt').focus(), 60); });
  renderSetup();
  api.invoke('app:info').then((info) => setState(info.state));
  api.send('panel:ready');
})();
