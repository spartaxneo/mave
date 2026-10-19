'use strict';
// ChatGPT Canvas & Side-by-Side Artifacts Editor for Mave.
// Provides dedicated code, document, and data analysis split-screen editing
// with live on-device Python/JS Code Interpreter execution and 1-click refactoring.

(() => {
  const api = window.buddy;
  if (!api) return;

  const $ = (id) => document.getElementById(id);

  let isOpen = false;
  let currentFile = {
    title: 'script.py',
    language: 'python',
    content: `# ChatGPT-Grade Code Interpreter & Canvas for Mave\nimport os\n\nprint("Hello from Mave Python Sandbox!")\nfor i in range(1, 6):\n    print(f"Calculation step {i}: {i ** 2}")\n`,
  };

  function openCanvas(fileData = null) {
    const pane = $('chatgpt-canvas-pane');
    if (!pane) return;

    if (fileData) {
      currentFile = { ...currentFile, ...fileData };
    }

    isOpen = true;
    pane.hidden = false;
    document.body.classList.add('canvas-open');

    updateCanvasView();
  }

  function closeCanvas() {
    const pane = $('chatgpt-canvas-pane');
    if (!pane) return;
    isOpen = false;
    pane.hidden = true;
    document.body.classList.remove('canvas-open');
  }

  function updateCanvasView() {
    const titleEl = $('canvas-file-title');
    const langBadge = $('canvas-lang-badge');
    const editor = $('canvas-code-editor');

    if (titleEl) titleEl.textContent = currentFile.title || 'untitled.py';
    if (langBadge) langBadge.textContent = (currentFile.language || 'python').toUpperCase();
    if (editor) editor.value = currentFile.content || '';

    // Clear previous execution output
    const outputBox = $('canvas-output-box');
    if (outputBox) outputBox.hidden = true;
  }

  async function runCode() {
    const editor = $('canvas-code-editor');
    const outputBox = $('canvas-output-box');
    const stdoutEl = $('canvas-stdout');
    const plotsEl = $('canvas-plots');
    const runBtn = $('canvas-btn-run');

    if (!editor || !outputBox || !stdoutEl) return;

    const code = editor.value;
    const language = (currentFile.language || 'python').toLowerCase();

    outputBox.hidden = false;
    stdoutEl.textContent = '⏳ Executing in Mave sandbox...';
    if (plotsEl) plotsEl.innerHTML = '';
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = 'Running…';
    }

    try {
      const res = await api.invoke('code-interpreter:run', { language, code, timeoutMs: 20000 });

      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Code';
      }

      let out = '';
      if (res.stdout) out += res.stdout;
      if (res.stderr) out += (out ? '\n[STDERR]:\n' : '') + res.stderr;
      if (!out && res.ok) out = `Process finished with exit code ${res.exitCode} (${res.durationMs}ms)`;

      stdoutEl.textContent = out || '(No standard output generated)';

      // Render any plots
      if (res.plots && res.plots.length > 0 && plotsEl) {
        plotsEl.innerHTML = '';
        res.plots.forEach((plot) => {
          const img = document.createElement('img');
          img.src = plot.dataUrl;
          img.className = 'canvas-generated-plot';
          img.style.maxWidth = '100%';
          img.style.borderRadius = '8px';
          img.style.marginTop = '8px';
          plotsEl.appendChild(img);
        });
      }
    } catch (err) {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Code';
      }
      stdoutEl.textContent = `Execution failed: ${err.message}`;
    }
  }

  function init() {
    // Canvas Toggle Button in Titlebar
    const toggleBtn = $('canvas-trigger-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (isOpen) closeCanvas();
        else openCanvas();
      });
    }

    // Close & Back Buttons
    const closeBtn = $('canvas-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeCanvas);
    const backBtn = $('canvas-back-btn');
    if (backBtn) backBtn.addEventListener('click', closeCanvas);

    // Run Code Button
    const runBtn = $('canvas-btn-run');
    if (runBtn) runBtn.addEventListener('click', runCode);

    // Copy Code Button
    const copyBtn = $('canvas-btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const editor = $('canvas-code-editor');
        if (editor) {
          navigator.clipboard.writeText(editor.value);
          copyBtn.textContent = '✅ Copied';
          setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
        }
      });
    }

    // Quick Action Chips: Review, Optimize, Format
    const reviewBtn = $('canvas-chip-review');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        const editor = $('canvas-code-editor');
        if (editor && editor.value) {
          api.invoke('task:run', `Review this code for bugs, edge cases, and performance:\n\`\`\`${currentFile.language}\n${editor.value}\n\`\`\``);
        }
      });
    }

    const optimizeBtn = $('canvas-chip-optimize');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => {
        const editor = $('canvas-code-editor');
        if (editor && editor.value) {
          api.invoke('task:run', `Optimize this code for execution speed and memory efficiency:\n\`\`\`${currentFile.language}\n${editor.value}\n\`\`\``);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__openChatGPTCanvas = openCanvas;
  window.__closeChatGPTCanvas = closeCanvas;
})();
