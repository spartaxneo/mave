'use strict';
// Ghost AI Core Real-Time File Watcher & Background Knowledge Base Indexer.
// Crawls workspace, documents, notes, code, and configs.
// Extracts text, tokenizes, and indexes into the HybridSearchEngine (BM25 + Semantic Vector RRF).
// Watches file system changes (create/update/delete) with debouncing.
// Pre-indexes system actions, MCP tools, and app navigation targets for the Omnibox.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.js', '.ts', '.jsx', '.tsx',
  '.html', '.css', '.scss', '.py', '.rb', '.rs', '.go', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.sh', '.bash', '.ps1',
  '.yaml', '.yml', '.toml', '.ini', '.csv', '.tsv', '.xml', '.sql'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.vscode', '.idea', '__pycache__', '.next', '.nuxt', 'coverage',
  '.system_generated', 'target', 'vendor', 'bin', 'obj'
]);

const MAX_FILE_SIZE = 1024 * 1024 * 2; // 2 MB max file size for indexing
const MAX_TOTAL_FILES = 5000;

class GhostFileWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.searchEngine = options.searchEngine;
    this.logger = options.logger || console;
    this.watchRoots = options.watchRoots || [
      process.cwd(),
      path.join(os.homedir(), 'Documents'),
    ];
    this.watchers = new Map(); // dirPath -> fs.FSWatcher
    this.fileStats = new Map(); // filePath -> mtimeMs
    this.debounceTimers = new Map(); // filePath -> timer
    this.isIndexing = false;
    this.stats = {
      filesIndexed: 0,
      totalBytesProcessed: 0,
      errors: 0,
      lastCrawl: null,
    };

    this._preindexSystemActions();
  }

  /**
   * Pre-seed essential system actions and MCP tools into the search engine for instant Omnibox discovery.
   */
  _preindexSystemActions() {
    if (!this.searchEngine) return;

    const systemActions = [
      {
        id: 'action:terminal',
        title: 'Open Terminal Shell',
        content: 'Open integrated terminal bash powershell cmd terminal command line execution',
        path: 'System Action',
        metadata: { type: 'action', icon: '💻', actionId: 'open_terminal', shortcut: 'Ctrl+`' }
      },
      {
        id: 'action:screenshot',
        title: 'Take Desktop Screenshot',
        content: 'Capture screen capture display visual perception crop full screen desktop snapshot',
        path: 'System Action',
        metadata: { type: 'action', icon: '📸', actionId: 'take_screenshot', shortcut: 'Ctrl+Shift+S' }
      },
      {
        id: 'action:settings-security',
        title: 'Security & 2FA Authenticator Settings',
        content: 'Two-factor authentication TOTP QR code RFC 6238 biometrics encryption password vault privacy',
        path: 'Settings > Security',
        metadata: { type: 'setting', icon: '🛡️', section: 'security' }
      },
      {
        id: 'action:settings-plugins',
        title: 'MCP Plugins & App Store Catalog',
        content: 'Model Context Protocol MCP Server tools install plugins marketplace extensions github filesystem git',
        path: 'Settings > Plugins',
        metadata: { type: 'setting', icon: '🔌', section: 'plugins' }
      },
      {
        id: 'action:settings-models',
        title: 'Local AI Model Settings',
        content: 'Qwen3-VL 8B local GGUF models parameters context length VRAM quantization weights download',
        path: 'Settings > Models',
        metadata: { type: 'setting', icon: '🧠', section: 'models' }
      },
      {
        id: 'action:settings-storage',
        title: 'Storage & Database Memory Manager',
        content: 'Disk usage SQLite vector database cache cleanup backup reset storage metrics',
        path: 'Settings > Storage',
        metadata: { type: 'setting', icon: '💾', section: 'storage' }
      },
      {
        id: 'action:settings-iot',
        title: 'Smart Home & IoT Device Hub',
        content: 'Home Assistant MQTT lights thermostat locks smart plugs Zigbee Matter Tuya',
        path: 'Settings > Smart Home',
        metadata: { type: 'setting', icon: '🏠', section: 'iot' }
      },
      {
        id: 'action:privacy-shield',
        title: 'Activate Privacy Blind Shield',
        content: 'Pause camera vision screen recording microphone blind shield private confidential stealth mode',
        path: 'System Action',
        metadata: { type: 'action', icon: '👁️‍🗨️', actionId: 'privacy_blind' }
      },
      {
        id: 'action:network-diagnostics',
        title: 'Autonomous Sentinel Network Status',
        content: 'Internet connectivity probe DNS online offline mesh network peer discovery UDP port 4045',
        path: 'System Diagnostics',
        metadata: { type: 'action', icon: '🌐', actionId: 'network_status' }
      },
      {
        id: 'action:daily-briefing',
        title: 'Generate Executive Daily Briefing',
        content: 'Morning briefing calendar events weather health score vehicle status tasks schedule overview',
        path: 'Executive Intelligence',
        metadata: { type: 'action', icon: '📋', actionId: 'daily_briefing' }
      }
    ];

    for (const act of systemActions) {
      this.searchEngine.indexDocument(act, false);
    }
  }

  /**
   * Start crawling and watching folders.
   */
  async start() {
    this.logger.info('[GhostFileWatcher] Starting real-time workspace indexer...');
    await this.crawlAll();
  }

  /**
   * Crawl all configured root directories.
   */
  async crawlAll() {
    if (this.isIndexing) return;
    this.isIndexing = true;
    let totalIndexed = 0;

    for (const root of this.watchRoots) {
      try {
        if (!fs.existsSync(root)) continue;
        const count = await this._crawlDirectory(root);
        totalIndexed += count;
        this._watchDirectory(root);
      } catch (err) {
        this.logger.error(`[GhostFileWatcher] Error crawling root ${root}:`, err.message);
        this.stats.errors++;
      }
    }

    this.isIndexing = false;
    this.stats.filesIndexed = totalIndexed;
    this.stats.lastCrawl = Date.now();
    if (this.searchEngine) this.searchEngine.saveIndex();
    this.emit('crawl-complete', this.stats);
    return this.stats;
  }

  /**
   * Recursively crawl a directory.
   */
  async _crawlDirectory(dirPath, depth = 0) {
    if (depth > 6) return 0; // limit recursion depth
    let count = 0;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          count += await this._crawlDirectory(fullPath, depth + 1);
          this._watchDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
          if (this.stats.filesIndexed >= MAX_TOTAL_FILES) break;

          const indexed = await this.indexFile(fullPath);
          if (indexed) count++;
        }
      }
    } catch {
      // Permission denied or transient read error, skip safely
    }

    return count;
  }

  /**
   * Index a single file into the hybrid search engine.
   */
  async indexFile(filePath) {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > MAX_FILE_SIZE || stat.size === 0) return false;

      const previousMtime = this.fileStats.get(filePath);
      if (previousMtime && previousMtime === stat.mtimeMs) {
        return false; // Already up-to-date
      }

      const content = await fs.promises.readFile(filePath, 'utf8');
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const docId = `file:${filePath.replace(/\\/g, '/')}`;
      const doc = {
        id: docId,
        title: filename,
        content: content.slice(0, 50000), // First 50k chars for dense/lexical search
        path: filePath,
        metadata: {
          type: 'file',
          ext,
          size: stat.size,
          mtime: stat.mtimeMs,
          directory: path.dirname(filePath),
        },
      };

      if (this.searchEngine) {
        this.searchEngine.indexDocument(doc, false);
      }

      this.fileStats.set(filePath, stat.mtimeMs);
      this.stats.totalBytesProcessed += stat.size;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Watch a directory for file creations, updates, or deletions.
   */
  _watchDirectory(dirPath) {
    if (this.watchers.has(dirPath)) return;

    try {
      const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dirPath, filename);
        this._scheduleFileChange(fullPath, eventType);
      });

      watcher.on('error', () => {
        try { watcher.close(); } catch {}
        this.watchers.delete(dirPath);
      });

      this.watchers.set(dirPath, watcher);
    } catch {
      // Ignore directory watch failure
    }
  }

  /**
   * Debounce file changes to avoid multiple rapid writes.
   */
  _scheduleFileChange(filePath, eventType) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext && !SUPPORTED_EXTENSIONS.has(ext)) return;

    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      try {
        if (!fs.existsSync(filePath)) {
          // File was deleted
          const docId = `file:${filePath.replace(/\\/g, '/')}`;
          if (this.searchEngine && this.searchEngine.documents.has(docId)) {
            this.searchEngine.documents.delete(docId);
            this.fileStats.delete(filePath);
          }
        } else {
          // File was created or updated
          await this.indexFile(filePath);
        }
      } catch {}
    }, 400);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Close all watchers and release resources.
   */
  close() {
    for (const [dir, watcher] of this.watchers.entries()) {
      try { watcher.close(); } catch {}
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  getStats() {
    return {
      filesIndexed: this.fileStats.size,
      totalBytesProcessed: this.stats.totalBytesProcessed,
      watchedDirectories: this.watchers.size,
      lastCrawl: this.stats.lastCrawl,
      roots: this.watchRoots,
    };
  }
}

module.exports = {
  GhostFileWatcher,
  SUPPORTED_EXTENSIONS,
};
