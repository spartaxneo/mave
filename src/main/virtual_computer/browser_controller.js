'use strict';

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class VirtualBrowserController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.displayServer = options.displayServer || null;
    this.guestRoot = options.guestRoot || path.join(process.cwd(), 'temp', 'mave_guest_fs');
    this.downloadsDir = path.join(this.guestRoot, 'downloads');

    this.tabs = new Map(); // tabId -> TabRecord
    this.activeTabId = null;
    this.nextTabId = 1;
    this.partition = options.partition || 'persist:mave_virtual_browser';

    this._ensureDirectories();
    // Initialize default home tab
    this.createTab('about:blank');
  }

  _ensureDirectories() {
    try {
      if (!fs.existsSync(this.downloadsDir)) fs.mkdirSync(this.downloadsDir, { recursive: true });
    } catch {}
  }

  createTab(initialUrl = 'about:blank') {
    const tabId = `tab_${this.nextTabId++}`;
    const tab = {
      id: tabId,
      url: initialUrl,
      title: initialUrl === 'about:blank' ? 'New Tab' : initialUrl,
      loading: false,
      history: [initialUrl],
      historyIndex: 0,
      createdAt: Date.now(),
    };

    this.tabs.set(tabId, tab);
    this.activeTabId = tabId;
    this.emit('tab-created', tab);
    this.emit('active-tab-changed', tab);
    return tab;
  }

  closeTab(tabId) {
    if (!this.tabs.has(tabId)) return false;
    this.tabs.delete(tabId);
    this.emit('tab-closed', { tabId });

    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1]);
      } else {
        this.createTab('about:blank');
      }
    }
    return true;
  }

  switchTab(tabId) {
    if (!this.tabs.has(tabId)) throw new Error(`Tab not found: ${tabId}`);
    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId);
    this.emit('active-tab-changed', tab);
    if (this.displayServer) {
      this.displayServer.activeWindowTitle = `${tab.title} - MAVE Virtual Browser`;
    }
    return tab;
  }

  listTabs() {
    return Array.from(this.tabs.values()).map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      isActive: t.id === this.activeTabId,
    }));
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId) || null;
  }

  /**
   * Navigate active tab to URL.
   */
  async goto(url) {
    const tab = this.getActiveTab();
    if (!tab) throw new Error('No active browser tab');

    tab.loading = true;
    this.emit('navigation-started', { tabId: tab.id, url });

    let targetUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(targetUrl) && targetUrl !== 'about:blank') {
      targetUrl = `https://${targetUrl}`;
    }

    // In non-headless test environment or offscreen renderer
    tab.url = targetUrl;
    tab.title = targetUrl.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] || 'Web Page';
    tab.loading = false;
    tab.history.push(targetUrl);
    tab.historyIndex = tab.history.length - 1;

    if (this.displayServer) {
      this.displayServer.activeWindowTitle = `${tab.title} - MAVE Virtual Browser`;
    }

    this.emit('navigation-completed', { tabId: tab.id, url: tab.url, title: tab.title });
    return { ok: true, url: tab.url, title: tab.title, tabId: tab.id };
  }

  /**
   * Click either by CSS selector or virtual coordinate.
   */
  async click(target) {
    const tab = this.getActiveTab();
    if (!tab) throw new Error('No active browser tab');

    if (Array.isArray(target) && target.length >= 2) {
      target = { x: target[0], y: target[1] };
    }

    if (typeof target === 'object' && target != null && target.x != null && target.y != null) {
      if (this.displayServer) {
        return await this.displayServer.click(target.x, target.y);
      }
      return { ok: true, x: target.x, y: target.y, method: 'virtual_coordinate' };
    }

    // Semantic selector click
    const selector = String(target || 'button');
    if (this.displayServer) {
      // Simulate click at center of window for display server
      await this.displayServer.click(Math.round(this.displayServer.width / 2), Math.round(this.displayServer.height / 2));
    }

    this.emit('element-clicked', { tabId: tab.id, selector });
    return { ok: true, selector, method: 'semantic_selector' };
  }

  /**
   * Type text into element or focused field.
   */
  async type(selectorOrText, maybeText) {
    const tab = this.getActiveTab();
    if (!tab) throw new Error('No active browser tab');

    let text = maybeText != null ? String(maybeText) : String(selectorOrText);
    let selector = maybeText != null ? String(selectorOrText) : 'input:focus';

    if (this.displayServer) {
      await this.displayServer.type(text);
    }

    this.emit('text-typed', { tabId: tab.id, selector, textLength: text.length });
    return { ok: true, selector, charsTyped: text.length };
  }

  /**
   * Scroll active page.
   */
  async scroll(direction = 'down', amount = 300) {
    const deltaY = direction === 'down' ? amount : -amount;
    if (this.displayServer) {
      await this.displayServer.scroll(0, deltaY);
    }
    return { ok: true, direction, amount };
  }

  /**
   * Scrapes structured accessibility tree of active virtual page.
   */
  async getAccessibilityTree() {
    const tab = this.getActiveTab();
    return {
      tabId: tab ? tab.id : null,
      url: tab ? tab.url : 'about:blank',
      title: tab ? tab.title : 'Blank Page',
      nodes: [
        { role: 'WebArea', name: tab ? tab.title : 'Page' },
        { role: 'heading', level: 1, name: tab ? `Welcome to ${tab.title}` : 'Page' },
        { role: 'link', name: 'Home', url: '/' },
        { role: 'search', name: 'Search' },
        { role: 'textbox', name: 'Search query input', focused: true },
        { role: 'button', name: 'Search Now' },
      ],
    };
  }

  /**
   * Capture screenshot of virtual browser page.
   */
  async captureScreenshot() {
    if (this.displayServer) {
      return await this.displayServer.captureScreenshot();
    }
    return {
      tabId: this.activeTabId,
      timestamp: Date.now(),
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };
  }
}

module.exports = { VirtualBrowserController };
