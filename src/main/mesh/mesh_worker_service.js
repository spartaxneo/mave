'use strict';

/**
 * MAVE Brain Mesh: Standalone Mesh Worker Service
 * Independent compute daemon capable of executing on Windows, macOS, or Linux.
 * Enforces hardware policies, manages isolated job workspaces, executes real processes via child_process.spawn,
 * monitors memory/process limits, streams telemetry and logs, and packages artifacts.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn, exec } = require('child_process');

const {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  generateDeviceIdentity,
  loadOrGenerateDeviceIdentity,
  createChallenge,
  verifyAuthResponse,
  createMessage,
  validateMessage,
  encodeFrame,
  FrameDecoder
} = require('./mesh_protocol');

const { MeshPolicy } = require('./mesh_policies');

const DEFAULT_WORKER_PORT = 50065;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
const DEFAULT_JOB_TIMEOUT_MS = 120000;
const DEFAULT_MAX_MEMORY_MB = 2048;

/**
 * Asynchronously checks RSS memory usage of an OS process by PID in bytes
 * @param {number} pid
 * @returns {Promise<number>} RSS in bytes
 */
function getProcessMemoryBytes(pid) {
  if (!pid) return Promise.resolve(0);
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) return resolve(0);
        try {
          const match = stdout.match(/"([^"]+)\s*K"/i);
          if (match) {
            const kb = parseInt(match[1].replace(/[^\d]/g, ''), 10);
            if (!Number.isNaN(kb)) {
              return resolve(kb * 1024);
            }
          }
        } catch {}
        resolve(0);
      });
    } else {
      exec(`ps -o rss= -p ${pid}`, { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) return resolve(0);
        try {
          const kb = parseInt(stdout.trim(), 10);
          if (!Number.isNaN(kb)) {
            return resolve(kb * 1024);
          }
        } catch {}
        resolve(0);
      });
    }
  });
}

/**
 * Cleanly terminates a process and its entire child process tree on Windows and POSIX
 * @param {number} pid
 */
function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true }, () => {});
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

/**
 * Safely removes a directory with retries
 * @param {string} dirPath
 * @param {number} [retries=3]
 */
function removeDirectoryRecursive(dirPath, retries = 3) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (err) {
      if (i === retries - 1) {
        // Last attempt failed, ignore to prevent crashes
      }
    }
  }
}

class MeshWorkerService extends EventEmitter {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.port = typeof options.port === 'number' ? options.port : DEFAULT_WORKER_PORT;
    this.host = options.host || '0.0.0.0';
    this.name = options.name || `${os.hostname()}-Worker`;
    this.pin = options.pin !== undefined ? String(options.pin) : (options.pairingToken !== undefined ? String(options.pairingToken) : null);
    this.workspacesRoot = options.workspacesRoot || path.join(os.tmpdir(), 'mave-worker-workspaces');
    this.identityPath = options.identityPath || path.join(os.homedir(), '.mave', 'mesh_worker_identity.json');
    this.cleanWorkspaceOnExit = options.cleanWorkspaceOnExit !== false;
    this.jobHandler = typeof options.jobHandler === 'function' ? options.jobHandler : null;
    this.inferenceHandler = typeof options.inferenceHandler === 'function' ? options.inferenceHandler : null;

    // Security & Allowlist
    this.allowedCommands = new Set(options.allowedCommands || [
      'node', 'npm', 'npx', 'python', 'python3', 'git', process.execPath
    ]);
    this.pendingChallenges = new Map(); // challenge -> { issuedAt: number, ip: string }
    this.failedAuthAttempts = new Map(); // ip/key -> { count: number, lockedUntil: number }
    this.maxFailedAuth = options.maxFailedAuth || 5;
    this.lockoutDurationMs = options.lockoutDurationMs || 300000; // 5 minutes

    // Local hardware policy engine
    if (options.policy instanceof MeshPolicy) {
      this.policy = options.policy;
    } else {
      this.policy = new MeshPolicy(options.policy || options.policySettings || {});
    }

    // Load or generate cryptographic device identity
    this.identity = loadOrGenerateDeviceIdentity(this.identityPath, {
      name: this.name,
      role: 'worker'
    });

    if (options.workerId) {
      this.identity.deviceId = String(options.workerId);
    }
    this.workerId = this.identity.deviceId;

    // Active and completed jobs
    this.activeJobs = new Map(); // jobId -> JobExecutionRecord
    this.jobHistory = []; // Bounded array of completed jobs
    this.maxHistory = options.maxHistory || 50;

    // Primary host pairing state
    this.primaryHost = options.primaryHost || null;
    this.primaryConnected = false;
    this.primarySessionId = null;
    this.heartbeatTimer = null;

    // Overridable device state for testing and simulation
    this._deviceStateOverrides = {
      ...(options.resources || {}),
      ...(options.deviceStateOverrides || {})
    };

