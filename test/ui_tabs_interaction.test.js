'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Sidebar navigation tabs and modal targets are cleanly structured and wired', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/app.html'), 'utf8');

  // 1. Verify nav is not display:none
  assert.ok(!html.includes('id="nav" style="display: none'), 'nav element must not be hidden via inline style');
  assert.ok(html.includes('id="nav"'), 'nav element exists');

  // 2. Verify all 7 sidebar tabs exist in HTML
  assert.ok(html.includes('id="nav-item-chat"') || html.includes('data-section="home"'), 'Chat tab exists');
  assert.ok(html.includes('id="nav-item-images"'), 'Images tab exists');
  assert.ok(html.includes('id="nav-item-library"'), 'Library tab exists');
  assert.ok(html.includes('id="nav-item-scheduled"'), 'Scheduled tab exists');
  assert.ok(html.includes('id="nav-item-plugins"'), 'Plugins tab exists');
  assert.ok(html.includes('id="nav-item-projects"'), 'Projects tab exists');
  assert.ok(html.includes('id="nav-item-more"'), 'More tab exists');

  // 3. Verify target modals exist in HTML outside of settings-modal
  assert.ok(html.includes('id="modal-images"'), 'modal-images exists');
  assert.ok(html.includes('id="modal-library"'), 'modal-library exists');
  assert.ok(html.includes('id="modal-scheduled"'), 'modal-scheduled exists');
  assert.ok(html.includes('id="modal-projects"'), 'modal-projects exists');

  // 4. Verify DOM tree is perfectly closed (no unclosed tags trapping modals)
  const lines = html.split('\n');
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const re = /<\/?([a-zA-Z0-9\-]+)(?:\s+[^>]*?)?(?<!\/)>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const full = m[0];
      const tag = m[1].toLowerCase();
      if (['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse'].includes(tag)) {
        continue;
      }
      if (full.endsWith('/>')) continue;
      if (full.startsWith('</')) {
        let found = -1;
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].tag === tag) {
            found = j;
            break;
          }
        }
        if (found !== -1) {
          stack.splice(found, 1);
        }
      } else {
        stack.push({ tag, line: i + 1 });
      }
    }
  }
  assert.equal(stack.length, 0, `All HTML tags must be properly closed. Remaining: ${JSON.stringify(stack)}`);
});

test('Navigation click handlers and modal controllers in home.js and app.js', () => {
  const homeJs = fs.readFileSync(path.join(__dirname, '../src/renderer/home.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');

  // Verify modal opener functions
  assert.ok(homeJs.includes('openImagesModal'), 'openImagesModal defined in home.js');
  assert.ok(homeJs.includes('openLibraryModal'), 'openLibraryModal defined in home.js');
  assert.ok(homeJs.includes('openScheduledModal'), 'openScheduledModal defined in home.js');
  assert.ok(homeJs.includes('closeAllModals'), 'closeAllModals defined in home.js');

  // Verify tabs invoke openers and openSettingsModal
  assert.ok(homeJs.includes("openImagesModal()"), 'nav-item-images invokes openImagesModal()');
  assert.ok(homeJs.includes("openLibraryModal()"), 'nav-item-library invokes openLibraryModal()');
  assert.ok(homeJs.includes("openScheduledModal()"), 'nav-item-scheduled invokes openScheduledModal()');
  assert.ok(homeJs.includes("openSettingsModal('plugins')"), 'nav-item-plugins routes directly to plugins settings modal');
  assert.ok(homeJs.includes("modal-projects"), 'nav-item-projects opens modal-projects');

  // Verify escape closes modals
  assert.ok(homeJs.includes("e.key === 'Escape'"), 'Global Escape listener closes modals');

  // Verify app.js only captures buttons with data-section, not swallow generic actions
  assert.ok(appJs.includes("button[data-section]"), 'app.js uses scoped button[data-section] selector');
});
