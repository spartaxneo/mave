'use strict';
// Home: Authentic ChatGPT-style conversation canvas.
// Rich markdown rendering, syntax-highlighted code blocks with 1-click copy,
// thought accordions for reasoning, and assistant action toolbars.

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
    while ($('log').children.length > 300) $('log').children[1].remove(); // keep the empty state
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

    // 7. Unordered lists: - item or * item
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    text = text.replace(/(<li class="md-li">[\s\S]*?<\/li>)+/g, '<ul class="md-ul">$&</ul>');

    // 8. Ordered lists: 1. item
    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="md-oli">$1</li>');
    text = text.replace(/(<li class="md-oli">[\s\S]*?<\/li>)+/g, '<ol class="md-ol">$&</ol>');

    // 9. Links: [label](url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');

    // 10. Horizontal rule
    text = text.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr class="md-hr">');

    // 11. Paragraphs (split by double newlines)
    const paragraphs = text.split(/\n{2,}/);
    text = paragraphs.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[2-4]|ul|ol|blockquote|div|hr)/.test(trimmed)) return trimmed;
      return `<p class="md-p">${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('\n');

    // 12. Restore code blocks with ChatGPT-style header and copy button
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

    // 2. Read aloud / speaker button (uses optimized Mave neural voice)
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
    $('send').disabled = !running && !$('prompt').value.trim();
    $('send').title = running ? 'Stop (Esc)' : 'Send (Enter)';
    $('send').setAttribute('aria-label', running ? 'Stop' : 'Send');
  }

  function recordTaskInSidebar(title) {
    const recents = $('sidebar-recents');
    if (!recents) return;
    const clean = String(title || '').trim().slice(0, 32);
    if (!clean) return;

    // Check if duplicate of top
    const topItem = recents.querySelector('.recent-item:not(#recent-active-item)');
    if (topItem && topItem.querySelector('.recent-title')?.textContent === clean) return;

    const btn = el('button', 'recent-item');
    btn.type = 'button';
    btn.dataset.prompt = title;
    btn.innerHTML = `<span class="recent-icon">💬</span><span class="recent-title">${escapeHtml(clean)}</span>`;
    btn.addEventListener('click', () => {
      $('prompt').value = title;
      autosize();
      $('prompt').focus();
    });

    const activeItem = $('recent-active-item');
    if (activeItem && activeItem.nextSibling) {
      recents.insertBefore(btn, activeItem.nextSibling);
    } else {
      recents.append(btn);
    }
  }

  function finishAssistant(text) {
    showThinking(false);
    if (!live) { const { row, body } = assistantBubble(); live = { row, body }; add(row); }
    live.body.innerHTML = renderMarkdown(text);
    attachAssistantActions(live.row, text);
    live = null;
    steps = null;
    scrollDown();
  }

  function addEntry({ kind, text }) {
    if (kind === 'user') {
      steps = null;
      const row = el('div', 'turn user');
      row.append(el('div', 'msg user', text));
      add(row);
      recordTaskInSidebar(text);
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
    if (!text) return;
    $('prompt').value = '';
    autosize();
    await api.invoke('task:run', text);
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

  if ($('composer')) $('composer').addEventListener('submit', submit);
  if ($('prompt')) {
    $('prompt').addEventListener('input', autosize);
    $('prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
  }
  if ($('btn-setup')) $('btn-setup').addEventListener('click', () => api.invoke('app:open-settings', 'account'));
  if ($('region-clear')) $('region-clear').addEventListener('click', () => api.invoke('region:clear'));

  let jarvisHudActive = false;

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

  if ($('voice-btn')) $('voice-btn').addEventListener('click', toggleVoiceMode);
  if ($('talk-btn')) $('talk-btn').addEventListener('click', toggleVoiceMode);
  if ($('vso-close-btn')) $('vso-close-btn').addEventListener('click', toggleVoiceMode);
  if ($('vso-end-btn')) $('vso-end-btn').addEventListener('click', toggleVoiceMode);

  if ($('vso-toggle-hud')) {
    $('vso-toggle-hud').addEventListener('click', () => {
      jarvisHudActive = !jarvisHudActive;
      if ($('vso-chatgpt-mode')) $('vso-chatgpt-mode').hidden = jarvisHudActive;
      if ($('vso-jarvis-mode')) $('vso-jarvis-mode').hidden = !jarvisHudActive;
      if ($('vso-hud-icon')) $('vso-hud-icon').textContent = jarvisHudActive ? '✨ ChatGPT Dots' : '🦾 JARVIS HUD';
    });
  }

  if ($('vso-mute-btn')) {
    $('vso-mute-btn').addEventListener('click', () => {
      $('vso-mute-btn').classList.toggle('muted');
    });
  }

  // Audio-reactive fluid scaling on the ChatGPT Dots Orb
  api.on('engine:level', (lvl) => {
    const orb = $('chatgpt-voice-orb');
    if (orb) {
      const scale = 1 + Math.min(0.45, lvl * 1.5);
      orb.style.transform = `scale(${scale})`;
    }
  });

  // Claude Interactive Artifacts Slide-Out Panel
  window.showArtifact = function({ title = 'Artifact Preview', code = '', html = '' } = {}) {
    const pane = $('claude-artifacts-pane');
    if (!pane) return;
    pane.hidden = false;
    if ($('cap-title')) $('cap-title').textContent = title;
    if ($('cap-code-content')) $('cap-code-content').textContent = code || html;
    const frame = $('cap-preview-frame');
    if (frame) {
      frame.srcdoc = html || `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;background:#fff;color:#111;"><h3>${title}</h3><pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow:auto;"><code>${code ? code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</code></pre></body></html>`;
    }
  };

  if ($('cap-tab-preview')) {
    $('cap-tab-preview').addEventListener('click', () => {
      $('cap-tab-preview').classList.add('active');
      $('cap-tab-code').classList.remove('active');
      $('cap-preview-frame').hidden = false;
      $('cap-code-view').hidden = true;
    });
  }
  if ($('cap-tab-code')) {
    $('cap-tab-code').addEventListener('click', () => {
      $('cap-tab-code').classList.add('active');
      $('cap-tab-preview').classList.remove('active');
      $('cap-preview-frame').hidden = true;
      $('cap-code-view').hidden = false;
    });
  }
  if ($('cap-copy-btn')) {
    $('cap-copy-btn').addEventListener('click', () => {
      const code = ($('cap-code-content') && $('cap-code-content').textContent) || '';
      if (code) navigator.clipboard.writeText(code);
    });
  }
  if ($('cap-close-btn')) {
    $('cap-close-btn').addEventListener('click', () => {
      const pane = $('claude-artifacts-pane');
      if (pane) pane.hidden = true;
    });
  }

  api.on('voice-mode', (on) => updateVoiceModeUI(on));
  api.invoke('voice-mode:status').then((on) => updateVoiceModeUI(on)).catch(() => {});

  // ChatGPT empty-state chips & composer attach button
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

  if ($('composer-attach-btn')) {
    $('composer-attach-btn').addEventListener('click', () => {
      api.invoke('region:start');
    });
  }

  if ($('new-chat')) {
    $('new-chat').addEventListener('click', async () => {
      await api.invoke('conversation:reset');
      [...$('log').children].forEach((n) => { if (n.id !== 'empty') n.remove(); });
      live = null;
      thinking = null;
      steps = null;
      if ($('empty')) $('empty').hidden = false;
      if ($('prompt')) $('prompt').focus();
    });
  }

  api.on('state', setState);
  api.on('log', addEntry);
  api.on('log-live', ({ text }) => streamText(text));
  api.on('recommendations', (recs) => renderRecommendations(recs));

  // While the AI loads (at startup, after a model change), questions wait for it: say so.
  function renderLoader(status) {
    if (!status) return;
    const { ai, voice } = status;
    const box = $('ai-loading');
    if (!box) return;
    const loading = ai.state === 'loading' || ai.state === 'preparing';
    box.hidden = !(loading || ai.state === 'failed');
    box.dataset.state = ai.state === 'preparing' ? 'loading' : ai.state;
    if ($('ai-loading-retry')) $('ai-loading-retry').hidden = ai.state !== 'failed';
    if (ai.state === 'preparing') {
      if ($('ai-loading-text')) $('ai-loading-text').textContent = 'Getting ready for first use';
      const secs = Math.round((ai.elapsed || 0) / 1000);
      if ($('ai-loading-pct')) $('ai-loading-pct').textContent = ai.percent ? `${ai.percent}%` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if ($('ai-loading-bar')) $('ai-loading-bar').style.width = `${ai.percent}%`;
      if ($('ai-loading-note')) $('ai-loading-note').textContent = 'One time only: Mave is reading its instructions and tools, then saves them so every later start is instant. You can type now; your answer comes right after.';
    } else if (loading) {
      if ($('ai-loading-text')) $('ai-loading-text').textContent = `Loading the AI · ${ai.label}`;
      if ($('ai-loading-pct')) $('ai-loading-pct').textContent = `${ai.percent}%`;
      if ($('ai-loading-bar')) $('ai-loading-bar').style.width = `${ai.percent}%`;
      const secs = Math.round((ai.elapsed || 0) / 1000);
      if ($('ai-loading-note')) $('ai-loading-note').textContent = `You can type now; I’ll answer as soon as it’s loaded.${secs > 30 ? ' This PC is busy, so it’s taking longer: closing a few browser tabs helps.' : ''}${voice.state === 'loading' ? ' Voice is starting too.' : ''}`;
    } else if (ai.state === 'failed') {
      if ($('ai-loading-text')) $('ai-loading-text').textContent = 'The AI couldn’t load';
      if ($('ai-loading-pct')) $('ai-loading-pct').textContent = '';
      if ($('ai-loading-note')) $('ai-loading-note').textContent = ai.label;
    }
  }
  api.on('loader', renderLoader);
  api.invoke('loader:status').then(renderLoader).catch(() => {});
  if ($('ai-loading-retry')) $('ai-loading-retry').addEventListener('click', () => { $('ai-loading-retry').hidden = true; api.invoke('loader:retry'); });

  // The area the user marked, attached to the question it belongs to.
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
  api.on('settings', (s) => { if (s && s.models && $('prompt')) { $('prompt').placeholder = `Message ${s.assistantName}...`; renderSetup(); } });
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

  api.invoke('settings:get').then((s) => { if ($('prompt')) $('prompt').placeholder = `Message ${s.assistantName}...`; });
  renderSetup();
  api.invoke('app:info').then((info) => setState(info.state));
  api.send('panel:ready');
})();
