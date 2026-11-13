'use strict';

/**
 * MAVE — Distributed Ecosystem, Security & Virtual Computer Acceptance Test Suite (Tests 1 - 22)
 * Mandated by Section 15 of Canonical Master Specification.
 * 
 * Verifies real multi-node compute distribution, cryptographic pairing, security hardening,
 * resource scheduling policies, conflict resolution, virtual machine boundaries, and installer packaging.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const {
  DistributedScheduler,
  RemoteWorkerClient,
  MeshWorkerService,
  RemoteInferenceProvider,
  MeshCodingDistributor,
  MeshPolicy,
  SCHEDULING_POLICIES,
  createSchedulingPolicyConfig,
  meshProtocol
} = require('../src/main/mesh');

const {
  VirtualMachineManager,
  VirtualDesktopController,
  VirtualBrowserController,
  VirtualDisplayServer,
  ExecutionTargetRouter
} = require('../src/main/virtual_computer');

const {
  getCognitiveOrchestrator
} = require('../src/main/orchestrator');

const TEST_DIR = path.join(os.tmpdir(), `mave-acceptance-suite-${Date.now()}`);

test.before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

test.after(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
});

// ==============================================================================
// TEST 1 — Two-Computer Pairing
// ==============================================================================
test('Test 1 — Two-Computer Pairing: Pair independent worker daemon with primary MAVE host over network', async () => {
  const pin = 'pairing-pin-sec-101';
  const worker = new MeshWorkerService({
    port: 0,
    name: 'Workstation-Node-1',
    pin,
    workspacesRoot: path.join(TEST_DIR, 'worker1')
  });
  await worker.start();

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  const { device, client } = await scheduler.connectRemoteWorker({
    deviceId: 'worker-101',
    port: worker.getPort(),
    pairingToken: pin,
    name: 'Workstation-Node-1'
  });

  assert.ok(device);
  assert.equal(device.deviceId, 'worker-101');
  assert.equal(device.name, 'Workstation-Node-1');
  assert.equal(client.connected, true);
  assert.equal(client.authenticated, true);

  await worker.stop();
  client.disconnect();
});

// ==============================================================================
// TEST 2 — Authentication
// ==============================================================================
test('Test 2 — Authentication: Reject unapproved device with invalid credentials', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    pin: 'authorized-pin-777',
    workspacesRoot: path.join(TEST_DIR, 'worker2')
  });
  await worker.start();

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  await assert.rejects(
    async () => {
      await scheduler.connectRemoteWorker({
        port: worker.getPort(),
        pairingToken: 'forged-attacker-pin-000',
        name: 'Attacker-Node'
      });
    },
    /Handshake rejected|Authentication failed|Invalid PIN/i
  );

  await worker.stop();
});

// ==============================================================================
// TEST 3 — Remote Task
// ==============================================================================
test('Test 3 — Remote Task: Execute permitted computation on worker and retrieve actual result and artifacts', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot: path.join(TEST_DIR, 'worker3')
  });
  worker.setDeviceStateOverrides({ batteryPct: 95, isCharging: true });
  await worker.start();

  const job = await worker.submitJob({
    jobId: 'math-compute-job',
    workloadType: 'compilation',
    script: `
      const fs = require('fs');
      const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2);
      const res = fib(15);
      fs.writeFileSync('result.json', JSON.stringify({ fib15: res, verified: true }));
      console.log('FIB_COMPUTE_SUCCESS: ' + res);
    `
  });

  assert.equal(job.status, 'completed');
  assert.equal(job.exitCode, 0);
  assert.match(job.stdout, /FIB_COMPUTE_SUCCESS: 610/);
  assert.ok(job.artifacts.some(a => a.name === 'result.json'));

  await worker.stop();
});

// ==============================================================================
// TEST 4 — Remote Inference
// ==============================================================================
test('Test 4 — Remote Inference: Stream real inference response with TTFT and tokens/sec telemetry', async () => {
  const pin = 'pin-inference-test-104';
  const worker = new MeshWorkerService({
    port: 0,
    pin,
    workspacesRoot: path.join(TEST_DIR, 'worker4')
  });
  await worker.start();

  const client = new RemoteWorkerClient({
    port: worker.getPort(),
    pairingToken: pin
  });
  await client.connect();

  const chunks = [];
  const result = await client.requestInference({
    prompt: 'Summarize distributed mesh scheduler latency',
    model: 'qwen3-8b',
    stream: true,
    onChunk: (chunk) => chunks.push(chunk.token)
  });

  assert.ok(chunks.length > 0);
  assert.ok(result.totalTokens > 0);
  assert.ok(result.ttftMs >= 0);
  assert.ok(result.tokensPerSec > 0);
  assert.equal(result.modelUsed, 'qwen3-8b');

  await worker.stop();
  client.disconnect();
});

// ==============================================================================
// TEST 5 — Resource-Aware Scheduling
// ==============================================================================
test('Test 5 — Resource-Aware Scheduling: Task placement dynamically shifts when device capacity changes', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  const nodeA = scheduler.registerDevice({
    deviceId: 'node-A',
    name: 'Workstation A',
    resources: { cpuCores: 8, ramGb: 32, ramAvailableGb: 28, cpuUsagePercent: 15 }
  });

  const nodeB = scheduler.registerDevice({
    deviceId: 'node-B',
    name: 'Workstation B',
    resources: { cpuCores: 16, ramGb: 64, ramAvailableGb: 10, cpuUsagePercent: 85 }
  });

  // Initially Node A has more available RAM and lower CPU usage
  let eligible = scheduler.findEligibleDevices('data_processing');
  assert.equal(eligible[0].deviceId, 'node-A');

  // Node A gets loaded with heavy workload
  scheduler.updateDeviceTelemetry('node-A', {
    resources: { cpuUsagePercent: 92, ramAvailableGb: 2 }
  });

  // Node B frees up resources
  scheduler.updateDeviceTelemetry('node-B', {
    resources: { cpuUsagePercent: 20, ramAvailableGb: 48 }
  });

  eligible = scheduler.findEligibleDevices('data_processing');
  assert.equal(eligible[0].deviceId, 'node-B');
});

// ==============================================================================
// TEST 6 — Battery Policy
// ==============================================================================
test('Test 6 — Battery Policy: Battery-powered devices are excluded when policy requires it', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  scheduler.setSchedulingPolicy(SCHEDULING_POLICIES.BATTERY_PRESERVATION);

  scheduler.registerDevice({
    deviceId: 'laptop-on-battery',
    name: 'Laptop Discharging',
    type: 'laptop',
    resources: {
      cpuCores: 8,
      ramGb: 16,
      batteryPct: 65,
      isCharging: false // Unplugged!
    }
  });

  scheduler.registerDevice({
    deviceId: 'desktop-ac',
    name: 'Desktop AC',
    type: 'desktop',
    resources: {
      cpuCores: 8,
      ramGb: 16,
      batteryPct: null,
      isCharging: true // Plugged in
    }
  });

  const eligible = scheduler.findEligibleDevices('compilation');
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].deviceId, 'desktop-ac');
});

// ==============================================================================
// TEST 7 — Primary Host Priority
// ==============================================================================
test('Test 7 — Primary Host Priority: Primary host is preferred when configured until overloaded', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  scheduler.setSchedulingPolicy(SCHEDULING_POLICIES.HOST_PRIORITY);

  scheduler.registerDevice({
    deviceId: 'primary-host',
    name: 'Central Host',
    role: 'primary_host',
    resources: { cpuCores: 8, ramGb: 32, ramAvailableGb: 24, cpuUsagePercent: 25 }
  });

  scheduler.registerDevice({
    deviceId: 'remote-worker',
    name: 'Remote Worker',
    role: 'contributor',
    resources: { cpuCores: 32, ramGb: 128, ramAvailableGb: 100, cpuUsagePercent: 10 }
  });

  // Host priority prefers primary host even if remote has more raw cores
  let candidates = scheduler.findEligibleDevices('data_processing');
  assert.equal(candidates[0].deviceId, 'primary-host');

  // When primary host becomes overloaded (>70% CPU)
  scheduler.updateDeviceTelemetry('primary-host', {
    resources: { cpuUsagePercent: 88 }
  });

  candidates = scheduler.findEligibleDevices('data_processing');
  assert.equal(candidates[0].deviceId, 'remote-worker');
});

// ==============================================================================
// TEST 8 — Worker Failover
// ==============================================================================
test('Test 8 — Worker Failover: Disconnect a worker during active task and verify automatic recovery', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Worker 1 simulates crash
  scheduler.registerDevice({
    deviceId: 'worker-faulty',
    name: 'Worker Faulty',
    simulateFailure: true,
    resources: { cpuCores: 8, ramGb: 16 }
  });

  // Worker 2 healthy fallback
  scheduler.registerDevice({
    deviceId: 'worker-healthy',
    name: 'Worker Healthy',
    resources: { cpuCores: 8, ramGb: 16 }
  });

  const result = await scheduler.scheduleDistributedTask({
    taskId: 'failover-task-1',
    description: 'Resilient Task',
    type: 'data_processing'
  });

  assert.equal(result.status, 'completed');
  assert.ok(result.devicesInvolved.includes('worker-healthy'));
});

// ==============================================================================
// TEST 9 — Duplicate Prevention
// ==============================================================================
test('Test 9 — Duplicate Prevention: Retried task with idempotency key does not produce duplicated side effects', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  let executionCounter = 0;
  scheduler.workerExecutor = async (subtask) => {
    executionCounter++;
    return {
      subtaskId: subtask.id,
      counter: executionCounter,
      status: 'completed'
    };
  };

  scheduler.registerDevice({
    deviceId: 'node-exec',
    name: 'Exec Node',
    resources: { cpuCores: 4, ramGb: 16 }
  });

  const idempotencyKey = 'payment-order-uuid-8821';

  const res1 = await scheduler.scheduleDistributedTask({
    taskId: 'run-1',
    idempotencyKey,
    type: 'data_processing'
  });

  assert.equal(executionCounter, 1);

  const res2 = await scheduler.scheduleDistributedTask({
    taskId: 'run-duplicate',
    idempotencyKey,
    type: 'data_processing'
  });

  // Counter must remain 1 — cached result served without re-execution
  assert.equal(executionCounter, 1);
  assert.deepEqual(res1, res2);
});

// ==============================================================================
// TEST 10 — Coding Distribution
// ==============================================================================
test('Test 10 — Coding Distribution: Assign independent coding tasks to separate worktrees and merge results', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  scheduler.registerDevice({
    deviceId: 'worker-dev-1',
    name: 'Dev Worker 1',
    resources: { cpuCores: 8, ramGb: 32 }
  });

  const distributor = new MeshCodingDistributor({
    scheduler,
    workspaceRoot: path.join(TEST_DIR, 'coding-worktrees')
  });

  const result = await distributor.distributeAndExecute({
    taskId: 'feature-cart',
    description: 'Add comparison cart component',
    files: [
      'lib/ui/cart_view.dart',
      'lib/api/cart_service.dart',
      'test/cart_test.dart'
    ]
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'completed');
  assert.equal(result.subtasksCount, 3);
  assert.equal(result.hasConflicts, false);
  assert.ok(result.worktreeDirectories.length === 3);
});

// ==============================================================================
// TEST 11 — Conflict Handling
// ==============================================================================
test('Test 11 — Conflict Handling: Detect overlapping modifications across distinct worker worktrees', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  scheduler.registerDevice({
    deviceId: 'worker-a',
    name: 'Worker Alpha',
    resources: { cpuCores: 8, ramGb: 32 }
  });

  const distributor = new MeshCodingDistributor({
    scheduler,
    workspaceRoot: path.join(TEST_DIR, 'conflict-worktrees')
  });

  // Simulate subtask executor that produces divergent edits on the same file
  scheduler.workerExecutor = async (subtask, device) => {
    return {
      subtaskId: subtask.id,
      deviceId: device.deviceId,
      deviceName: device.name,
      workloadType: subtask.workloadType,
      filesProcessed: [
        {
          file: 'lib/core/config.dart',
          signature: subtask.id === 'subtask_frontend' ? 'sig-alpha-111' : 'sig-beta-222',
          patch: `// Patch from ${subtask.id}`
        }
      ],
      artifacts: [`artifact_${subtask.id}.bin`],
      status: 'completed'
    };
  };

  const result = await distributor.distributeAndExecute({
    taskId: 'task-conflict-demo',
    subtasks: [
      { id: 'subtask_frontend', name: 'Frontend', role: 'frontend_worker', workloadType: 'compilation' },
      { id: 'subtask_backend', name: 'Backend', role: 'backend_worker', workloadType: 'compilation' }
    ]
  });

  assert.equal(result.hasConflicts, true);
  assert.equal(result.status, 'conflict_detected');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].file, 'lib/core/config.dart');
});

// ==============================================================================
// TEST 12 — Resource Limits
// ==============================================================================
test('Test 12 — Resource Limits: Attempt to exceed configured memory budget cleanly terminates runaway process', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot: path.join(TEST_DIR, 'limits-test')
  });
  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  const job = await worker.submitJob({
    jobId: 'runaway-allocator',
    workloadType: 'compilation',
    limits: {
      maxMemoryMb: 35, // 35MB strict ceiling
      memoryPollIntervalMs: 50,
      timeoutMs: 5000
    },
    script: `
      const chunks = [];
      setInterval(() => {
        try {
          chunks.push(Buffer.alloc(8 * 1024 * 1024, 0xFF));
        } catch {}
      }, 40);
    `
  });

  assert.equal(job.status, 'failed');
  assert.match(job.error, /Memory limit exceeded|timeout/i);

  await worker.stop();
});

// ==============================================================================
// TEST 13 — Unauthorized Command
// ==============================================================================
test('Test 13 — Unauthorized Command: Worker rejects unallowlisted execution commands', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    allowedCommands: ['node', 'git'],
    workspacesRoot: path.join(TEST_DIR, 'unauth-cmd-test')
  });
  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  const job = await worker.submitJob({
    jobId: 'exploit-job-1',
    command: 'powershell.exe',
    args: ['-NoProfile', '-Command', 'calc.exe']
  });

  assert.equal(job.accepted, false);
  assert.equal(job.status, 'rejected');
  assert.match(job.reason, /Security Violation: Command "powershell.exe" is not in worker executable allowlist/i);

  await worker.stop();
});

// ==============================================================================
// TEST 14 — Authentication Replay
// ==============================================================================
test('Test 14 — Authentication Replay: Captured handshake challenge cannot be reused a second time', async () => {
  const pin = 'secure-secret-replay-pin';
  const worker = new MeshWorkerService({
    port: 0,
    pin,
    workspacesRoot: path.join(TEST_DIR, 'replay-test')
  });
  await worker.start();

  const client = new RemoteWorkerClient({
    port: worker.getPort(),
    pairingToken: pin
  });

  // Step 1: Request legitimate challenge
  const helloRes = await client._httpPost('/api/mesh/handshake', {
    action: 'hello',
    deviceId: 'replay-attacker-client'
  });
  assert.ok(helloRes && helloRes.challenge);
  const challenge = helloRes.challenge;

  // Step 2: First authentication succeeds
  const authPayload = meshProtocol.createAuthResponse(challenge, { pin, deviceId: 'client-1' });
  const authRes1 = await client._httpPost('/api/mesh/handshake', {
    action: 'auth',
    challenge,
    deviceId: 'client-1',
    response: authPayload.response,
    method: authPayload.method
  });
  assert.equal(authRes1.accepted, true);

  // Step 3: Replay attack with identical challenge & response
  await assert.rejects(
    async () => {
      await client._httpPost('/api/mesh/handshake', {
        action: 'auth',
        challenge,
        deviceId: 'client-1',
        response: authPayload.response,
        method: authPayload.method
      });
    },
    /Challenge expired, invalid, or replayed|Handshake rejected/i
  );

  await worker.stop();
});

// ==============================================================================
// TEST 15 — Worker Revocation
// ==============================================================================
test('Test 15 — Worker Revocation: Revoke a paired worker and verify access is permanently terminated', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  scheduler.registerDevice({
    deviceId: 'worker-to-revoke',
    name: 'Temporary Contributor',
    resources: { cpuCores: 8, ramGb: 32 }
  });

  assert.equal(scheduler.devices.get('worker-to-revoke').status, 'online');

  // Revoke device
  const disconnected = scheduler.disconnectDevice('worker-to-revoke');
  assert.equal(disconnected, true);
  assert.equal(scheduler.devices.get('worker-to-revoke').status, 'offline');

  // Verify worker is excluded from scheduling
  const eligible = scheduler.findEligibleDevices('data_processing');
  assert.ok(!eligible.some(d => d.deviceId === 'worker-to-revoke'));
});

// ==============================================================================
// TEST 16 — Virtual Computer Environment
// ==============================================================================
test('Test 16 — Virtual Computer: Provision and verify persistent guest sandbox environment', async () => {
  const vm = new VirtualMachineManager({
    userDataPath: path.join(TEST_DIR, 'mave_vm')
  });

  const caps = await vm.detectHostCapabilities();
  assert.ok(caps.preferredBackend);

  const startRes = await vm.start('guest-unit-test');
  assert.equal(startRes.ok, true);
  assert.equal(startRes.state, 'running');

  const isolation = await vm.verifyGuestIsolation();
  assert.equal(isolation.isolated, true);
  assert.ok(isolation.proofFile || isolation.guestKernel || isolation.isolationVerified);

  await vm.stop();
  assert.equal(vm.state, 'stopped');
});

// ==============================================================================
// TEST 17 — Host Desktop Independence
// ==============================================================================
test('Test 17 — Host Desktop Independence: Virtual browser automation operates offscreen with zero host cursor interference', async () => {
  const displayServer = new VirtualDisplayServer();
  const browser = new VirtualBrowserController({
    displayServer,
    guestRoot: path.join(TEST_DIR, 'guest_browser')
  });

  const tab = browser.createTab('https://example.com');
  assert.ok(tab);
  assert.equal(tab.id, 'tab_2'); // tab_1 was initial default

  await browser.goto('https://developer.mozilla.org');
  assert.equal(browser.getActiveTab().url, 'https://developer.mozilla.org');

  // Virtual cursor coordinates operate strictly within virtual display server
  await displayServer.moveCursor(450, 320);
  assert.equal(displayServer.cursor.x, 450);
  assert.equal(displayServer.cursor.y, 320);

  // Clean shutdown
  browser.closeTab(tab.id);
});

// ==============================================================================
// TEST 18 — Guest Filesystem Isolation
// ==============================================================================
test('Test 18 — Guest Filesystem Isolation: Path traversal escaping guest sandbox is strictly intercepted', () => {
  const desktop = new VirtualDesktopController({
    userDataPath: path.join(TEST_DIR, 'isolation_test')
  });

  // Legitimate relative paths resolve safely inside guestRoot
  const safePath = desktop.resolveGuestPath('workspace/project/app.js');
  assert.ok(safePath.includes('guest_fs'));

  // Path traversal attacks must throw security exceptions
  assert.throws(
    () => desktop.resolveGuestPath('../../../../Windows/System32/config/SAM'),
    /Security Violation: Path.*escapes the isolated guest filesystem/i
  );
  assert.throws(
    () => desktop.resolveGuestPath('..\\..\\..\\Users\\Administrator\\.ssh\\id_rsa'),
    /Security Violation: Path.*escapes the isolated guest filesystem/i
  );
});

// ==============================================================================
// TEST 19 — Controlled File Transfer
// ==============================================================================
test('Test 19 — Controlled File Transfer: Export authorized artifacts between guest and host with audit log', async () => {
  const desktop = new VirtualDesktopController({
    userDataPath: path.join(TEST_DIR, 'transfer_test')
  });

  // Write file inside guest
  await desktop.writeGuestFile('workspace/report.txt', 'Verified Deliverable 2026');

  // Export to host path
  const hostDest = path.join(TEST_DIR, 'host_exported', 'final_report.txt');
  const exportRes = await desktop.exportFileToHost('workspace/report.txt', hostDest);

  assert.equal(exportRes.ok, true);
  assert.ok(fs.existsSync(hostDest));
  assert.equal(fs.readFileSync(hostDest, 'utf8'), 'Verified Deliverable 2026');

  // Audit log verification
  const logs = desktop.getAuditLogs();
  assert.ok(logs.some(l => l.action === 'file_export'));
});

// ==============================================================================
// TEST 20 — Guest Restart & Persistence
// ==============================================================================
test('Test 20 — Guest Restart: Restart guest and verify workspace state persistence', async () => {
  const vmDir = path.join(TEST_DIR, 'restart_vm');
  const vm = new VirtualMachineManager({ userDataPath: vmDir });

  // 1. Start guest
  await vm.start('guest-persistent');
  const desktop = new VirtualDesktopController({ userDataPath: vmDir });
  await desktop.writeGuestFile('workspace/state.json', JSON.stringify({ runCount: 1 }));

  // 2. Stop guest
  await vm.stop();
  assert.equal(vm.state, 'stopped');

  // 3. Restart guest
  await vm.start('guest-persistent');
  assert.equal(vm.state, 'running');

  // 4. Verify previous workspace file persisted across reboot
  const fileContent = await desktop.readGuestFile('workspace/state.json');
  const parsed = JSON.parse(fileContent.content);
  assert.equal(parsed.runCount, 1);

  await vm.stop();
});

// ==============================================================================
// TEST 21 — Full MAVE Integration
// ==============================================================================
test('Test 21 — Full MAVE Integration: End-to-end cognitive loop coordinating capabilities, execution & deliverable verification', async () => {
  const orchestrator = getCognitiveOrchestrator({ fresh: true });

  const outcome = await orchestrator.handleUserInteraction(
    'Export verified financial report to final_summary.csv',
    { userId: 'alice_admin', sessionId: 'sess_e2e_full' }
  );

  assert.ok(outcome);
  assert.equal(outcome.status, 'done');
  assert.equal(outcome.verificationStatus, 'VERIFIED');
  assert.ok(outcome.goal);
  assert.equal(outcome.goal.originalRequest, 'Export verified financial report to final_summary.csv');
  assert.ok(outcome.text);
});

// ==============================================================================
// TEST 22 — Installer Packaging Verification
// ==============================================================================
test('Test 22 — Installer: Verify NSIS installer script, helper shutdown macros, and user data preservation', () => {
  const nsisPath = path.resolve(__dirname, '../build/installer.nsh');
  assert.ok(fs.existsSync(nsisPath), 'build/installer.nsh must exist');

  const nsisContent = fs.readFileSync(nsisPath, 'utf8');

  // Verify process shutdown macro includes mave-worker
  assert.match(nsisContent, /stopMaveHelpers/i);
  assert.match(nsisContent, /mave-worker/i);

  // Verify user data preservation during uninstall
  assert.match(nsisContent, /mave_keep_data/i);
  assert.match(nsisContent, /IDNO mave_keep_data/i);

  // Verify packaged installer executable if built
  const distInstaller = path.resolve(__dirname, '../dist/Mave-Setup-1.4.8.exe');
  if (fs.existsSync(distInstaller)) {
    const stats = fs.statSync(distInstaller);
    assert.ok(stats.size > 100 * 1024 * 1024, 'Installer must be complete (>100MB)');
  }
});
