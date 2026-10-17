'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pinchTab } = require('../src/main/browser/pinchtab');
const browserTools = require('../src/main/plugins/builtin/browser');
const { validate } = require('../src/main/plugins/registry');

test('PinchTab browser tools export valid schemas', () => {
  assert.ok(Array.isArray(browserTools));
  assert.equal(browserTools.length, 6);

  for (const tool of browserTools) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed schema validation: ${error}`);
  }

  const names = browserTools.map((t) => t.name);
  assert.ok(names.includes('browser_navigate'));
  assert.ok(names.includes('browser_snapshot'));
  assert.ok(names.includes('browser_click'));
  assert.ok(names.includes('browser_type'));
  assert.ok(names.includes('browser_press_key'));
  assert.ok(names.includes('browser_extract_text'));
});

test('PinchTab server connects and navigates live Chrome', async (t) => {
  const healthy = await pinchTab.isHealthy();
  if (!healthy) {
    t.skip('PinchTab server is not running on port 9867 (skipping live integration test)');
    return;
  }

  const nav = await pinchTab.navigate('https://example.com');
  assert.ok(nav.url.includes('example.com'));
  assert.equal(nav.title, 'Example Domain');

  const snap = await pinchTab.snapshot();
  assert.ok(snap.count > 0);
  assert.ok(snap.outline.includes('Learn more') || snap.outline.includes('Example Domain'));
});