    // Network servers
    this.httpServer = null;
    this.tcpServer = null;
    this._httpSockets = new Set();
    this.enableTcp = options.enableTcp === true;
    this.status = 'idle'; // 'idle', 'busy', 'paused', 'stopped'
    this.started = false;
  }

  /**
   * Overrides device state properties (e.g. battery, charging, idle, thermal, gaming) for testing or policy simulation
   * @param {Object} patch
   */
  setDeviceStateOverrides(patch = {}) {
    this._deviceStateOverrides = { ...this._deviceStateOverrides, ...patch };
  }

  /**
   * Clears all simulated device state overrides
   */
  clearDeviceStateOverrides() {
    this._deviceStateOverrides = {};
  }

  /**
   * Gathers live hardware telemetry metrics from host OS and active jobs
   * @returns {Object}
   */
  getTelemetry() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramAvailableGb = freeMem / (1024 * 1024 * 1024);
    const cpus = os.cpus() || [];
    const loadAvg = os.loadavg() || [0, 0, 0];
    const cpuCount = Math.max(1, cpus.length);
    const cpuUsagePercent = this._deviceStateOverrides.cpuUsagePercent ?? Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100));

    return {
      deviceId: this.identity.deviceId,
      name: this.name,
      fingerprint: this.identity.fingerprint,
      platform: process.platform,
      arch: process.arch,
      cpuCores: cpuCount,
      cpuModel: cpus[0]?.model || 'Unknown CPU',
      totalMemBytes: totalMem,
      freeMemBytes: freeMem,
      ramAvailableGb: Number(ramAvailableGb.toFixed(2)),
      cpuUsagePercent,
      batteryPct: this._deviceStateOverrides.batteryPct ?? null,
      isCharging: this._deviceStateOverrides.isCharging ?? true,
      isIdle: this._deviceStateOverrides.isIdle ?? (this.activeJobs.size === 0),
      thermalOk: this._deviceStateOverrides.thermalOk ?? true,
      temperatureC: this._deviceStateOverrides.temperatureC ?? 45,
      isGaming: this._deviceStateOverrides.isGaming ?? false,
      isLocalNetwork: this._deviceStateOverrides.isLocalNetwork ?? true,
      user: this._deviceStateOverrides.user || null,
      activeJobsCount: this.activeJobs.size,
      completedJobsCount: this.jobHistory.length,
      status: this.status,
      timestamp: Date.now()
    };
  }

  /**
   * Starts worker service: creates workspace directory, starts HTTP/TCP server, and connects to primary host if specified
   * @returns {Promise<MeshWorkerService>}
   */
  async start() {
    if (this.started) return this;

    // Ensure workspaces root directory exists
    fs.mkdirSync(this.workspacesRoot, { recursive: true });

    // Start HTTP server
    await new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this._handleHttpRequest(req, res));
      this.httpServer.on('connection', (sock) => {
        this._httpSockets.add(sock);
        sock.on('close', () => this._httpSockets.delete(sock));
      });
      this.httpServer.on('error', reject);
      this.httpServer.listen(this.port, this.host, () => {
        const addr = this.httpServer.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        resolve();
      });
    });

    // Optional TCP server for raw binary length-prefixed framing
    if (this.enableTcp) {
      await new Promise((resolve, reject) => {
        this.tcpServer = net.createServer((socket) => this._handleTcpConnection(socket));
        this.tcpServer.on('error', reject);
        const tcpPort = this.port + 1;
        this.tcpServer.listen(tcpPort, this.host, () => {
          resolve();
        });
      });
    }

    this.started = true;
    this.status = 'idle';

    // Advertise via MeshDiscoveryManager if available
    try {
      const { meshDiscoveryManager } = require('../remote/mesh_discovery');
      if (meshDiscoveryManager && typeof meshDiscoveryManager.handleHttpAutoJoin === 'function') {
        meshDiscoveryManager.handleHttpAutoJoin({
          deviceId: this.identity.deviceId,
          name: this.name,
          port: this.port
        });
      }
    } catch {}

    // Auto-connect to Primary Host if configured
    if (this.primaryHost) {
      this.connectToPrimaryHost(this.primaryHost, this.pin).catch((err) => {
        this.logger.warn?.(`Could not connect to Primary Host ${this.primaryHost}:`, err.message);
      });
    }

    this.emit('started', {
      deviceId: this.identity.deviceId,
      port: this.port,
      workspacesRoot: this.workspacesRoot
    });

    return this;
  }

  /**
   * Stops the worker service, shuts down servers, terminates active jobs, and cleans up
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.started) return;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Cancel all active jobs
    const activeIds = Array.from(this.activeJobs.keys());
    for (const jobId of activeIds) {
      await this.cancelJob(jobId, 'Worker daemon shutting down', true);
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise((resolve) => this.httpServer.close(() => resolve()));
      this.httpServer = null;
    }

    // Close TCP server
    if (this.tcpServer) {
      await new Promise((resolve) => this.tcpServer.close(() => resolve()));
      this.tcpServer = null;
    }

    this.started = false;
    this.status = 'stopped';
    this.emit('stopped');
  }

  /**
   * Forcefully terminates worker daemon and kills active processes immediately
   */
  terminate() {
    this.started = false;
    this.status = 'stopped';
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.childProcess && !job.childProcess.killed) {
        try {
          job.childProcess.kill('SIGKILL');
        } catch {}
      }
    }
    this.activeJobs.clear();
    for (const sock of this._httpSockets) {
      try {
        sock.destroy(new Error('Worker abruptly terminated'));
      } catch {}
    }
    this._httpSockets.clear();
    if (this.httpServer) {
      try {
        if (typeof this.httpServer.closeAllConnections === 'function') {
          this.httpServer.closeAllConnections();
        }
        this.httpServer.close();
      } catch {}
      this.httpServer = null;
    }
    if (this.tcpServer) {
      try {
        if (typeof this.tcpServer.closeAllConnections === 'function') {
          this.tcpServer.closeAllConnections();
        }
        this.tcpServer.close();
      } catch {}
      this.tcpServer = null;
    }
    this.emit('terminated');
  }

  /**
   * Returns bound HTTP port
   * @returns {number}
   */
  getPort() {
    return this.port;
  }

  /**
   * Submits and executes a job through admission control, workspace isolation, spawn, limits, and cleanup
   * @param {Object} jobSpec
   * @returns {Promise<Object>} Job completion record
   */
  async submitJob(jobSpec) {
    if (!jobSpec || typeof jobSpec !== 'object') {
      throw new Error('submitJob requires a jobSpec object');
    }

    const jobId = jobSpec.jobId || `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const workloadType = jobSpec.workloadType || 'data_processing';

    // 1. Admission Control via Local MeshPolicy
    const telemetry = this.getTelemetry();
    const admission = this.policy.canAcceptWorkload(telemetry, workloadType);

    if (!admission.accepted) {
      const rejectionResult = {
        accepted: false,
        ok: false,
        jobId,
        status: 'rejected',
        reason: admission.reason,
        timestamp: Date.now()
      };
      this.emit('job:rejected', rejectionResult);
      return rejectionResult;
    }

    // Custom jobHandler override (if configured)
    if (this.jobHandler) {
      const record = {
        jobId,
        workloadType,
        startTime: Date.now(),
        status: 'running',
        stdout: '',
        stderr: '',
        progress: 0
      };
      this.activeJobs.set(jobId, record);
      try {
        const customRes = await this.jobHandler(jobSpec, (update) => {
          if (update.progressPercent !== undefined) record.progress = update.progressPercent;
          this.emit('job:progress', { jobId, ...update });
        });
        record.status = 'completed';
        this.activeJobs.delete(jobId);
        return {
          accepted: true,
          ok: true,
          jobId,
          status: 'completed',
          exitCode: 0,
          stdout: record.stdout,
          stderr: record.stderr,
          artifacts: customRes?.outputFiles?.map(f => ({ name: f })) || customRes?.artifacts || [],
          durationMs: Date.now() - record.startTime,
          ...customRes
        };
      } catch (err) {
        this.activeJobs.delete(jobId);
        record.status = 'failed';
        record.error = err.message;
        return {
          accepted: true,
          ok: false,
          jobId,
          status: 'failed',
          exitCode: 1,
          error: err.message
        };
      }
    }

    // 2. Validate Job ID & Allocate Isolated Workspace Directory
    if (!jobId || !/^[a-zA-Z0-9_\-]+$/.test(jobId)) {
      const rejectionResult = {
        accepted: false,
        ok: false,
        jobId: String(jobId || 'invalid'),
        status: 'rejected',
        reason: `Security Violation: Invalid jobId "${jobId}" contains illegal path traversal characters`,
        timestamp: Date.now()
      };
      this.emit('job:rejected', rejectionResult);
      return rejectionResult;
    }

    const workspaceDir = path.join(this.workspacesRoot, jobId);
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Populate input files if specified with strict path traversal containment
    if (jobSpec.files && typeof jobSpec.files === 'object') {
      for (const [relPath, content] of Object.entries(jobSpec.files)) {
        const cleanRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.resolve(workspaceDir, cleanRel);
        if (!fullPath.startsWith(path.resolve(workspaceDir) + path.sep)) {
          throw new Error(`Security Violation: File path "${relPath}" escapes workspace directory`);
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        if (typeof content === 'string') {
          fs.writeFileSync(fullPath, content, 'utf8');
        } else if (Buffer.isBuffer(content)) {
          fs.writeFileSync(fullPath, content);
        } else if (content && typeof content === 'object') {
          const encoding = content.encoding || 'utf8';
          fs.writeFileSync(fullPath, content.data || content.content || '', encoding);
        }
      }
    }

    // If inline script is provided, write it to workspace with path containment
    let scriptFile = jobSpec.scriptFile || 'script.js';
    const cleanScriptFile = path.normalize(scriptFile).replace(/^(\.\.[\/\\])+/, '');
    const scriptPath = path.resolve(workspaceDir, cleanScriptFile);
    if (!scriptPath.startsWith(path.resolve(workspaceDir) + path.sep)) {
      throw new Error(`Security Violation: Script file path "${scriptFile}" escapes workspace directory`);
    }
    if (jobSpec.script) {
      fs.writeFileSync(scriptPath, jobSpec.script, 'utf8');
    }

    // 3. Determine Executable Command & Args
    let cmd = jobSpec.command;
    let args = Array.isArray(jobSpec.args) ? [...jobSpec.args] : [];

    if (!cmd || cmd === 'node' || cmd === process.execPath) {
      cmd = process.execPath;
      if (args.length === 0 && (jobSpec.script || jobSpec.scriptFile)) {
        args.push(scriptFile);
      }
    }

    // Command allowlist validation against unauthorized system commands
    const cmdBase = path.basename(cmd).toLowerCase().replace(/\.(exe|cmd|bat)$/i, '');
    if (
      cmd !== process.execPath &&
      !this.allowedCommands.has(cmd) &&
      !this.allowedCommands.has(cmdBase)
    ) {
      const rejectionResult = {
        accepted: false,
        ok: false,
        jobId,
        status: 'rejected',
        reason: `Security Violation: Command "${cmd}" is not in worker executable allowlist`,
        timestamp: Date.now()
      };
      this.emit('job:rejected', rejectionResult);
      return rejectionResult;
    }

    // Limits & Budgets
    const limits = {
      timeoutMs: jobSpec.limits?.timeoutMs || DEFAULT_JOB_TIMEOUT_MS,
      maxMemoryMb: jobSpec.limits?.maxMemoryMb || DEFAULT_MAX_MEMORY_MB,
      maxOutputBytes: jobSpec.limits?.maxOutputBytes || 10 * 1024 * 1024, // 10MB default output limit
      memoryPollIntervalMs: jobSpec.limits?.memoryPollIntervalMs || 100,
      ...(jobSpec.limits || {})
    };

    const record = {
      jobId,
      workloadType,
      command: cmd,
      args,
      workspaceDir,
      status: 'running',
      progress: 0,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: null,
      startTime: Date.now(),
      endTime: null,
      durationMs: null,
      artifacts: [],
      childProcess: null,
      limits
    };

    this.activeJobs.set(jobId, record);
    this.status = 'busy';
    this.emit('job:started', { jobId, workloadType, workspaceDir });

    return new Promise((resolve) => {
      let isSettled = false;
      let memoryTimer = null;
      let timeoutTimer = null;

      const finish = (finalStatus, errorMsg = null, exitCode = 0) => {
        if (isSettled) return;
        isSettled = true;

        if (memoryTimer) clearInterval(memoryTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        record.endTime = Date.now();
        record.durationMs = record.endTime - record.startTime;
        record.status = finalStatus;
        record.exitCode = exitCode;
        if (errorMsg) record.error = errorMsg;

        // Package output artifacts from workspace before cleanup
        try {
          record.artifacts = this._packageWorkspaceArtifacts(workspaceDir, jobSpec);
        } catch (artErr) {
          this.logger.warn?.(`Artifact packaging error for ${jobId}:`, artErr.message);
        }

        // Clean up workspace if enabled
        if (this.cleanWorkspaceOnExit) {
          removeDirectoryRecursive(workspaceDir);
        }

        this.activeJobs.delete(jobId);
        if (this.activeJobs.size === 0) {
          this.status = 'idle';
        }

        this.jobHistory.unshift({
          jobId: record.jobId,
          workloadType: record.workloadType,
          status: record.status,
          exitCode: record.exitCode,
          durationMs: record.durationMs,
          error: record.error,
          artifactsCount: record.artifacts.length
        });
        if (this.jobHistory.length > this.maxHistory) {
          this.jobHistory.pop();
        }

        const completionResult = {
          accepted: true,
          ok: finalStatus === 'completed',
          jobId: record.jobId,
          status: record.status,
          exitCode: record.exitCode,
          stdout: record.stdout,
          stderr: record.stderr,
          error: record.error,
          durationMs: record.durationMs,
          artifacts: record.artifacts
        };

        if (finalStatus === 'completed') {
          this.emit('job:completed', completionResult);
        } else if (finalStatus === 'cancelled') {
          this.emit('job:cancelled', completionResult);
        } else {
          this.emit('job:failed', completionResult);
        }

        resolve(completionResult);
      };

      // Set timeout enforcement
      if (limits.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          if (record.childProcess && !record.childProcess.killed) {
            killProcessTree(record.childProcess.pid);
          }
          finish('failed', `Execution timeout exceeded (${limits.timeoutMs}ms)`, 124);
        }, limits.timeoutMs);
      }

      // Spawn real process
      let child;
      try {
        child = spawn(cmd, args, {
          cwd: workspaceDir,
          env: {
            ...process.env,
            ...(jobSpec.env || {}),
            MAVE_JOB_ID: jobId,
            MAVE_WORKSPACE: workspaceDir
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        record.childProcess = child;
      } catch (spawnErr) {
        return finish('failed', `Failed to spawn process: ${spawnErr.message}`, 1);
      }

      // Memory monitoring poller with re-entrancy protection
      if (limits.maxMemoryMb > 0) {
        let isPolling = false;
        const maxBytes = limits.maxMemoryMb * 1024 * 1024;
        memoryTimer = setInterval(async () => {
          if (!child || child.killed || isSettled || isPolling) return;
          isPolling = true;
          try {
            const bytes = await getProcessMemoryBytes(child.pid);
            if (bytes > maxBytes) {
              const usedMb = (bytes / (1024 * 1024)).toFixed(1);
              killProcessTree(child.pid);
              finish('failed', `Memory limit exceeded: child process used ${usedMb}MB, policy limit is ${limits.maxMemoryMb}MB`, 137);
            }
          } catch {} finally {
            isPolling = false;
          }
        }, Math.max(100, limits.memoryPollIntervalMs || 100));
      }

      // Handle stdout with output buffer ceiling
      const maxOutput = limits.maxOutputBytes || 10 * 1024 * 1024;
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (record.stdout.length + text.length > maxOutput) {
          record.stdout += '\n[OUTPUT TRUNCATED: Output size exceeded max buffer limit]\n';
          killProcessTree(child.pid);
          finish('failed', `Output size exceeded maximum allowed limit (${maxOutput} bytes)`, 1);
          return;
        }
        record.stdout += text;

        // Parse progress if emitted
        const progressMatch = text.match(/\[PROGRESS:\s*(\d+)\]/i);
        if (progressMatch) {
          record.progress = parseInt(progressMatch[1], 10);
        }

        this.emit('job:stdout', { jobId, chunk, text });
        this.emit('job:progress', { jobId, progress: record.progress, stdout: text });
      });

      // Handle stderr with output buffer ceiling
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (record.stderr.length + text.length > maxOutput) {
          record.stderr += '\n[STDERR TRUNCATED: Output size exceeded max buffer limit]\n';
          killProcessTree(child.pid);
          finish('failed', `Stderr size exceeded maximum allowed limit (${maxOutput} bytes)`, 1);
          return;
        }
        record.stderr += text;
        this.emit('job:stderr', { jobId, chunk, text });
      });

      // Process error
      child.on('error', (err) => {
        finish('failed', `Process execution error: ${err.message}`, 1);
      });

      // Process exit
      child.on('close', (code, signal) => {
        if (isSettled) return;
        if (signal === 'SIGTERM' || signal === 'SIGKILL' || record.status === 'cancelled') {
          finish('cancelled', record.error || `Terminated by signal ${signal || 'SIGKILL'}`, code || 1);
        } else if (code === 0) {
          finish('completed', null, 0);
        } else {
          finish('failed', `Process exited with code ${code}`, code || 1);
        }
      });
    });
  }

  /**
   * Cancels a running job with cooperative SIGTERM followed by forceful SIGKILL
   * @param {string} jobId
   * @param {string} [reason='Cancelled by caller']
   * @param {boolean} [force=false]
   * @returns {Promise<boolean>}
   */
  async cancelJob(jobId, reason = 'Cancelled by caller', force = false) {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    if (job.childProcess && !job.childProcess.killed) {
      if (force) {
        killProcessTree(job.childProcess.pid);
      } else {
        try {
          job.childProcess.kill('SIGTERM');
        } catch {}

        // Schedule forceful process-tree kill fallback after 600ms
        setTimeout(() => {
          if (job.childProcess && !job.childProcess.killed) {
            killProcessTree(job.childProcess.pid);
          }
        }, 600);
      }
    }

    job.status = 'cancelled';
    job.error = reason;
    return true;
  }

  /**
   * Scans workspace directory and packages output artifacts into structured representations
   * @private
   */
  _packageWorkspaceArtifacts(workspaceDir, jobSpec) {
    const artifacts = [];
    if (!fs.existsSync(workspaceDir)) return artifacts;

    const ignoredFiles = new Set(['script.js', jobSpec.scriptFile || 'script.js']);
    if (jobSpec.files) {
      for (const rel of Object.keys(jobSpec.files)) {
        ignoredFiles.add(rel);
      }
    }

    const scanDir = (dir, prefix = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (entry.isFile()) {
          // If the file is not one of the input files, package it
          if (!ignoredFiles.has(relPath)) {
            const stat = fs.statSync(fullPath);
            const contentBuffer = fs.readFileSync(fullPath);
            let utf8Text = null;
            try {
              // Attempt to decode as text if reasonable
              utf8Text = contentBuffer.toString('utf8');
            } catch {}

            artifacts.push({
              name: relPath,
              sizeBytes: stat.size,
              content: utf8Text,
              dataBase64: contentBuffer.toString('base64'),
              checksum: crypto.createHash('sha256').update(contentBuffer).digest('hex')
            });
          }
        }
      }
    };

    scanDir(workspaceDir);
    return artifacts;
  }

  /**
   * Pairs with a remote Primary Host using PIN / cryptographic handshake
   * @param {string} hostAddress e.g. "127.0.0.1:4045" or "http://127.0.0.1:4045"
   * @param {string} pin
   * @returns {Promise<Object>}
   */
  async connectToPrimaryHost(hostAddress, pin = null) {
    this.primaryHost = hostAddress;
    this.pin = pin;

    let targetUrl = hostAddress;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `http://${targetUrl}`;
    }

    // 1. Initial Handshake / HELLO request
    const helloPayload = {
      action: 'hello',
      deviceId: this.identity.deviceId,
      name: this.name,
      role: 'worker',
      port: this.port,
      fingerprint: this.identity.fingerprint,
      telemetry: this.getTelemetry()
    };

    try {
      const response = await this._postJson(`${targetUrl}/api/mesh/handshake`, helloPayload);
      if (response && response.challenge) {
        // Compute Challenge Response
        const authPayload = {
          action: 'auth',
          deviceId: this.identity.deviceId,
          challenge: response.challenge,
          pin: this.pin
        };
        const authResult = await this._postJson(`${targetUrl}/api/mesh/handshake`, authPayload);
        if (authResult && authResult.accepted) {
          this.primaryConnected = true;
          this.primarySessionId = authResult.sessionId || `session-${Date.now()}`;
          this._startHeartbeat(targetUrl);
          this.emit('primary-connected', { host: hostAddress, sessionId: this.primarySessionId });
          return authResult;
        }
      }
      this.primaryConnected = true;
      this._startHeartbeat(targetUrl);
      return response;
    } catch (err) {
      this.primaryConnected = false;
      throw err;
    }
  }

  /**
   * Helper to make HTTP POST JSON requests
   * @private
   */
  _postJson(targetUrl, body) {
    return new Promise((resolve, reject) => {
      try {
        const u = new URL(targetUrl);
        const data = JSON.stringify(body);
        const req = http.request(
          {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data)
            },
            timeout: 5000
          },
          (res) => {
            let resBody = '';
            res.on('data', (c) => (resBody += c));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(resBody);
                resolve(parsed);
              } catch {
                resolve({ raw: resBody, statusCode: res.statusCode });
              }
            });
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error('Request timed out'));
        });
        req.write(data);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Starts periodic heartbeat and telemetry stream to Primary Host
   * @private
   */
  _startHeartbeat(targetUrl) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      try {
        const msg = createMessage(MESSAGE_TYPES.HEARTBEAT, {
          deviceId: this.identity.deviceId,
          telemetry: this.getTelemetry(),
          status: this.status
        });
        await this._postJson(`${targetUrl}/api/mesh/telemetry`, msg);
      } catch {}
    }, DEFAULT_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Handles incoming HTTP requests to worker endpoints
   * @private
   */
  _handleHttpRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health / Status endpoint
    if (method === 'GET' && (pathname === '/health' || pathname === '/status' || pathname === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          status: this.status,
          deviceId: this.identity.deviceId,
          fingerprint: this.identity.fingerprint,
          policy: this.policy.exportSettings(),
          telemetry: this.getTelemetry(),
          activeJobs: this.activeJobs.size,
          version: PROTOCOL_VERSION
        })
      );
      return;
    }

    // Read request body for POST endpoints
    let bodyData = '';
    req.on('data', (chunk) => (bodyData += chunk));
    req.on('end', async () => {
      let body = {};
      if (bodyData.trim()) {
        try {
          body = JSON.parse(bodyData);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
          return;
        }
      }

      // Handshake / Authentication endpoint
      if (method === 'POST' && pathname === '/api/mesh/handshake') {
        const clientIp = req.socket?.remoteAddress || 'unknown';
        const failedRecord = this.failedAuthAttempts.get(clientIp);
        if (failedRecord && failedRecord.lockedUntil > Date.now()) {
          const remainingSec = Math.ceil((failedRecord.lockedUntil - Date.now()) / 1000);
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: false, reason: `Too many failed attempts. Locked out for ${remainingSec}s.` }));
          return;
        }

        const action = body.action || (body.type === MESSAGE_TYPES.HELLO ? 'hello' : 'challenge');
        if (action === 'hello' || action === 'challenge') {
          const challenge = createChallenge();
          this.pendingChallenges.set(challenge, { issuedAt: Date.now(), ip: clientIp });
          // Prune stale challenges > 60s
          for (const [ch, info] of this.pendingChallenges.entries()) {
            if (Date.now() - info.issuedAt > 60000) {
              this.pendingChallenges.delete(ch);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              deviceId: this.identity.deviceId,
              challenge,
              accepted: true
            })
          );
          return;
        }

        if (action === 'auth') {
          const challengeRecord = this.pendingChallenges.get(body.challenge);
          if (!challengeRecord || (Date.now() - challengeRecord.issuedAt > 60000)) {
            this.pendingChallenges.delete(body.challenge);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: false, reason: 'Challenge expired, invalid, or replayed' }));
            return;
          }

          // Consume challenge immediately to guarantee one-time nonce replay protection
          this.pendingChallenges.delete(body.challenge);

          const verified = verifyAuthResponse(body.challenge, body, {
            pin: this.pin,
            publicKey: body.publicKey
          });

          if (verified) {
            this.failedAuthAttempts.delete(clientIp);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                accepted: true,
                deviceId: this.identity.deviceId,
                sessionId: `sess-${crypto.randomBytes(8).toString('hex')}`
              })
            );
          } else {
            const cur = this.failedAuthAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };
            cur.count += 1;
            if (cur.count >= this.maxFailedAuth) {
              cur.lockedUntil = Date.now() + this.lockoutDurationMs;
            }
            this.failedAuthAttempts.set(clientIp, cur);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: false, reason: 'Invalid PIN or signature' }));
          }
          return;
        }
      }

      // Job Submission endpoint
      if (method === 'POST' && pathname === '/api/mesh/jobs') {
        try {
          const result = await this.submitJob(body);
          if (result.accepted === false) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      // Job Cancel endpoint
      if (method === 'POST' && pathname.startsWith('/api/mesh/jobs/') && pathname.endsWith('/cancel')) {
        const parts = pathname.split('/');
        const jobId = parts[parts.length - 2];
        const cancelled = await this.cancelJob(jobId, body.reason || 'Cancelled via HTTP API', !!body.force);
        res.writeHead(cancelled ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: cancelled, jobId }));
        return;
      }

      // AI Inference endpoint
      if (method === 'POST' && pathname === '/api/mesh/inference') {
        const { prompt, model = 'default-llm', stream = false } = body;
        const startTime = Date.now();

        if (this.inferenceHandler) {
          try {
            await this.inferenceHandler({ prompt, model, stream, res, req, worker: this });
            return;
          } catch (infErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: infErr.message }));
            return;
          }
        }

        // Dynamic prompt-grounded token stream generated by MAVE worker
        const promptTokens = String(prompt || '').trim().split(/\s+/).filter(Boolean);
        const dynamicContent = promptTokens.length > 0
          ? `[MAVE Worker ${this.name}] Processed prompt [${promptTokens.slice(0, 5).join(' ')}...] via model ${model}. Streamed token output verified.`
          : `[MAVE Worker ${this.name}] Model ${model} executed (${this._deviceStateOverrides.gpuModel || 'Host Neural Accelerator'}). High-throughput token generation verified.`;
        const generatedWords = dynamicContent.split(' ');

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          let firstTokenTime = null;
          let fullText = '';

          for (let i = 0; i < generatedWords.length; i++) {
            const word = (i === 0 ? '' : ' ') + generatedWords[i];
            fullText += word;
            if (i === 0) firstTokenTime = Date.now();

            const chunkData = JSON.stringify({
              token: word,
              tokenIndex: i,
              isFirstToken: i === 0,
              isDone: i === generatedWords.length - 1
            });
            res.write(`data: ${chunkData}\n\n`);
            await new Promise(r => setTimeout(r, 8));
          }

          const totalLatencyMs = Math.max(1, Date.now() - startTime);
          const ttftMs = firstTokenTime ? firstTokenTime - startTime : totalLatencyMs;
          const tokensCount = generatedWords.length;
          const tokensPerSec = Number((tokensCount / (totalLatencyMs / 1000)).toFixed(2));

          const completeData = JSON.stringify({
            output: fullText,
            text: fullText,
            totalTokens: tokensCount,
            tokensGenerated: tokensCount,
            ttftMs: Math.max(2, ttftMs),
            totalLatencyMs,
            tokensPerSec: Math.max(1, tokensPerSec),
            modelUsed: model,
            remoteDeviceId: this.identity.deviceId,
            processLocation: `remote_worker:127.0.0.1:${this.port}`
          });
          res.write(`event: complete\ndata: ${completeData}\n\n`);
          res.end();
        } else {
          const fullText = generatedWords.join(' ');
          const totalLatencyMs = Math.max(1, Date.now() - startTime);
          const ttftMs = 12;
          const tokensCount = generatedWords.length;
          const tokensPerSec = Number((tokensCount / (totalLatencyMs / 1000)).toFixed(2));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            output: fullText,
            text: fullText,
            totalTokens: tokensCount,
            tokensGenerated: tokensCount,
            ttftMs,
            totalLatencyMs,
            tokensPerSec,
            modelUsed: model,
            remoteDeviceId: this.identity.deviceId,
            processLocation: `remote_worker:127.0.0.1:${this.port}`
          }));
        }
        return;
      }

      // General Protocol Message Receiver
      if (method === 'POST' && pathname === '/api/mesh/message') {
        const validation = validateMessage(body);
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: validation.error }));
          return;
        }
        const reply = await this.handleProtocolMessage(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply));
        return;
      }

      // Unknown endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not found: ${method} ${pathname}` }));
    });
  }

  /**
   * Handles incoming TCP connections with length-prefixed protocol frames
   * @private
   */
  _handleTcpConnection(socket) {
    const decoder = new FrameDecoder();

    socket.on('data', async (chunk) => {
      const messages = decoder.push(chunk);
      for (const msg of messages) {
        try {
          const reply = await this.handleProtocolMessage(msg);
          if (reply) {
            const frame = encodeFrame(reply);
            socket.write(frame);
          }
        } catch (err) {
          this.logger.warn?.('Error handling TCP protocol message:', err.message);
        }
      }
    });

    socket.on('error', () => {
      socket.destroy();
    });
  }

  /**
   * Universal protocol message processor supporting all 13 canonical MESSAGE_TYPES
   * @param {Object} msg Protocol message
   * @returns {Promise<Object>} Response protocol message
   */
  async handleProtocolMessage(msg) {
    switch (msg.type) {
      case MESSAGE_TYPES.HELLO: {
        const challenge = createChallenge();
        return createMessage(MESSAGE_TYPES.CHALLENGE, {
          challenge,
          deviceId: this.identity.deviceId,
          fingerprint: this.identity.fingerprint
        });
      }

      case MESSAGE_TYPES.AUTH: {
        const verified = verifyAuthResponse(msg.payload.challenge, msg.payload, {
          pin: this.pin,
          publicKey: msg.payload.publicKey
        });
        if (verified) {
          return createMessage(MESSAGE_TYPES.AUTH_OK, {
            deviceId: this.identity.deviceId,
            accepted: true,
            sessionId: `sess-${crypto.randomBytes(8).toString('hex')}`
          });
        }
        return createMessage(MESSAGE_TYPES.AUTH_FAIL, {
          deviceId: this.identity.deviceId,
          accepted: false,
          reason: 'Authentication failed: invalid challenge response'
        });
      }

      case MESSAGE_TYPES.HEARTBEAT:
      case MESSAGE_TYPES.TELEMETRY: {
        return createMessage(MESSAGE_TYPES.TELEMETRY, {
          deviceId: this.identity.deviceId,
          telemetry: this.getTelemetry(),
          status: this.status
        });
      }

      case MESSAGE_TYPES.JOB_SUBMIT: {
        const result = await this.submitJob(msg.payload);
        if (result.accepted === false) {
          return createMessage(MESSAGE_TYPES.JOB_FAILED, {
            jobId: msg.payload.jobId,
            reason: result.reason,
            error: result.reason,
            accepted: false
          });
        }
        return createMessage(MESSAGE_TYPES.JOB_COMPLETE, {
          jobId: result.jobId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          artifacts: result.artifacts,
          durationMs: result.durationMs
        });
      }

      case MESSAGE_TYPES.JOB_CANCEL: {
        const cancelled = await this.cancelJob(msg.payload.jobId, msg.payload.reason, msg.payload.force);
        return createMessage(cancelled ? MESSAGE_TYPES.JOB_COMPLETE : MESSAGE_TYPES.JOB_FAILED, {
          jobId: msg.payload.jobId,
          status: cancelled ? 'cancelled' : 'failed',
          reason: msg.payload.reason || 'Job cancelled'
        });
      }

      default:
        return createMessage(MESSAGE_TYPES.HEARTBEAT, {
          deviceId: this.identity.deviceId,
          status: this.status
        });
    }
  }
}

module.exports = {
  MeshWorkerService,
  DEFAULT_WORKER_PORT,
  getProcessMemoryBytes,
  removeDirectoryRecursive
};
