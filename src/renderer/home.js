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
  let lastSubmittedPrompt = '';
  let temporaryMode = false;

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
      const isExecutable = /^(?:python|py|javascript|js|node)$/i.test(lang);

      const blockHtml = `
      <div class="code-block-wrap" data-lang="${escapeHtml(lang)}" data-code="${rawAttr}">
        <div class="code-block-head">
          <span class="code-lang-label">${escapeHtml(lang)}</span>
          <div class="code-block-actions" style="display:flex; align-items:center; gap:8px;">
            ${isExecutable ? `
              <button type="button" class="run-code-btn" data-lang="${escapeHtml(lang)}" data-code="${rawAttr}" title="Execute in Sandbox (ChatGPT Code Interpreter)">
                ▶ Run Code
              </button>
            ` : ''}
            <button type="button" class="open-in-canvas-btn" data-lang="${escapeHtml(lang)}" data-code="${rawAttr}" title="Open in ChatGPT Canvas">
              ◫ Canvas
            </button>
            <button type="button" class="copy-code-btn" data-code="${rawAttr}" title="Copy code">
              <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span class="copy-text">Copy</span>
            </button>
          </div>
        </div>
        <pre class="code-pre"><code class="code-content">${escapedCode}</code></pre>
        <div class="code-exec-output" hidden></div>
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

    // 3. Regenerate button (ChatGPT style)
    const regenBtn = el('button', 'msg-action-btn regen-msg-btn');
    regenBtn.title = 'Regenerate response';
    regenBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    regenBtn.addEventListener('click', () => {
      let prevUserTurn = row.previousElementSibling;
      while (prevUserTurn && !prevUserTurn.classList.contains('user')) {
        prevUserTurn = prevUserTurn.previousElementSibling;
      }
      const promptToReplay = (prevUserTurn && prevUserTurn.querySelector('.msg.user')?.textContent?.trim()) || lastSubmittedPrompt;
      if (promptToReplay) {
        api.invoke('task:run', promptToReplay, {
          threadId: temporaryMode ? null : activeThreadId,
          temporary: temporaryMode,
        });
      }
    });

    // 4. Open in Canvas button (ChatGPT style)
    const canvasBtn = el('button', 'msg-action-btn canvas-msg-btn');
    canvasBtn.title = 'Open in Canvas';
    canvasBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18"/></svg>`;
    canvasBtn.addEventListener('click', () => {
      const codeMatch = text.match(/```([a-zA-Z0-9_+#.-]*)\r?\n([\s\S]*?)```/);
      if (codeMatch && window.__openChatGPTCanvas) {
        const lang = (codeMatch[1] || 'python').toLowerCase();
        const ext = lang === 'javascript' || lang === 'js' ? 'js' : lang === 'python' || lang === 'py' ? 'py' : 'txt';
        window.__openChatGPTCanvas({
          title: `analysis.${ext}`,
          language: lang,
          content: codeMatch[2],
        });
      } else if (window.__openChatGPTCanvas) {
        window.__openChatGPTCanvas({
          title: 'document.md',
          language: 'markdown',
          content: text,
        });
      }
    });

    // 5. Good response
    const thumbUp = el('button', 'msg-action-btn thumb-up-btn');
    thumbUp.title = 'Good response';
    thumbUp.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
    thumbUp.addEventListener('click', () => {
      thumbUp.classList.toggle('active');
      thumbDown.classList.remove('active');
    });

    // 6. Bad response
    const thumbDown = el('button', 'msg-action-btn thumb-down-btn');
    thumbDown.title = 'Bad response';
    thumbDown.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`;
    thumbDown.addEventListener('click', () => {
      thumbDown.classList.toggle('active');
      thumbUp.classList.remove('active');
    });

    actions.append(copyBtn, speakBtn, regenBtn, canvasBtn, thumbUp, thumbDown);
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
    live.body.innerHTML = renderMarkdown(text) + '<span class="streaming-cursor"></span>';
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

    lastSubmittedPrompt = text;
    const attachmentsToSend = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentsPreview();

    $('prompt').value = '';
    autosize();

    await api.invoke('task:run', text, {
      attachments: attachmentsToSend,
      threadId: temporaryMode ? null : activeThreadId,
      temporary: temporaryMode,
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
          if (textSpan) textSpan.textContent = 'Copy';
          copyCodeBtn.classList.remove('copied');
        }, 2000);
      }

      // ChatGPT Code Interpreter: Live Execution
      const runCodeBtn = e.target.closest('.run-code-btn');
      if (runCodeBtn) {
        const wrap = runCodeBtn.closest('.code-block-wrap');
        const code = runCodeBtn.dataset.code || (wrap ? wrap.dataset.code : '');
        const lang = (runCodeBtn.dataset.lang || (wrap ? wrap.dataset.lang : 'python')).toLowerCase();
        const outputBox = wrap ? wrap.querySelector('.code-exec-output') : null;

        if (outputBox) {
          outputBox.hidden = false;
          outputBox.innerHTML = '<div style="padding:8px 12px; color:var(--text-3); font-size:12px; font-family:monospace;">⏳ Executing in Mave sandbox...</div>';
          runCodeBtn.disabled = true;
          runCodeBtn.textContent = 'Running…';

          api.invoke('code-interpreter:run', { language: lang, code, timeoutMs: 20000 }).then((res) => {
            runCodeBtn.disabled = false;
            runCodeBtn.textContent = '▶ Run Code';
            let out = '';
            if (res.stdout) out += escapeHtml(res.stdout);
            if (res.stderr) out += (out ? '\n[STDERR]:\n' : '') + `<span style="color:#f87171;">${escapeHtml(res.stderr)}</span>`;
            if (!out && res.ok) out = `<span style="color:#34d399;">Process finished with exit code ${res.exitCode} (${res.durationMs}ms)</span>`;

            let html = `<div style="padding:10px 14px; background:#090d16; border-top:1px solid rgba(255,255,255,0.08); font-family:monospace; font-size:12px; white-space:pre-wrap; color:#e2e8f0;">${out || '(No output)'}</div>`;

            if (res.plots && res.plots.length > 0) {
              res.plots.forEach((p) => {
                html += `<div style="padding:10px; background:#090d16;"><img src="${p.dataUrl}" alt="Generated Plot" style="max-width:100%; border-radius:8px; border:1px solid rgba(255,255,255,0.1);"></div>`;
              });
            }
            outputBox.innerHTML = html;
          }).catch((err) => {
            runCodeBtn.disabled = false;
            runCodeBtn.textContent = '▶ Run Code';
            outputBox.innerHTML = `<div style="padding:10px 14px; background:#090d16; color:#f87171; font-family:monospace; font-size:12px;">Execution error: ${escapeHtml(err.message)}</div>`;
          });
        }
      }

      // ChatGPT Canvas: Open in Canvas split-screen
      const openCanvasBtn = e.target.closest('.open-in-canvas-btn');
      if (openCanvasBtn) {
        const wrap = openCanvasBtn.closest('.code-block-wrap');
        const code = openCanvasBtn.dataset.code || (wrap ? wrap.dataset.code : '');
        const lang = openCanvasBtn.dataset.lang || (wrap ? wrap.dataset.lang : 'python');
        if (window.__openChatGPTCanvas) {
          window.__openChatGPTCanvas({
            title: `script.${lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang}`,
            language: lang,
            content: code,
          });
        }
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

  let cachedArchived = [];
  async function renderArchivedList() {
    const listEl = $('archived-chats-list');
    if (!listEl) return;
    cachedArchived = (await api.invoke('threads:archived')) || [];
    filterAndDrawArchived();
  }

  function filterAndDrawArchived() {
    const listEl = $('archived-chats-list');
    if (!listEl) return;
    const filter = ($('archived-search-input')?.value || '').toLowerCase().trim();
    const items = filter ? cachedArchived.filter((t) => (t.title || '').toLowerCase().includes(filter)) : cachedArchived;
    listEl.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px;">${filter ? 'No matching archived conversations' : 'No archived conversations'}</div>`;
      return;
    }
    items.forEach((t) => {
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

  if ($('archived-search-input')) {
    $('archived-search-input').addEventListener('input', () => filterAndDrawArchived());
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
      if (btn.id === 'empty-chip-canvas') {
        if (window.__openChatGPTCanvas) {
          window.__openChatGPTCanvas({
            title: 'model.py',
            language: 'python',
            content: '# Python Data & Architecture Model\nimport math\n\ndef analyze():\n    return {"status": "ok", "pi": math.pi}\n\nif __name__ == "__main__":\n    print(analyze())\n',
          });
        }
        return;
      }
      if (btn.id === 'empty-chip-jarvis') {
        const hudBtn = $('jarvis-hud-trigger-btn');
        if (hudBtn) hudBtn.click();
        return;
      }
      const p = btn.dataset.prompt;
      if (p && $('prompt')) {
        $('prompt').value = p;
        autosize();
        $('prompt').focus();
        submit();
      }
    });
  });

  // Composer Attach Dropdown: Python Sandbox & Canvas
  if ($('cad-python-sandbox')) {
    $('cad-python-sandbox').addEventListener('click', () => {
      if ($('composer-actions-dropdown')) $('composer-actions-dropdown').hidden = true;
      if (window.__openChatGPTCanvas) {
        window.__openChatGPTCanvas({
          title: 'sandbox.py',
          language: 'python',
          content: '# On-Device Python 3.14 Sandbox (Code Interpreter)\nimport os, sys\n\nprint("Sandbox environment initialized.")\nprint("Python version:", sys.version)\n',
        });
      }
    });
  }
  if ($('cad-open-canvas')) {
    $('cad-open-canvas').addEventListener('click', () => {
      if ($('composer-actions-dropdown')) $('composer-actions-dropdown').hidden = true;
      if (window.__openChatGPTCanvas) {
        window.__openChatGPTCanvas({
          title: 'document.md',
          language: 'markdown',
          content: '# New Workspace Document\n\nStart typing your document or architecture draft here.\n',
        });
      }
    });
  }

  // Temporary Chat Pill & Banner wiring
  const tempPillBtn = $('temporary-chat-pill-btn');
  const tempBannerEl = $('temporary-chat-banner');
  const clearTempBtn = $('btn-clear-temp');

  if (tempPillBtn) {
    tempPillBtn.addEventListener('click', () => {
      temporaryMode = !temporaryMode;
      tempPillBtn.classList.toggle('active', temporaryMode);
      if (tempBannerEl) tempBannerEl.hidden = !temporaryMode;
    });
  }
  if (clearTempBtn) {
    clearTempBtn.addEventListener('click', () => {
      temporaryMode = false;
      if (tempPillBtn) tempPillBtn.classList.remove('active');
      if (tempBannerEl) tempBannerEl.hidden = true;
    });
  }

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
      if (gov) {
        let name = 'From Near';
        if (gov.activeUser && typeof gov.activeUser === 'object') {
          name = gov.activeUser.name || gov.activeUser.displayName || 'From Near';
        } else if (typeof gov.activeUser === 'string') {
          const u = gov.users && gov.users[gov.activeUser];
          name = (u && (u.name || u.displayName)) || gov.activeUser;
        }
        if (typeof name !== 'string' || !name.trim()) name = 'From Near';
        if ($('user-profile-name')) $('user-profile-name').textContent = name;
        if ($('upm-user-name')) $('upm-user-name').textContent = name;
        const initials = name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'FN';
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
  if ($('island-toggle-btn')) {
    $('island-toggle-btn').addEventListener('click', () => {
      api.invoke('island:toggle').catch(() => {});
    });
  }

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
  if ($('upm-vorssaint')) {
    $('upm-vorssaint').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings', 'vorssaint');
    });
  }
  if ($('nav-item-vorssaint')) {
    $('nav-item-vorssaint').addEventListener('click', () => {
      const nmd = $('nav-more-dropdown');
      if (nmd) nmd.hidden = true;
      api.invoke('app:open-settings', 'vorssaint');
    });
  }
  if ($('nav-item-island')) {
    $('nav-item-island').addEventListener('click', () => {
      const nmd = $('nav-more-dropdown');
      if (nmd) nmd.hidden = true;
      api.invoke('island:toggle');
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
      api.invoke('app:open-settings', 'billing');
    });
  }
  if ($('upm-help')) {
    $('upm-help').addEventListener('click', () => {
      if ($('user-profile-menu')) $('user-profile-menu').hidden = true;
      api.invoke('app:open-settings', 'assistant');
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

  // ==========================================
  // Real Interactive Modals: Images, Library, Scheduled, Plugins
  // ==========================================

  // 1. Real Images Studio Modal
  let currentGeneratedImage = null;
  function openImagesModal() {
    if ($('modal-images')) $('modal-images').hidden = false;
  }
  function closeImagesModal() {
    if ($('modal-images')) $('modal-images').hidden = true;
  }
  if ($('nav-item-images')) $('nav-item-images').addEventListener('click', openImagesModal);
  if ($('btn-close-images-modal')) $('btn-close-images-modal').addEventListener('click', closeImagesModal);
  if ($('btn-close-images')) $('btn-close-images').addEventListener('click', closeImagesModal);
  if ($('modal-images')) {
    $('modal-images').addEventListener('click', (e) => {
      if (e.target === $('modal-images')) closeImagesModal();
    });
  }

  if ($('btn-images-reveal-dir')) {
    $('btn-images-reveal-dir').addEventListener('click', () => {
      api.invoke('media:reveal-folder');
    });
  }

  if ($('btn-generate-image')) {
    $('btn-generate-image').addEventListener('click', async () => {
      const promptInput = $('images-prompt-input');
      const styleSelect = $('images-style-select');
      const dimSelect = $('images-dim-select');
      const statusEl = $('images-status-text');
      const genBtn = $('btn-generate-image');

      const prompt = promptInput ? promptInput.value.trim() : '';
      if (!prompt) {
        if (statusEl) statusEl.textContent = '⚠️ Please enter an image prompt first.';
        if (promptInput) promptInput.focus();
        return;
      }

      genBtn.disabled = true;
      if (statusEl) statusEl.textContent = '✨ Synthesizing high-fidelity artwork...';

      try {
        const res = await api.invoke('media:generate-image', {
          prompt,
          style: styleSelect ? styleSelect.value : 'photorealistic',
          size: dimSelect ? dimSelect.value : '1024x1024',
        });

        if (res && res.ok) {
          currentGeneratedImage = res;
          if ($('images-empty-placeholder')) $('images-empty-placeholder').style.display = 'none';
          if ($('images-result-card')) $('images-result-card').style.display = 'block';
          if ($('images-result-img')) {
            $('images-result-img').src = res.url;
            $('images-result-img').alt = res.prompt;
          }
          if (statusEl) statusEl.textContent = `✓ Generated & saved to Pictures: ${res.filename}`;
        } else {
          if (statusEl) statusEl.textContent = `Generation error: ${(res && res.message) || 'Failed'}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
      } finally {
        genBtn.disabled = false;
      }
    });
  }

  if ($('btn-use-in-prompt')) {
    $('btn-use-in-prompt').addEventListener('click', () => {
      if (currentGeneratedImage && $('prompt')) {
        $('prompt').value = `Generated image [${currentGeneratedImage.filename}]: ${currentGeneratedImage.prompt}`;
        autosize();
        $('prompt').focus();
      }
      closeImagesModal();
    });
  }

  if ($('btn-copy-image')) {
    $('btn-copy-image').addEventListener('click', () => {
      if (currentGeneratedImage) {
        navigator.clipboard.writeText(currentGeneratedImage.filePath || currentGeneratedImage.prompt);
        const statusEl = $('images-status-text');
        if (statusEl) statusEl.textContent = '✓ Copied file path to clipboard!';
      }
    });
  }

  // 2. Real Knowledge Library Modal
  function openLibraryModal() {
    if ($('modal-library')) $('modal-library').hidden = false;
    loadLibraryMemories();
  }
  function closeLibraryModal() {
    if ($('modal-library')) $('modal-library').hidden = true;
  }
  if ($('nav-item-library')) $('nav-item-library').addEventListener('click', openLibraryModal);
  if ($('btn-close-library-modal')) $('btn-close-library-modal').addEventListener('click', closeLibraryModal);
  if ($('btn-close-library')) $('btn-close-library').addEventListener('click', closeLibraryModal);
  if ($('modal-library')) {
    $('modal-library').addEventListener('click', (e) => {
      if (e.target === $('modal-library')) closeLibraryModal();
    });
  }

  async function loadLibraryMemories(query = '') {
    const listEl = $('library-items-list');
    const countEl = $('library-count-text');
    if (!listEl) return;

    listEl.innerHTML = '<div style="color:var(--text-3); font-size:12px; padding:10px;">Loading memories...</div>';
    try {
      let res;
      if (query && query.trim()) {
        res = await api.invoke('knowledge:search', query.trim());
      } else {
        res = await api.invoke('knowledge:list', { limit: 100 });
      }

      const items = res.list || [];
      if (countEl) countEl.textContent = `${items.length} Knowledge entries indexed in memory vault`;

      if (items.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-3); font-size:12px; padding:12px; text-align:center;">No memory records found. Add your first knowledge fact above!</div>';
        return;
      }

      listEl.innerHTML = '';
      for (const m of items) {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:8px; padding:8px 12px; margin-bottom:6px;';
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'flex:1; padding-right:12px;';
        
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:2px;';
        
        const tag = document.createElement('span');
        tag.className = 'rc-tag';
        tag.style.cssText = 'background:rgba(59,130,246,0.18); color:#60a5fa; font-size:10px; padding:2px 6px; border-radius:4px; text-transform:uppercase; font-weight:600;';
        tag.textContent = m.topic || 'general';
        
        const dateSpan = document.createElement('span');
        dateSpan.style.cssText = 'font-size:11px; color:var(--text-3);';
        dateSpan.textContent = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
        
        topRow.appendChild(tag);
        topRow.appendChild(dateSpan);
        
        const factText = document.createElement('div');
        factText.style.cssText = 'font-size:13px; color:var(--text-1); line-height:1.4;';
        factText.textContent = m.fact || m.text || '';
        
        contentDiv.appendChild(topRow);
        contentDiv.appendChild(factText);
        
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn small plain';
        delBtn.style.cssText = 'color:#ef4444; padding:4px 8px; font-size:11px;';
        delBtn.textContent = 'Forget';
        delBtn.addEventListener('click', async () => {
          await api.invoke('knowledge:delete', m.id || m.fact);
          loadLibraryMemories($('library-search-input') ? $('library-search-input').value : '');
        });

        item.appendChild(contentDiv);
        item.appendChild(delBtn);
        listEl.appendChild(item);
      }
    } catch (err) {
      listEl.innerHTML = `<div style="color:#ef4444; font-size:12px; padding:10px;">Error loading memory vault: ${err.message}</div>`;
    }
  }

  if ($('btn-save-knowledge')) {
    $('btn-save-knowledge').addEventListener('click', async () => {
      const factInput = $('library-new-fact');
      const topicSelect = $('library-new-topic');
      const fact = factInput ? factInput.value.trim() : '';
      if (!fact) return;

      const topic = topicSelect ? topicSelect.value : 'general';
      await api.invoke('knowledge:add', fact, { topic });
      if (factInput) factInput.value = '';
      loadLibraryMemories();
    });
  }

  if ($('library-search-input')) {
    let searchDebounce = null;
    $('library-search-input').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        loadLibraryMemories(e.target.value);
      }, 250);
    });
  }

  if ($('btn-reindex-knowledge')) {
    $('btn-reindex-knowledge').addEventListener('click', async () => {
      const countEl = $('library-count-text');
      if (countEl) countEl.textContent = '⚡ Reindexing memory index...';
      const res = await api.invoke('knowledge:reindex');
      if (res && res.stats) {
        if (countEl) countEl.textContent = `✓ Index synced: ${res.stats.totalMemories} memories, ${res.stats.indexedKeywords} keywords.`;
      }
      loadLibraryMemories();
    });
  }

  // 3. Real Scheduled Routines Modal
  function openScheduledModal() {
    if ($('modal-scheduled')) $('modal-scheduled').hidden = false;
  }
  function closeScheduledModal() {
    if ($('modal-scheduled')) $('modal-scheduled').hidden = true;
  }
  if ($('nav-item-scheduled')) $('nav-item-scheduled').addEventListener('click', openScheduledModal);
  if ($('btn-close-scheduled-modal')) $('btn-close-scheduled-modal').addEventListener('click', closeScheduledModal);
  if ($('btn-close-scheduled')) $('btn-close-scheduled').addEventListener('click', closeScheduledModal);
  if ($('modal-scheduled')) {
    $('modal-scheduled').addEventListener('click', (e) => {
      if (e.target === $('modal-scheduled')) closeScheduledModal();
    });
  }

  if ($('btn-run-briefing-now')) {
    $('btn-run-briefing-now').addEventListener('click', async () => {
      const resEl = $('briefing-live-result');
      const btn = $('btn-run-briefing-now');
      btn.disabled = true;
      if (resEl) {
        resEl.style.display = 'block';
        resEl.textContent = '🎙️ Generating executive briefing from circadian context...';
      }

      try {
        const res = await api.invoke('routines:briefing');
        if (res && res.ok && res.summary) {
          const s = res.summary;
          if (resEl) {
            resEl.textContent = `📢 "${s.spokenBriefing}" (Soundtrack: ${s.musicRecommendation})`;
          }
          // Speak aloud if Kokoro/speech is active
          api.invoke('speech:speak', s.spokenBriefing).catch(() => {});
        } else {
          if (resEl) resEl.textContent = `Briefing status: ${(res && res.message) || 'Completed'}`;
        }
      } catch (err) {
        if (resEl) resEl.textContent = `Error: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  if ($('btn-run-tidy-now')) {
    $('btn-run-tidy-now').addEventListener('click', async () => {
      const resEl = $('tidy-live-result');
      const btn = $('btn-run-tidy-now');
      btn.disabled = true;
      if (resEl) {
        resEl.style.display = 'block';
        resEl.textContent = '🧹 Scanning and categorizing Downloads folder...';
      }

      try {
        const res = await api.invoke('routines:tidy', { execute: true });
        if (res && res.ok) {
          if (resEl) resEl.textContent = `✓ Organized ${res.totalClassified} files into categorised folders in ${res.directory}.`;
        } else {
          if (resEl) resEl.textContent = `Tidy status: ${(res && res.message) || 'No loose files needed tidying.'}`;
        }
      } catch (err) {
        if (resEl) resEl.textContent = `Error: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // 4. Real Plugins Button
  if ($('nav-item-plugins')) {
    $('nav-item-plugins').addEventListener('click', () => {
      api.invoke('app:open-settings', 'superpowers');
    });
  }

  // 5. Real Projects Button
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
      api.invoke('app:open-settings', 'security');
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

  // OS Device Extension Global Shortcut & Sentinel Notifications
  api.on('voice:toggle-talk', () => {
    toggleVoiceMode();
  });

  function showChatToast(message) {
    let toast = document.getElementById('chatgpt-toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'chatgpt-toast-notice';
      toast.style.cssText = 'position:fixed; top:48px; left:50%; transform:translateX(-50%) translateY(0); background:rgba(26,29,36,0.95); border:1px solid rgba(255,255,255,0.12); color:#fff; font-size:12px; font-weight:600; padding:7px 16px; border-radius:20px; z-index:99999; box-shadow:0 8px 24px rgba(0,0,0,0.5); backdrop-filter:blur(12px); pointer-events:none; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); opacity:0;';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0px)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 4000);
  }

  api.on('sentinel:network-change', (data) => {
    if (!data) return;
    if (data.online) {
      showChatToast('🌐 Internet connected: Mave is online and synchronizing tasks.');
    } else {
      showChatToast('📶 Sovereign Offline Mode: Running 100% locally on-device.');
    }
  });

  api.on('sentinel:incoming-activity', (data) => {
    if (!data) return;
    showChatToast(`💬 New from ${data.source || 'Activity'}: ${data.preview || 'New message'}`);
  });

  // Ghost AI Core: Interactive A2UI Generative Component Rendering & Action Handling
  api.on('ghost:a2ui', (payload) => {
    if (!payload || !payload.html) return;
    const card = el('div', 'a2ui-turn-card');
    card.innerHTML = payload.html;
    add(card);
    scrollDown();
  });

  if ($('log')) {
    $('log').addEventListener('click', async (e) => {
      const btn = e.target.closest('.a2ui-btn');
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.action;
      const tool = btn.dataset.tool;
      const initialText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Processing...';

      try {
        if (tool) {
          const args = btn.dataset.args ? JSON.parse(btn.dataset.args) : {};
          const res = await api.invoke('ghost:mcp-call', { name: tool, args });
          btn.textContent = '✅ Completed';
          if (res && res.result) {
            addEntry({ kind: 'progress', text: `Tool ${tool} output: ${JSON.stringify(res.result).slice(0, 100)}` });
          }
        } else if (action === 'omnibox') {
          if (window.__openGhostOmnibox) window.__openGhostOmnibox();
          btn.textContent = initialText;
          btn.disabled = false;
        } else if (action === 'terminal') {
          const termBtn = document.querySelector('button[data-section="terminal"]');
          if (termBtn) termBtn.click();
          btn.textContent = initialText;
          btn.disabled = false;
        } else if (action === 'settings') {
          const section = btn.dataset.section || 'general';
          if (window.__showSettingsSection) window.__showSettingsSection(section);
          btn.textContent = initialText;
          btn.disabled = false;
        } else if (action === 'run_task') {
          const task = btn.dataset.task || 'run system check';
          api.invoke('task:run', task);
          btn.textContent = '✅ Dispatched';
        }
      } catch (err) {
        btn.textContent = `❌ ${err.message || 'Error'}`;
      }
    });
  }

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
      window.__maveNodeController = this;
      this.applyPlatformUI();
      this.updateNodeDisplay();
      this.initFirebase();
      this.initWorkspace();
      this.bindOnboardingModal();
      this.bindSettingsPanel();
      this.bindWorkspacePanel();

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

        if ($('nom-btn-google')) {
        $('nom-btn-google').addEventListener('click', async () => {
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#38bdf8';
            statusEl.textContent = 'Connecting with Google Account…';
          }
          try {
            const res = await api.invoke('firebase:sign-in-provider', {
              provider: 'google.com',
              displayName: 'Google User',
              email: 'fromneargoogle@gmail.com',
            });
            if (res && res.ok) {
              this.accountName = res.user?.displayName || 'Google User';
              localStorage.setItem('mave_account_name', this.accountName);
              this.avatar.hop();
              this.avatar.setMood('happy', 1500);
              if (statusEl) {
                statusEl.style.color = '#34d399';
                statusEl.textContent = '✅ Connected with Google!';
              }
              setTimeout(() => {
                if (stepAuth) stepAuth.style.display = 'none';
                if (stepRole) stepRole.style.display = 'block';
                this.initFirebase();
              }, 600);
            }
          } catch (err) {
            if (statusEl) {
              statusEl.style.color = '#ef4444';
              statusEl.textContent = err.message || 'Google Sign-In failed';
            }
          }
        });
      }

      if ($('nom-btn-apple')) {
        $('nom-btn-apple').addEventListener('click', async () => {
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#38bdf8';
            statusEl.textContent = 'Authenticating with Apple ID…';
          }
          try {
            const res = await api.invoke('firebase:sign-in-provider', {
              provider: 'apple.com',
              displayName: 'Apple User',
              email: 'fromnearapple@icloud.com',
            });
            if (res && res.ok) {
              this.accountName = res.user?.displayName || 'Apple User';
              localStorage.setItem('mave_account_name', this.accountName);
              this.avatar.hop();
              this.avatar.setMood('happy', 1500);
              if (statusEl) {
                statusEl.style.color = '#34d399';
                statusEl.textContent = '✅ Connected with Apple ID!';
              }
              setTimeout(() => {
                if (stepAuth) stepAuth.style.display = 'none';
                if (stepRole) stepRole.style.display = 'block';
                this.initFirebase();
              }, 600);
            }
          } catch (err) {
            if (statusEl) {
              statusEl.style.color = '#ef4444';
              statusEl.textContent = err.message || 'Apple Sign-In failed';
            }
          }
        });
      }

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

      if ($('nom-btn-google')) {
        $('nom-btn-google').addEventListener('click', async () => {
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#38bdf8';
            statusEl.textContent = 'Connecting with Google Account…';
          }
          try {
            const res = await api.invoke('firebase:sign-in-provider', {
              provider: 'google.com',
              displayName: 'Google User',
              email: 'fromneargoogle@gmail.com',
            });
            if (res && res.ok) {
              this.accountName = res.user?.displayName || 'Google User';
              localStorage.setItem('mave_account_name', this.accountName);
              this.avatar.hop();
              this.avatar.setMood('happy', 1500);
              if (statusEl) {
                statusEl.style.color = '#34d399';
                statusEl.textContent = '✅ Connected with Google!';
              }
              setTimeout(() => {
                if (stepAuth) stepAuth.style.display = 'none';
                if (stepRole) stepRole.style.display = 'block';
                this.initFirebase();
              }, 600);
            }
          } catch (err) {
            if (statusEl) {
              statusEl.style.color = '#ef4444';
              statusEl.textContent = err.message || 'Google Sign-In failed';
            }
          }
        });
      }

      if ($('nom-btn-apple')) {
        $('nom-btn-apple').addEventListener('click', async () => {
          if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#38bdf8';
            statusEl.textContent = 'Authenticating with Apple ID…';
          }
          try {
            const res = await api.invoke('firebase:sign-in-provider', {
              provider: 'apple.com',
              displayName: 'Apple User',
              email: 'fromnearapple@icloud.com',
            });
            if (res && res.ok) {
              this.accountName = res.user?.displayName || 'Apple User';
              localStorage.setItem('mave_account_name', this.accountName);
              this.avatar.hop();
              this.avatar.setMood('happy', 1500);
              if (statusEl) {
                statusEl.style.color = '#34d399';
                statusEl.textContent = '✅ Connected with Apple ID!';
              }
              setTimeout(() => {
                if (stepAuth) stepAuth.style.display = 'none';
                if (stepRole) stepRole.style.display = 'block';
                this.initFirebase();
              }, 600);
            }
          } catch (err) {
            if (statusEl) {
              statusEl.style.color = '#ef4444';
              statusEl.textContent = err.message || 'Apple Sign-In failed';
            }
          }
        });
      }

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

    async initWorkspace() {
      try {
        const host = await api.invoke('host:info');
        if (host && $('ws-host-title')) {
          $('ws-host-title').textContent = `Local AI Brain Server: ${host.serverEnabled ? 'Online (24/7)' : 'Idle'}`;
          $('ws-host-sub').textContent = `Host: ${host.hostname || 'PC'} • ${host.totalUsers || 1} Member(s) Registered`;
          $('ws-member-count').textContent = `${host.totalUsers || 1} member(s)`;
        }

        const users = await api.invoke('users:list');
        const tbody = $('ws-members-tbody');
        if (tbody && Array.isArray(users)) {
          if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:14px 16px; color:var(--text-3);">No members added yet.</td></tr>';
          } else {
            tbody.innerHTML = users.map((u) => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:12px 16px;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#3b82f6,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff;">
                      ${(u.displayName || u.email || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style="font-weight:600; color:var(--text-1);">${escapeHtml(u.displayName || 'Member')}</div>
                      <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${escapeHtml(u.email || '')}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:12px 16px;">
                  <span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; text-transform:capitalize; background:${u.role === 'owner' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.15)'}; color:${u.role === 'owner' ? '#eab308' : '#60a5fa'};">
                    ${u.role === 'owner' ? '👑 Owner' : u.role}
                  </span>
                </td>
                <td style="padding:12px 16px; color:var(--text-2); font-size:12px;">${u.deviceCount || 0} device(s)</td>
                <td style="padding:12px 16px; color:var(--text-2); font-size:12px;">${u.quotaPerDay === -1 ? 'Unlimited' : `${u.quotaPerDay} req/day`}</td>
                <td style="padding:12px 16px; text-align:right;">
                  ${u.isLocalRoot ? '<span style="color:var(--text-3); font-size:11px;">Primary Host</span>' : `
                    <button type="button" class="btn secondary small ws-btn-rm-user" data-uid="${u.id}" style="padding:4px 8px; font-size:11px; color:#ef4444;">Remove</button>
                  `}
                </td>
              </tr>
            `).join('');

            tbody.querySelectorAll('.ws-btn-rm-user').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                if (confirm('Are you sure you want to remove this user from your local server?')) {
                  await api.invoke('users:remove', uid);
                  this.initWorkspace();
                }
              });
            });
          }
        }

        const keys = await api.invoke('users:apikeys', 'user-owner-root');
        const ktbody = $('ws-keys-tbody');
        if (ktbody && Array.isArray(keys)) {
          if (keys.length === 0) {
            ktbody.innerHTML = '<tr><td colspan="5" style="padding:14px 16px; color:var(--text-3);">No active secret keys. Click "+ Create Secret Key" to generate one.</td></tr>';
          } else {
            ktbody.innerHTML = keys.map((k) => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:12px 16px; font-weight:600; color:var(--text-1);">${escapeHtml(k.label || 'Default')}</td>
                <td style="padding:12px 16px; font-family:monospace; font-size:12px; color:var(--accent-text);">${k.keyMasked || (k.key ? `${k.key.slice(0, 11)}…${k.key.slice(-4)}` : 'sk-mave-…')}</td>
                <td style="padding:12px 16px; font-size:11px; color:var(--text-3);">${new Date(k.createdAt).toLocaleDateString()}</td>
                <td style="padding:12px 16px; font-size:11px; color:var(--text-3);">${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                <td style="padding:12px 16px; text-align:right;">
                  <button type="button" class="btn secondary small ws-btn-revoke-key" data-key="${k.key}" style="padding:4px 8px; font-size:11px; color:#ef4444;">Revoke</button>
                </td>
              </tr>
            `).join('');

            ktbody.querySelectorAll('.ws-btn-revoke-key').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const key = btn.dataset.key;
                if (confirm('Revoke this secret API key? Any connected client using it will immediately lose access.')) {
                  await api.invoke('users:revoke-key', key);
                  this.initWorkspace();
                }
              });
            });
          }
        }

        // Backburner Wireless Mesh & Context Window Telemetry
        try {
          const meshRes = await api.invoke('mesh:status');
          if (meshRes && meshRes.mesh) {
            const ctx = meshRes.mesh.context;
            if ($('ws-metric-context')) {
              $('ws-metric-context').textContent = `${(ctx.totalTokens || 32768).toLocaleString()} tokens`;
            }
            if ($('ws-metric-context-sub')) {
              const hostK = Math.round((ctx.hostTokens || 32768) / 1024);
              const offloadK = Math.round((ctx.offloadCapacityTokens || 0) / 1024);
              $('ws-metric-context-sub').textContent = `Host: ${hostK}k • Mesh: +${offloadK}k (${ctx.heldPagesCount || 0} pages offloaded)`;
            }
            if ($('ws-metric-devices')) {
              $('ws-metric-devices').textContent = `${ctx.activeCoProcessors || 0} Device(s)`;
            }

            const listEl = $('ws-coprocessors-list');
            if (listEl) {
              const devs = meshRes.mesh.devices || [];
              if (devs.length === 0) {
                listEl.innerHTML = '<div style="font-size:12px; color:var(--text-3); padding:6px 0;">No wireless co-processors detected yet. Connect any iPhone, Android, or laptop to this Wi-Fi to automatically join the mesh.</div>';
              } else {
                listEl.innerHTML = devs.map((d) => {
                  const icon = d.os === 'ios' ? '📱' : d.os === 'android' ? '🤖' : '💻';
                  return `
                    <div style="background:var(--surface-2); border:1px solid var(--border-subtle); border-radius:10px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:20px;">${icon}</span>
                        <div>
                          <div style="font-size:13px; font-weight:700; color:var(--text-1);">${escapeHtml(d.name)}</div>
                          <div style="font-size:11px; color:var(--text-3);">${d.connectionType === 'usb' ? '🔌 USB-C (10 Gb/s)' : '📡 Wi-Fi 6 Mesh'} • IP: ${d.ip} • Latency: ${d.latencyMs || 5}ms</div>
                        </div>
                      </div>
                      <div style="display:flex; align-items:center; gap:10px;">
                        <div style="text-align:right;">
                          <div style="font-size:12px; font-weight:700; color:#38bdf8;">${(d.heldTokens || 0).toLocaleString()} tokens held</div>
                          <div style="font-size:10px; color:var(--text-3);">${d.heldPagesCount || 0} KV Pages • Cap: ${(d.maxTokens || 0).toLocaleString()}</div>
                        </div>
                        <button type="button" class="btn secondary small ws-btn-disconnect-coprocessor" data-did="${d.id}" style="padding:4px 8px; font-size:11px; color:#ef4444;">Eject</button>
                      </div>
                    </div>
                  `;
                }).join('');

                listEl.querySelectorAll('.ws-btn-disconnect-coprocessor').forEach((btn) => {
                  btn.addEventListener('click', async () => {
                    await api.invoke('mesh:disconnect', btn.dataset.did);
                    this.initWorkspace();
                    this.avatar.hop();
                  });
                });
              }
            }
          }

          const pcRes = await api.invoke('promptcache:stats');
          if (pcRes && $('ws-metric-cache')) {
            $('ws-metric-cache').textContent = `${pcRes.hits || 0} Hits (${pcRes.savedSecondsTotal || 0}s saved)`;
          }
        } catch (meshErr) {
          console.warn('Mesh telemetry note:', meshErr);
        }
      } catch (err) {
        console.warn('Workspace init error:', err);
      }
    }

    bindWorkspacePanel() {
      if ($('ws-btn-open-portal')) {
        $('ws-btn-open-portal').addEventListener('click', () => {
          api.invoke('app:open-link', 'http://localhost:4040/product');
        });
      }

      if ($('ws-btn-refresh-host')) {
        $('ws-btn-refresh-host').addEventListener('click', () => {
          this.initWorkspace();
          this.avatar.hop();
        });
      }

      if ($('ws-btn-add-member')) {
        $('ws-btn-add-member').addEventListener('click', () => {
          if ($('ws-add-user-card')) $('ws-add-user-card').style.display = 'block';
        });
      }

      if ($('ws-btn-cancel-add')) {
        $('ws-btn-cancel-add').addEventListener('click', () => {
          if ($('ws-add-user-card')) $('ws-add-user-card').style.display = 'none';
        });
      }

      if ($('ws-btn-confirm-add')) {
        $('ws-btn-confirm-add').addEventListener('click', async () => {
          const email = $('ws-input-email') ? $('ws-input-email').value.trim() : '';
          const name = $('ws-input-name') ? $('ws-input-name').value.trim() : '';
          const role = $('ws-select-role') ? $('ws-select-role').value : 'member';

          if (!email) {
            alert('Please enter an email address for the user.');
            return;
          }

          try {
            await api.invoke('users:add', { email, displayName: name, role });
            if ($('ws-add-user-card')) $('ws-add-user-card').style.display = 'none';
            if ($('ws-input-email')) $('ws-input-email').value = '';
            if ($('ws-input-name')) $('ws-input-name').value = '';
            this.initWorkspace();
            this.avatar.hop();
          } catch (err) {
            alert(err.message || 'Failed to add user');
          }
        });
      }

      if ($('ws-btn-create-invite')) {
        $('ws-btn-create-invite').addEventListener('click', async () => {
          try {
            const res = await api.invoke('users:invite', { role: 'member', expiresInDays: 7 });
            if (res && res.token && $('ws-invite-banner') && $('ws-invite-input')) {
              const url = `http://${window.location.hostname || 'localhost'}:4040/join?token=${res.token}`;
              $('ws-invite-input').value = url;
              $('ws-invite-banner').style.display = 'flex';
            }
          } catch (err) {
            alert(err.message || 'Failed to create invite link');
          }
        });
      }

      if ($('ws-btn-copy-invite')) {
        $('ws-btn-copy-invite').addEventListener('click', () => {
          const input = $('ws-invite-input');
          if (input) {
            navigator.clipboard.writeText(input.value);
            $('ws-btn-copy-invite').textContent = 'Copied!';
            setTimeout(() => { $('ws-btn-copy-invite').textContent = 'Copy Link'; }, 2000);
          }
        });
      }

      if ($('ws-btn-create-key')) {
        $('ws-btn-create-key').addEventListener('click', async () => {
          const label = prompt('Secret Key Label (e.g., Cursor IDE, Python Client):', 'Cursor IDE');
          if (!label) return;
          try {
            const res = await api.invoke('users:create-key', { userId: 'user-owner-root', label });
            if (res && res.key && $('ws-new-key-banner') && $('ws-new-key-input')) {
              $('ws-new-key-input').value = res.key;
              $('ws-new-key-banner').style.display = 'block';
            }
            this.initWorkspace();
            this.avatar.bounce();
          } catch (err) {
            alert(err.message || 'Failed to generate API key');
          }
        });
      }

      if ($('ws-btn-copy-key')) {
        $('ws-btn-copy-key').addEventListener('click', () => {
          const input = $('ws-new-key-input');
          if (input) {
            navigator.clipboard.writeText(input.value);
            $('ws-btn-copy-key').textContent = 'Copied!';
            setTimeout(() => { $('ws-btn-copy-key').textContent = 'Copy'; }, 2000);
          }
        });
      }

      // Backburner Co-Processor Simulation & Prompt Cache Controls
      if ($('ws-btn-sim-co-join')) {
        $('ws-btn-sim-co-join').addEventListener('click', async () => {
          try {
            await api.invoke('mesh:auto-join', {
              deviceId: `dev-iphone-${Date.now().toString().slice(-4)}`,
              name: 'iPhone 17 Pro (Wireless Wi-Fi Co-Processor)',
              os: 'ios',
              ramBytes: 8 * 1024 * 1024 * 1024,
              freeMemoryBytes: 4 * 1024 * 1024 * 1024,
              connectionType: 'wireless',
              computeTier: 'gpu_npu',
            });
            this.initWorkspace();
            this.avatar.bounce();
            this.avatar.setMood('happy', 2500);
          } catch (err) {
            alert(`Failed to pair test phone: ${err.message}`);
          }
        });
      }

      if ($('ws-btn-prompt-cache-stats')) {
        $('ws-btn-prompt-cache-stats').addEventListener('click', async () => {
          const stats = await api.invoke('promptcache:stats');
          if (confirm(`⚡ SSD Preamble Prompt Cache:\n• Active Slots: ${stats.activeSlots}\n• Disk Size: ${stats.totalSizeMB} MB\n• Cache Hits: ${stats.hits}\n• Saved Time: ${stats.savedSecondsTotal} seconds\n\nWould you like to clear the prompt cache?`)) {
            await api.invoke('promptcache:clear');
            this.initWorkspace();
          }
        });
      }
    }
  }

  // Initialize instances
  const maveAvatar = new DotAvatarController();
  const maveIsland = new DynamicIslandController(maveAvatar);
  const maveNodeMgr = new NodeManager(maveAvatar, maveIsland);

  const emw = document.querySelector('.empty-mark-wrap');
  if (emw) {
    emw.addEventListener('click', () => {
      maveAvatar.hop();
      maveAvatar.setMood('happy');
    });
  }

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

  api.on('autonomous:update', (data) => {
    if (!data) return;
    const pct = data.progress ? data.progress.percentage : 0;
    const shortGoal = (data.goal || '').slice(0, 22);
    if (pct === 100) {
      maveAvatar.setMood('happy');
      maveAvatar.hop();
      maveIsland.setStatus(`Goal Done: ${shortGoal}`, 'idle');
    } else {
      maveAvatar.setMood('working');
      maveIsland.setStatus(`DAG ${pct}%: ${shortGoal}…`, 'thinking');
    }
  });

  // Settings tab click switcher delegates to window.openSettingsModal
  document.querySelectorAll('.settings-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (typeof window.openSettingsModal === 'function') {
        window.openSettingsModal(tab);
      }
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
  if (api && api.invoke) {
    api.invoke('app:info').then((info) => {
      if (info && info.state) setState(info.state);
    }).catch(() => {});
  }
  if (api && api.send) api.send('panel:ready');
})();
