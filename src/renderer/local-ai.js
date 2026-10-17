'use strict';
// Local AI setup UI shared by onboarding and Settings: device check, model picker, download progress.

window.LocalAI = (() => {
  const api = window.buddy;
  const ACTIVE = ['queued', 'downloading', 'waiting', 'verifying', 'installing'];

  const gb = (b) => `${(b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  const mbps = (b) => `${(b / 1024 ** 2).toFixed(b >= 10 * 1024 ** 2 ? 0 : 1)} MB/s`;
  function eta(sec) {
    if (sec == null || !Number.isFinite(sec)) return '';
    if (sec < 60) return 'less than a minute left';
    const m = Math.round(sec / 60);
    return m < 60 ? `about ${m} min left` : `about ${Math.floor(m / 60)} h ${m % 60} min left`;
  }
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function describe(s) {
    const done = `${gb(s.bytesDone || 0)} of ${gb(s.bytesTotal || 0)}`;
    switch (s.status) {
      case 'queued': return { title: `Preparing ${s.label}…`, detail: done };
      case 'downloading': return { title: `Downloading ${s.label}`, detail: [done, s.speed ? mbps(s.speed) : '', eta(s.etaSec)].filter(Boolean).join(' · ') };
      case 'waiting': return { title: 'Waiting for the connection', detail: `${s.message || 'Reconnecting…'} ${done} saved.`, warn: true };
      case 'paused': return { title: 'Download paused', detail: `${done} saved. Resume any time; nothing is lost.` };
      case 'verifying': return { title: 'Verifying files…', detail: `${Math.round((s.verifyFraction || 0) * 100)}% checked` };
      case 'installing': return { title: 'Installing…', detail: 'Almost done.' };
      case 'failed': return { title: 'Download failed', detail: s.message || 'Something went wrong.', bad: true };
      default: return null;
    }
  }

  /** Progress card with its own Pause / Resume / Retry / Cancel controls. */
  function progressCard() {
    const root = h('div', 'lai-progress');
    const head = h('div', 'lai-p-head');
    const title = h('div', 'lai-p-title');
    const actions = h('div', 'lai-p-actions');
    head.append(title, actions);
    const bar = h('div', 'lai-bar');
    const fill = h('i');
    bar.append(fill);
    const detail = h('div', 'lai-p-detail');
    root.append(head, bar, detail);

    const button = (label, cls, fn) => {
      const b = h('button', `btn ${cls} small`, label);
      b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } });
      return b;
    };

    function render(s) {
      const d = describe(s);
      root.hidden = !d;
      if (!d) return;
      root.dataset.status = s.status;
      title.textContent = d.title;
      detail.textContent = d.detail;
      detail.classList.toggle('bad', Boolean(d.bad));
      detail.classList.toggle('warn', Boolean(d.warn));
      const pct = s.status === 'verifying' ? s.verifyFraction : s.fraction;
      fill.style.width = `${Math.max(2, Math.round((pct || 0) * 100))}%`;
      bar.classList.toggle('indeterminate', s.status === 'queued' || s.status === 'installing');
      actions.textContent = '';
      if (s.status === 'downloading' || s.status === 'queued') actions.append(button('Pause', 'secondary', () => api.invoke('local:pause')));
      if (s.status === 'waiting') actions.append(button('Resume now', 'secondary', () => api.invoke('local:resume')), button('Pause', 'plain', () => api.invoke('local:pause')));
      if (s.status === 'paused') actions.append(button('Resume', 'primary', () => api.invoke('local:resume')));
      if (s.status === 'failed') actions.append(button('Retry', 'primary', () => api.invoke('local:resume')));
      if (['downloading', 'waiting', 'paused', 'failed', 'queued'].includes(s.status)) {
        const cancel = button('Cancel', 'plain', () => api.invoke('local:cancel'));
        cancel.title = 'Stop and delete the partial download';
        actions.append(cancel);
      }
    }
    return { root, render };
  }

  /**
   * setup: the onboarding variant. It only installs; it never offers to switch models or names the
   * installed one (that belongs to Settings), and the page drives start() from its own button.
   */
  function picker(root, { setup = false, onChange = () => {} } = {}) {
    root.classList.add('lai');
    root.innerHTML = '';
    const device = h('div', 'lai-device');
    const scan = h('div', 'lai-scan');
    scan.append(h('span', 'spinner'), h('span', null, 'Analyzing your device capacity…'));
    const hw = h('div', 'lai-hw');
    hw.hidden = true;
    device.append(scan, hw);
    const rec = h('div', 'lai-rec');
    rec.hidden = true;
    const optionsLabel = h('div', 'lai-sec-title', 'Official Qwen3-VL Models');
    const options = h('div', 'lai-options');
    options.setAttribute('role', 'radiogroup');
    const colibriSection = h('div', 'lai-custom-wrap');
    const ollamaSection = h('div', 'lai-custom-wrap');
    const customSection = h('div', 'lai-custom-wrap');
    const imageSection = h('div', 'lai-image-wrap');
    const installed = h('div', 'lai-installed');
    installed.hidden = true;
    const progress = progressCard();
    const foot = h('div', 'lai-foot');
    const go = h('button', 'btn primary', 'Download & Install');
    go.type = 'button';
    foot.append(go);
    foot.hidden = setup;
    root.append(device, rec, optionsLabel, options, installed, colibriSection, ollamaSection, customSection, imageSection, progress.root, foot);

    let info = null;
    let status = { status: 'none' };
    let selected = null;

    function renderCustom() {
      colibriSection.textContent = '';
      ollamaSection.textContent = '';
      customSection.textContent = '';
      imageSection.textContent = '';
      if (setup || !info) return;

      // 1. Colibri MoE Models (Large Model MoE Engine)
      const colOpts = info.colibriModels || [];
      if (colOpts.length) {
        const colHead = h('div', 'lai-sec-head');
        const titleWrap = h('div', null);
        titleWrap.append(
          h('div', 'lai-sec-title', `Colibri MoE Engine · Frontier Models (${colOpts.length})`),
          h('span', 'lai-sub-note', 'Ultra-fast MoE runner for 35B–284B models · github.com/JustVugg/colibri')
        );
        colHead.append(titleWrap);
        colibriSection.append(colHead);
        const colList = h('div', 'lai-custom-list');
        for (const cm of colOpts) {
          const card = h('div', 'lai-custom-card colibri-card');
          const isCurrent = status.provider === 'colibri' && (status.colibriModel === cm.rawModel || status.installed === cm.id);
          if (isCurrent) card.classList.add('active');
          const left = h('div', 'lai-c-left');
          const top = h('div', 'lai-c-top');
          top.append(h('span', 'lai-c-name', cm.label), h('span', 'lai-c-size', cm.size));
          top.append(h('span', 'lai-tag colibri-tag', 'Colibri MoE'));
          if (isCurrent) top.append(h('span', 'lai-tag active', 'Active Model'));
          const sub = h('div', 'lai-c-path', cm.modelPath || cm.note);
          left.append(top, sub);

          const right = h('div', 'lai-c-right');
          if (!isCurrent) {
            const swBtn = h('button', 'btn secondary small', 'Switch');
            swBtn.type = 'button';
            swBtn.addEventListener('click', async () => {
              swBtn.disabled = true;
              swBtn.textContent = 'Switching…';
              selected = cm.id;
              await api.invoke('local:start', cm.id);
              await load();
            });
            right.append(swBtn);
          }
          card.append(left, right);
          colList.append(card);
        }
        colibriSection.append(colList);
      }

      // 2. Ollama Local Models
      const olOpts = info.ollamaModels || [];
      if (olOpts.length) {
        const olHead = h('div', 'lai-sec-head');
        olHead.append(h('div', 'lai-sec-title', `Ollama Local Models (${olOpts.length})`));
        ollamaSection.append(olHead);
        const olList = h('div', 'lai-custom-list');
        for (const om of olOpts) {
          const card = h('div', 'lai-custom-card');
          const isCurrent = status.provider === 'ollama' && status.ollamaModel === om.rawModel;
          if (isCurrent) card.classList.add('active');
          const left = h('div', 'lai-c-left');
          const top = h('div', 'lai-c-top');
          top.append(h('span', 'lai-c-name', om.label), h('span', 'lai-c-size', om.size));
          top.append(h('span', 'lai-tag ollama-tag', 'Ollama'));
          if (isCurrent) top.append(h('span', 'lai-tag active', 'Active Model'));
          const sub = h('div', 'lai-c-path', om.modelPath || om.note);
          left.append(top, sub);

          const right = h('div', 'lai-c-right');
          if (!isCurrent) {
            const swBtn = h('button', 'btn secondary small', 'Switch');
            swBtn.type = 'button';
            swBtn.addEventListener('click', async () => {
              swBtn.disabled = true;
              swBtn.textContent = 'Switching…';
              selected = om.id;
              await api.invoke('local:start', om.id);
              await load();
            });
            right.append(swBtn);
          }
          card.append(left, right);
          olList.append(card);
        }
        ollamaSection.append(olList);
      }

      // 3. Custom GGUF models
      const cOpts = info.customOptions || [];
      const cHead = h('div', 'lai-sec-head');
      cHead.append(h('div', 'lai-sec-title', `Installed & Custom Models on This PC (${cOpts.length})`));
      const pickBtn = h('button', 'btn secondary small', '+ Browse GGUF…');
      pickBtn.type = 'button';
      pickBtn.addEventListener('click', async () => {
        const picked = await api.invoke('local:pick-file');
        if (picked) load();
      });
      cHead.append(pickBtn);
      customSection.append(cHead);

      if (cOpts.length) {
        const cList = h('div', 'lai-custom-list');
        for (const cm of cOpts) {
          const card = h('div', 'lai-custom-card');
          const isCurrent = (status.provider === 'local' || !status.provider) && status.installed === cm.id;
          if (isCurrent) card.classList.add('active');
          const left = h('div', 'lai-c-left');
          const top = h('div', 'lai-c-top');
          top.append(h('span', 'lai-c-name', cm.label), h('span', 'lai-c-size', cm.size));
          if (isCurrent) top.append(h('span', 'lai-tag active', 'Active Model'));
          const sub = h('div', 'lai-c-path', cm.modelPath || cm.note);
          left.append(top, sub);

          const right = h('div', 'lai-c-right');
          if (!isCurrent) {
            const swBtn = h('button', 'btn secondary small', 'Switch');
            swBtn.type = 'button';
            swBtn.addEventListener('click', async () => {
              swBtn.disabled = true;
              swBtn.textContent = 'Switching…';
              selected = cm.id;
              await api.invoke('local:start', cm.id);
              await load();
            });
            right.append(swBtn);
          }
          card.append(left, right);
          cList.append(card);
        }
        customSection.append(cList);
      } else {
        const empty = h('div', 'lai-empty-note', 'No additional custom .gguf models detected. Click "+ Browse GGUF…" to add any model from disk.');
        customSection.append(empty);
      }

      // Local Image & Diffusion models
      const iOpts = info.imageModels || [];
      if (iOpts.length) {
        const iHead = h('div', 'lai-sec-head');
        iHead.append(h('div', 'lai-sec-title', `Local Image & Diffusion Models (${iOpts.length})`));
        imageSection.append(iHead);
        const iList = h('div', 'lai-custom-list');
        for (const im of iOpts) {
          const card = h('div', 'lai-custom-card image-card');
          const left = h('div', 'lai-c-left');
          const top = h('div', 'lai-c-top');
          top.append(h('span', 'lai-c-name', im.name), h('span', 'lai-c-size', im.size));
          top.append(h('span', 'lai-tag img-tag', 'Safetensors Diffusion'));
          const sub = h('div', 'lai-c-path', im.path);
          left.append(top, sub);
          card.append(left);
          iList.append(card);
        }
        imageSection.append(iList);
      }
    }

    function renderOptions() {
      options.textContent = '';
      if (!info) return;
      const job = ACTIVE.includes(status.status) || status.status === 'paused' || status.status === 'failed' ? status.modelId : null;
      for (const o of info.options) {
        const b = h('button', 'lai-opt');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        const isSel = (job || selected) === o.id;
        b.setAttribute('aria-checked', String(isSel));
        b.disabled = !o.available || Boolean(job);
        const dot = h('span', 'lai-dot');
        const name = h('span', 'lai-size', o.size);
        const note = h('span', `lai-note${o.recommended ? ' rec' : ''}`, o.note);
        const size = h('span', 'lai-bytes', `~${gb(o.bytes)}`);
        const tag = !setup && status.installed === o.id ? h('span', 'lai-tag', 'Installed') : null;
        b.append(dot, name, note, ...(tag ? [tag] : []), size);
        b.addEventListener('click', () => { selected = o.id; renderAll(); onChange(); });
        options.append(b);
      }
      renderCustom();
    }

    function renderAll() {
      renderOptions();
      progress.render(status);
      const busy = ACTIVE.includes(status.status) || status.status === 'paused' || status.status === 'failed';
      installed.hidden = !status.installed || busy;
      if (status.installed) {
        installed.textContent = '';
        installed.append(h('span', 'lai-check'), h('span', null, setup
          ? 'Your local AI is installed and works offline.'
          : `${status.installedLabel} is installed and works offline.`));
      }
      if (setup) {
        const done = Boolean(status.installed) && !busy;
        rec.hidden = done || !info;
        options.hidden = done;
      }
      const same = selected === status.installed;
      go.hidden = busy || (same && Boolean(status.installed));
      go.textContent = status.installed ? 'Download & Switch' : 'Download & Install';
      go.disabled = !selected;
    }

    async function load() {
      const [hwRes, st] = await Promise.all([api.invoke('local:hardware'), api.invoke('local:status')]);
      info = hwRes;
      status = st;
      const x = info.hardware;
      scan.hidden = true;
      hw.hidden = false;
      hw.innerHTML = '';
      const row = (k, v) => { const r = h('div'); r.append(h('span', null, k), h('b', null, v)); return r; };
      hw.append(
        row('GPU', x.dedicated ? `${x.gpu} · ${Math.round(x.vramGB)} GB` : `${x.gpu} (shared memory)`),
        row('RAM', `${Math.round(x.ramGB)} GB`),
        ...(x.freeDiskGB != null ? [row('Free disk', `${Math.round(x.freeDiskGB)} GB`)] : []),
      );
      const pick = info.options.find((o) => o.id === info.pick);
      rec.hidden = false;
      rec.innerHTML = '';
      rec.append(h('span', null, 'Recommended local AI'), h('b', null, `${pick.label} — ~${gb(pick.bytes)}`));
      selected = status.installed || info.pick;
      renderAll();
      onChange();
    }

    async function start() {
      if (!selected) return null;
      status = await api.invoke('local:start', selected);
      renderAll();
      onChange();
      return status;
    }
    go.addEventListener('click', start);

    const off = api.on('local:progress', (s) => { status = s; renderAll(); onChange(); });
    load().catch((err) => { scan.textContent = `Couldn’t check this PC: ${err.message}`; });
    return {
      start,
      get status() { return status; },
      get selected() { return selected; },
      dispose: off,
    };
  }

  /** The strip at the top of the main window while the model downloads. */
  function banner(root) {
    root.classList.add('lai-banner');
    const card = progressCard();
    root.append(card.root);
    let hideTimer = null;
    const show = (s) => {
      clearTimeout(hideTimer);
      if (describe(s)) {
        root.hidden = false;
        root.classList.remove('done');
        card.render(s);
      } else if (!root.hidden && s.status === 'ready') {
        card.root.hidden = false;
        root.classList.add('done');
        card.root.querySelector('.lai-p-title').textContent = `${s.installedLabel} is ready`;
        card.root.querySelector('.lai-p-detail').textContent = 'Mave now runs on this PC and works offline.';
        card.root.querySelector('.lai-p-actions').textContent = '';
        card.root.querySelector('.lai-bar i').style.width = '100%';
        hideTimer = setTimeout(() => { root.hidden = true; }, 6000);
      } else {
        root.hidden = true;
      }
    };
    root.hidden = true;
    api.invoke('local:status').then(show);
    api.on('local:progress', show);
  }

  return { picker, banner, describe, gb };
})();
