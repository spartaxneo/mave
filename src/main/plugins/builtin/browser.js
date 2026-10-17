'use strict';
// Real Browser Automation Tools powered by PinchTab (github.com/pinchtab/pinchtab).
// Provides high-performance, token-efficient Chrome control, accessibility snapshots,
// clicking, typing, and page interaction without heavy screenshot overhead.

const { pinchTab } = require('../../browser/pinchtab');

module.exports = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in Google Chrome via PinchTab. Returns page title, URL, and an accessibility outline with interactive element refs.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The web address or URL to visit (e.g. "https://github.com", "https://news.ycombinator.com").',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `PinchTab: Navigating to ${input.url}...`);
      await pinchTab.navigate(input.url);
      const snap = await pinchTab.snapshot();

      return `🌐 **NAVIGATED TO**: "${snap.title || input.url}"\n• **URL**: ${snap.url || input.url}\n• **Interactive Elements Found**: ${snap.interactiveCount}\n\n**Interactive Outline**:\n${snap.outline || '(No interactive elements found)'}\n\n*Tip: Use \`browser_click\` or \`browser_type\` with any \`[ref]\` above.*`;
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Get an updated accessibility tree snapshot of the currently open browser page, listing buttons, links, inputs, and their element refs.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'PinchTab: Capturing accessibility snapshot...');
      const snap = await pinchTab.snapshot();

      return `📄 **PAGE SNAPSHOT**: "${snap.title}" (${snap.url})\n• **Interactive Elements**: ${snap.interactiveCount}\n\n**Interactive Outline**:\n${snap.outline || '(No interactive elements found)'}`;
    },
  },
  {
    name: 'browser_click',
    description: 'Click an interactive button, link, or element on the current page using its element ref (e.g. "e13").',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The element reference ID from the snapshot (e.g. "e13", "e2").',
        },
      },
      required: ['ref'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `PinchTab: Clicking element [${input.ref}]...`);
      const res = await pinchTab.click(input.ref);
      await new Promise((r) => setTimeout(r, 600));
      const snap = await pinchTab.snapshot();

      return `👆 **CLICKED ELEMENT** [${input.ref}]\n• **Current URL**: ${snap.url}\n• **Current Title**: ${snap.title}\n\n**Updated Elements**:\n${snap.outline || '(Page updated)'}`;
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field or search box using its element ref (e.g. "e2").',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The input element reference ID (e.g. "e2").',
        },
        text: {
          type: 'string',
          description: 'The text string to type into the field.',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Whether to press Enter after typing (default: false).',
        },
      },
      required: ['ref', 'text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `PinchTab: Typing into [${input.ref}]...`);
      await pinchTab.type(input.ref, input.text);
      if (input.pressEnter) {
        await pinchTab.press('Enter');
        await new Promise((r) => setTimeout(r, 600));
      }

      return `⌨️ **TYPED INTO** [${input.ref}]: "${input.text}"${input.pressEnter ? ' (pressed Enter)' : ''}`;
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key in the browser (e.g. "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp").',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Key name (e.g. "Enter", "Escape", "Tab").',
        },
      },
      required: ['key'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', `PinchTab: Pressing key "${input.key}"...`);
      await pinchTab.press(input.key);
      return `🔘 **PRESSED KEY**: "${input.key}"`;
    },
  },
  {
    name: 'browser_extract_text',
    description: 'Extract readable clean text and article body from the currently active page in Chrome.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'PinchTab: Extracting page text...');
      const text = await pinchTab.extractText();
      const preview = text.length > 3000 ? text.slice(0, 3000) + '\n\n...(truncated)...' : text;
      return `📖 **PAGE TEXT CONTENT**:\n\n${preview}`;
    },
  },
];
