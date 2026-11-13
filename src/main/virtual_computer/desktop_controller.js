'use strict';

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

class VirtualDesktopController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userDataPath = options.userDataPath || (process.env.APPDATA ? path.join(process.env.APPDATA, 'mave') : path.join(os.homedir(), '.mave'));
    this.guestRoot = options.guestRoot || path.join(this.userDataPath, 'guest_fs');
    this.workspaceDir = path.join(this.guestRoot, 'workspace');
    this.downloadsDir = path.join(this.guestRoot, 'downloads');
    this.stagingDir = path.join(this.guestRoot, 'staging');
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000;
    this.logger = options.logger || console;

    this.activeProcesses = new Map();
    this.auditLogs = [];

    this._ensureDirectories();
  }

  _ensureDirectories() {
    try {
      if (!fs.existsSync(this.workspaceDir)) fs.mkdirSync(this.workspaceDir, { recursive: true });
      if (!fs.existsSync(this.downloadsDir)) fs.mkdirSync(this.downloadsDir, { recursive: true });
      if (!fs.existsSync(this.stagingDir)) fs.mkdirSync(this.stagingDir, { recursive: true });
    } catch (err) {
      this.logger.warn?.('VirtualDesktopController: dir creation warning:', err.message);
    }
  }

  /**
   * Resolve and sanitize a relative path strictly inside the guest root.
   * Throws if path attempts directory traversal outside guestRoot.
   */
  resolveGuestPath(relativePath = '') {
    const cleanRel = String(relativePath || '').replace(/^[\\/]+/, '');
    const resolved = path.resolve(this.guestRoot, cleanRel);
    if (!resolved.toLowerCase().startsWith(path.resolve(this.guestRoot).toLowerCase())) {
      throw new Error(`Security Violation: Path "${relativePath}" escapes the isolated guest filesystem.`);
    }
    return resolved;
  }

  /**
   * Execute a command safely inside the isolated guest workspace.
   */
  async runTerminalCommand(command, options = {}) {
    const cwd = options.cwd ? this.resolveGuestPath(options.cwd) : this.workspaceDir;
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const procId = `gproc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.emit('command-started', { procId, command, cwd });
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          MAVE_GUEST_ISOLATED: '1',
          MAVE_WORKSPACE_DIR: cwd,
          TEMP: path.join(this.guestRoot, 'tmp'),
          TMP: path.join(this.guestRoot, 'tmp'),
        },
        windowsHide: true,
      }, (err, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        this.activeProcesses.delete(procId);

        const result = {
          procId,
          command,
          exitCode: err ? (err.code || 1) : 0,
          stdout: stdout || '',
          stderr: stderr || (err ? err.message : ''),
          durationMs,
          timedOut: err && err.killed === true,
        };

        this._recordAudit('terminal_command', { command, cwd, exitCode: result.exitCode, durationMs });
        this.emit('command-completed', result);
        resolve(result);
      });

      this.activeProcesses.set(procId, child);
    });
  }

  /**
   * Read file contents from guest filesystem.
   */
  async readGuestFile(relativePath) {
    const fullPath = this.resolveGuestPath(relativePath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found in guest filesystem: ${relativePath}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    const stat = fs.statSync(fullPath);
    return { path: relativePath, sizeBytes: stat.size, content };
  }

  /**
   * Write file contents into guest filesystem.
   */
  async writeGuestFile(relativePath, content) {
    const fullPath = this.resolveGuestPath(relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    const stat = fs.statSync(fullPath);
    this._recordAudit('file_write', { path: relativePath, sizeBytes: stat.size });
    return { ok: true, path: relativePath, sizeBytes: stat.size };
  }

  /**
   * List files in guest directory.
   */
  async listGuestFiles(relativePath = '') {
    const fullPath = this.resolveGuestPath(relativePath);
    if (!fs.existsSync(fullPath)) return [];
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries.map((e) => {
      const p = path.join(fullPath, e.name);
      let size = 0;
      try { size = fs.statSync(p).size; } catch {}
      return {
        name: e.name,
        isDirectory: e.isDirectory(),
        sizeBytes: size,
        relativePath: path.relative(this.guestRoot, p),
      };
    });
  }

  /**
   * Export a completed file from the guest to the host filesystem.
   * Requires explicit destination path.
   */
  async exportFileToHost(guestRelativePath, hostDestinationPath) {
    const guestSrc = this.resolveGuestPath(guestRelativePath);
    if (!fs.existsSync(guestSrc)) {
      throw new Error(`Guest export source not found: ${guestRelativePath}`);
    }

    const hostDest = path.resolve(hostDestinationPath);
    fs.mkdirSync(path.dirname(hostDest), { recursive: true });
    fs.copyFileSync(guestSrc, hostDest);

    const stat = fs.statSync(hostDest);
    this._recordAudit('file_export', { guestSrc: guestRelativePath, hostDest, sizeBytes: stat.size });
    this.emit('file-exported', { from: guestRelativePath, to: hostDest, sizeBytes: stat.size });

    return {
      ok: true,
      fromGuest: guestRelativePath,
      toHost: hostDest,
      sizeBytes: stat.size,
    };
  }

  _recordAudit(action, details) {
    this.auditLogs.push({ action, details, timestamp: Date.now() });
    if (this.auditLogs.length > 200) this.auditLogs.shift();
  }

  getAuditLogs() {
    return [...this.auditLogs];
  }
}

module.exports = { VirtualDesktopController };
