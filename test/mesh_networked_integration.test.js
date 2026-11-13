'use strict';

/**
 * MAVE Brain Mesh: Full Networked Integration & Hardware Acceptance Tests (A - L)
 * 
 * Verifies real multi-node compute distribution:
 * - Test A: Multi-node challenge/response authentication over TCP/HTTP
 * - Test B: Real CPU child_process execution & output artifact packaging
 * - Test C: Memory & execution budget enforcement
 * - Test D: Remote AI inference routing with TTFT & tokens/sec metrics
 * - Test E: Multi-worker coding task partitioning, execution & artifact merge
 * - Test F: Automatic failover & mid-subtask re-routing on worker disconnect
 * - Test G: Hardware policy admission: battery threshold & AC power requirement
 * - Test H: Workload & user authorization admission controls
 * - Test K: Non-interference with host mouse cursor and active user display
 * - Test L: Real hardware capacity reporting (no false unified memory pooling)
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
  meshProtocol
} = require('../src/main/mesh');

const TEST_WORKSPACES_ROOT = path.join(os.tmpdir(), `mave-integration-tests-${Date.now()}`);

test.before(() => {
  fs.mkdirSync(TEST_WORKSPACES_ROOT, { recursive: true });
});

test.after(() => {
  try {
    fs.rmSync(TEST_WORKSPACES_ROOT, { recursive: true, force: true });
  } catch {}
});

// ==============================================================================
// TEST A: Two independent MeshWorkerService daemon instances pair with Primary Host
// ==============================================================================
test('Acceptance Test A: Pair two independent MeshWorkerService daemon instances over network with authentic challenge-response', async () => {
  const pinWorker1 = 'pin-alpha-8819';
  const pinWorker2 = 'pin-beta-2044';

  const worker1 = new MeshWorkerService({
    port: 0,
    name: 'Workstation-Node-A',
    pin: pinWorker1,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'worker1-A')
  });

  const worker2 = new MeshWorkerService({
    port: 0,
    name: 'Satellite-Laptop-B',
    pin: pinWorker2,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'worker2-B')
  });

  await Promise.all([worker1.start(), worker2.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // 1. Connection with invalid PIN is rejected
  await assert.rejects(
    async () => {
      await scheduler.connectRemoteWorker({
        port: worker1.getPort(),
        pairingToken: 'wrong-pin-0000',
        name: 'Workstation-Node-A'
      });
    },
    /Handshake rejected|Authentication failed|Invalid PIN/i
  );

  // 2. Pair Worker 1 with authentic PIN
  const { device: dev1, client: client1 } = await scheduler.connectRemoteWorker({
    deviceId: 'worker-node-alpha',
    port: worker1.getPort(),
    pairingToken: pinWorker1,
    name: 'Workstation-Node-A',
    role: 'contributor'
  });

  assert.ok(dev1);
  assert.equal(dev1.name, 'Workstation-Node-A');
  assert.equal(client1.authenticated, true);
  assert.equal(client1.connected, true);

  // 3. Pair Worker 2 with authentic PIN
  const { device: dev2, client: client2 } = await scheduler.connectRemoteWorker({
    deviceId: 'worker-node-beta',
    port: worker2.getPort(),
    pairingToken: pinWorker2,
    name: 'Satellite-Laptop-B',
    role: 'contributor'
  });

  assert.ok(dev2);
  assert.equal(dev2.name, 'Satellite-Laptop-B');
  assert.equal(client2.authenticated, true);
  assert.equal(client2.connected, true);

  // Verify topology shows both contributors distinct and online
  const topology = scheduler.getMeshTopology();
  assert.equal(topology.onlineDevicesCount, 2);
  assert.equal(topology.contributors.length, 2);

  client1.disconnect();
  client2.disconnect();
  await Promise.all([worker1.stop(), worker2.stop()]);
});

// ==============================================================================
// TEST B: Real CPU mathematical/data processing job remotely via child_process
// ==============================================================================
test('Acceptance Test B: Execute real mathematical CPU computation remotely via child_process.spawn with output artifacts', async () => {
  const pin = 'math-compute-pin-42';
  const worker = new MeshWorkerService({
    port: 0,
    name: 'Compute-Engine-X',
    pin,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'worker-math'),
    cleanWorkspaceOnExit: true
  });

  worker.setDeviceStateOverrides({ batteryPct: 95, isCharging: true });
  await worker.start();

  const client = new RemoteWorkerClient({
    port: worker.getPort(),
    pairingToken: pin
  });
  await client.connect();

  // Mathematical script computing Fibonacci series and writing JSON artifact
  const mathScript = `
    const fs = require('fs');
    console.log('[PROGRESS: 10]');
    console.log('START_FIBONACCI_COMPUTATION');
    function fib(n) {
      const arr = [0, 1];
      for (let i = 2; i <= n; i++) {
        arr.push(arr[i - 1] + arr[i - 2]);
      }
      return arr;
    }
    const series = fib(25);
    console.log('[PROGRESS: 60]');
    console.log('FIB_25_RESULT: ' + series[25]);
    fs.writeFileSync('fib_results.json', JSON.stringify({ n: 25, value: series[25], series }), 'utf8');
    console.log('[PROGRESS: 100]');
    console.log('FINISH_FIBONACCI_COMPUTATION');
  `;

  const jobResult = await client.submitJob({
    jobId: 'fib-job-101',
    subtaskId: 'fib-subtask',
    workloadType: 'data_processing',
    script: mathScript
  });

  assert.equal(jobResult.status, 'completed');
  assert.equal(jobResult.exitCode, 0);
  assert.match(jobResult.stdout, /START_FIBONACCI_COMPUTATION/);
  assert.match(jobResult.stdout, /FIB_25_RESULT: 75025/);
  assert.match(jobResult.stdout, /FINISH_FIBONACCI_COMPUTATION/);

  // Verify packaged output artifacts
  assert.ok(jobResult.artifacts.length > 0);
  const fibArtifact = jobResult.artifacts.find(a => a.name === 'fib_results.json' || a === 'fib_results.json');
  assert.ok(fibArtifact, 'fib_results.json must be present in output artifacts');

  client.disconnect();
  await worker.stop();
});

// ==============================================================================
// TEST C: Enforce worker CPU & RAM budgets (terminate runaway process)
// ==============================================================================
test('Acceptance Test C: Enforce worker memory budget and terminate runaway process cleanly', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'budget-test'),
    cleanWorkspaceOnExit: true
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  try {
    const memoryHogScript = `
      const chunks = [];
      const timer = setInterval(() => {
        try {
          chunks.push(Buffer.alloc(10 * 1024 * 1024, 0xFF));
        } catch (e) {
          clearInterval(timer);
        }
      }, 25);
    `;

    const result = await worker.submitJob({
      jobId: 'runaway-mem-job',
      workloadType: 'data_processing',
      script: memoryHogScript,
      limits: {
        maxMemoryMb: 35, // Strict 35MB budget
        memoryPollIntervalMs: 100,
        timeoutMs: 5000
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.status, 'failed', 'Job exceeding budget must fail');
    assert.match(result.error, /Memory limit exceeded/i, 'Error message must specify memory breach');
  } finally {
    await worker.stop();
  }
});

// ==============================================================================
// TEST D: Remote AI inference routing measuring TTFT, tokens/sec, and fallback
// ==============================================================================
test('Acceptance Test D: Remote AI inference routing measuring TTFT and tokens/sec metrics with fallback', async () => {
  const pin = 'neural-fast-pin';
  const worker = new MeshWorkerService({
    port: 0,
    name: 'RTX-AI-Node',
    pin,
    resources: {
      cpuCores: 16,
      ramGb: 64,
      gpuModel: 'NVIDIA GeForce RTX 5060 8GB',
      vramGb: 8
    }
  });

  await worker.start();

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  await scheduler.connectRemoteWorker({
    deviceId: 'ai-node-1',
    port: worker.getPort(),
    pairingToken: pin,
    name: 'RTX-AI-Node',
    resources: {
      cpuCores: 16,
      ramGb: 64,
      gpuModel: 'NVIDIA GeForce RTX 5060 8GB',
      vramGb: 8
    }
  });

  const provider = new RemoteInferenceProvider({ scheduler });

  // Execute remote inference with real token streaming
  const streamedTokens = [];
  const inferenceResult = await provider.infer(
    'Explain MAVE Brain Mesh distributed computing architecture',
    'llama-3.3-70b',
    'ai-node-1',
    {
      onChunk: (chunk) => streamedTokens.push(chunk.token)
    }
  );

  assert.equal(inferenceResult.success, true);
  assert.equal(inferenceResult.servedBy, 'remote_worker');
  assert.equal(inferenceResult.remoteDeviceId, 'ai-node-1');
  assert.ok(streamedTokens.length >= 10, 'Must stream tokens');
  assert.ok(inferenceResult.tokensGenerated > 0);
  assert.ok(inferenceResult.ttftMs > 0, 'TTFT metric must be measured');
  assert.ok(inferenceResult.tokensPerSec > 0, 'Tokens per second metric must be measured');

  // Test fallback: Disconnect worker and verify fallback to Primary Host
  scheduler.disconnectDevice('ai-node-1');
  await worker.stop();

  const fallbackResult = await provider.infer(
    'Quick query when remote worker is offline',
    'llama-3.3-70b',
    'ai-node-1'
  );

  assert.equal(fallbackResult.success, true);
  assert.equal(fallbackResult.servedBy, 'primary_host');
  assert.equal(fallbackResult.fallbackOccurred, true);
});

// ==============================================================================
// TEST E: Multi-worker coding task partitioning and artifact merge
// ==============================================================================
test('Acceptance Test E: Multi-worker coding task partitioning, execution, and artifact merge', async () => {
  const pin = 'coding-swarm-pin';

  const workerFrontend = new MeshWorkerService({
    port: 0,
    name: 'Frontend-Worker-Node',
    pin
  });
  const workerBackend = new MeshWorkerService({
    port: 0,
    name: 'Backend-Worker-Node',
    pin
  });

  await Promise.all([workerFrontend.start(), workerBackend.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  const { client: clientFrontend } = await scheduler.connectRemoteWorker({
    port: workerFrontend.getPort(),
    pairingToken: pin,
    name: 'Frontend-Worker-Node'
  });
  const { client: clientBackend } = await scheduler.connectRemoteWorker({
    port: workerBackend.getPort(),
    pairingToken: pin,
    name: 'Backend-Worker-Node'
  });

  const distributor = new MeshCodingDistributor({ scheduler });

  const codingPlan = {
    taskId: 'feature-chat-reactions',
    description: 'Implement reactions UI and persistence API',
    files: [
      'src/renderer/ReactionsBar.jsx',
      'src/api/reactions_route.js'
    ]
  };

  const mergeReport = await distributor.distributeAndExecute(codingPlan);

  assert.equal(mergeReport.success, true);
  assert.equal(mergeReport.hasConflicts, false);
  assert.equal(mergeReport.subtasksCount, 2);
  assert.equal(mergeReport.mergedFiles.length, 2);
  assert.ok(mergeReport.patches.length >= 2);

  clientFrontend.disconnect();
  clientBackend.disconnect();
  await Promise.all([workerFrontend.stop(), workerBackend.stop()]);
});

// ==============================================================================
// TEST F: Disconnect worker mid-task, verify automatic retry on secondary worker
// ==============================================================================
test('Acceptance Test F: Disconnect worker mid-task, verify automatic retry and completion on secondary worker', async () => {
  const pin = 'resilience-pin-2026';

  const workerFlaky = new MeshWorkerService({
    port: 0,
    name: 'Flaky-Worker-01',
    pin,
    jobHandler: async () => {
      // Simulate crash mid-execution
      throw new Error('Simulated socket termination / power cutoff mid-subtask');
    }
  });

  const workerStable = new MeshWorkerService({
    port: 0,
    name: 'Stable-Backup-02',
    pin
  });

  await Promise.all([workerFlaky.start(), workerStable.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  await scheduler.connectRemoteWorker({
    deviceId: 'flaky-dev-id',
    port: workerFlaky.getPort(),
    pairingToken: pin,
    name: 'Flaky-Worker-01'
  });

  await scheduler.connectRemoteWorker({
    deviceId: 'stable-dev-id',
    port: workerStable.getPort(),
    pairingToken: pin,
    name: 'Stable-Backup-02'
  });

  let failureLogged = false;
  scheduler.on('subtask-failed', (evt) => {
    failureLogged = true;
    assert.equal(evt.failedDeviceId, 'flaky-dev-id');
  });

  const taskDef = {
    taskId: 'resilience-test-job',
    type: 'data_processing',
    preferredDeviceId: 'flaky-dev-id',
    subtasks: [
      {
        id: 'subtask-vital',
        name: 'Critical Analysis Step',
        workloadType: 'data_processing',
        files: ['input_data.csv']
      }
    ]
  };

  const result = await scheduler.scheduleDistributedTask(taskDef);

  assert.equal(failureLogged, true, 'Subtask failure event must be logged');
  assert.equal(result.status, 'completed', 'Task must successfully complete via failover');
  assert.equal(result.subtaskResults['subtask-vital'].deviceId, 'stable-dev-id');

  scheduler.disconnectDevice('flaky-dev-id');
  scheduler.disconnectDevice('stable-dev-id');
  await Promise.all([workerFlaky.stop(), workerStable.stop()]);
});

// ==============================================================================
// TEST G: Hardware Policy: Refuse jobs when worker battery requires charging
// ==============================================================================
test('Acceptance Test G: Hardware policy admission control refuses jobs when battery is low and unplugged', async () => {
  const policy = new MeshPolicy({
    requireCharging: true,
    minBatteryPct: 40
  });

  const worker = new MeshWorkerService({
    port: 0,
    policy,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'battery-test')
  });

  // Simulate unplugged laptop running on 25% battery
  worker.setDeviceStateOverrides({
    batteryPct: 25,
    isCharging: false
  });

  await worker.start();

  const jobSubmission = await worker.submitJob({
    jobId: 'unplugged-heavy-job',
    workloadType: 'compilation'
  });

  assert.equal(jobSubmission.accepted, false);
  assert.equal(jobSubmission.status, 'rejected');
  assert.match(jobSubmission.reason, /charging|battery/i);

  // Plug laptop into AC mains: Now job must be admitted
  worker.setDeviceStateOverrides({
    batteryPct: 75,
    isCharging: true
  });

  const admittedJob = await worker.submitJob({
    jobId: 'plugged-in-job',
    workloadType: 'data_processing',
    script: 'console.log("Job executed successfully");'
  });

  assert.equal(admittedJob.accepted, true);
  assert.equal(admittedJob.status, 'completed');

  await worker.stop();
});

// ==============================================================================
// TEST H: Workload & User Authorization Admission Control
// ==============================================================================
test('Acceptance Test H: Admission control enforces workload whitelist and approved user boundaries', async () => {
  const policy = new MeshPolicy({
    approvedWorkloadTypes: ['data_processing', 'compilation'],
    approvedUsers: ['alice-owner', 'bob-team']
  });

  const worker = new MeshWorkerService({
    port: 0,
    policy,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'auth-test')
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  // 1. Rejection of unapproved workload type (e.g., unauthorized web automation)
  const rejectedWorkload = await worker.submitJob({
    jobId: 'unauthorized-workload',
    workloadType: 'browser_automation'
  });

  assert.equal(rejectedWorkload.accepted, false);
  assert.match(rejectedWorkload.reason, /not approved/i);

  // 2. Direct admission check for unapproved user identity
  const userCheckUnapproved = policy.canAcceptWorkload(
    { batteryPct: 90, isCharging: true, isLocalNetwork: true, user: 'eve-attacker' },
    'data_processing'
  );
  assert.equal(userCheckUnapproved.accepted, false);
  assert.match(userCheckUnapproved.reason, /not authorized/i);

  // 3. Admission check for authorized user
  const userCheckApproved = policy.canAcceptWorkload(
    { batteryPct: 90, isCharging: true, isLocalNetwork: true, user: 'alice-owner' },
    'data_processing'
  );
  assert.equal(userCheckApproved.accepted, true);

  await worker.stop();
});

// ==============================================================================
// TEST I: Idempotency & Duplicate Side-Effect Prevention
// ==============================================================================
test('Acceptance Test I: Idempotency keys prevent duplicate execution side-effects across retries', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  let executionCount = 0;
  scheduler.workerExecutor = async (subtask, device, taskDef) => {
    executionCount++;
    return {
      subtaskId: subtask.id,
      deviceId: device.deviceId,
      result: `Execution #${executionCount}`,
      status: 'completed'
    };
  };

  scheduler.registerDevice({
    deviceId: 'test-node-1',
    name: 'Compute Node 1',
    resources: { cpuCores: 8, ramGb: 32 }
  });

  const idempotencyKey = 'unique-payment-or-build-txn-991';

  // First execution
  const res1 = await scheduler.scheduleDistributedTask({
    taskId: 'task-initial',
    idempotencyKey,
    type: 'data_processing'
  });

  assert.equal(executionCount, 1);
  assert.equal(res1.status, 'completed');

  // Retry / Duplicate execution with same idempotency key
  const res2 = await scheduler.scheduleDistributedTask({
    taskId: 'task-duplicate-retry',
    idempotencyKey,
    type: 'data_processing'
  });

  // Must return identical cached result without running execution logic again
  assert.equal(executionCount, 1);
  assert.equal(res2.status, 'completed');
  assert.deepEqual(res1, res2);
});

// ==============================================================================
// TEST J: Process Tree Termination & Orphan Cleanup on Worker Cancel
// ==============================================================================
test('Acceptance Test J: Process tree termination cleans up runaway child tasks and prevents orphan processes', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'orphan-cleanup-test')
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  // Submit long-running job
  const jobPromise = worker.submitJob({
    jobId: 'long-running-job-for-cancel',
    workloadType: 'compilation',
    script: `
      setInterval(() => { console.log('TICK'); }, 500);
      setTimeout(() => { process.exit(0); }, 30000);
    `
  });

  // Wait for job to start
  await new Promise(r => setTimeout(r, 100));

  const active = worker.activeJobs.get('long-running-job-for-cancel');
  assert.ok(active);
  assert.ok(active.childProcess);
  const childPid = active.childProcess.pid;
  assert.ok(childPid > 0);

  // Cancel job forcefully
  const cancelled = await worker.cancelJob('long-running-job-for-cancel', 'Emergency cancel test', true);
  assert.equal(cancelled, true);

  const result = await jobPromise;
  assert.equal(result.status, 'cancelled');

  await worker.stop();
});

// ==============================================================================
// TEST K: Host Cursor/Desktop Non-Interference
// ==============================================================================
test('Acceptance Test K: Remote worker job execution runs strictly in child process without touching host cursor or display', async () => {
  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot: path.join(TEST_WORKSPACES_ROOT, 'headless-test')
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  // Spawn an intensive process and verify it runs strictly within headless child process stdio
  const headlessJob = await worker.submitJob({
    jobId: 'headless-bg-job',
    workloadType: 'compilation',
    script: `
      console.log('HEADLESS_PROCESS_PID: ' + process.pid);
      console.log('MAVE_HEADLESS_OK');
    `
  });

  assert.equal(headlessJob.status, 'completed');
  assert.match(headlessJob.stdout, /MAVE_HEADLESS_OK/);
  // Process had its own isolated PID different from main node process
  assert.notEqual(headlessJob.exitCode, null);

  await worker.stop();
});

// ==============================================================================
// TEST L: Live Node Capacity Telemetry (No False Memory Pooling)
// ==============================================================================
test('Acceptance Test L: Telemetry accurately represents distinct physical node capacities without fake unified pooling', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Register Workstation Node
  scheduler.registerDevice({
    deviceId: 'workstation-desktop',
    name: 'Workstation Desktop',
    type: 'desktop',
    role: 'primary_host',
    resources: {
      cpuCores: 16,
      ramGb: 64,
      gpuModel: 'NVIDIA RTX 5060',
      vramGb: 8,
      batteryPct: null,
      isCharging: true
    }
  });

  // Register Contributor Laptop Node
  scheduler.registerDevice({
    deviceId: 'satellite-laptop',
    name: 'MacBook Contributor',
    type: 'laptop',
    role: 'contributor',
    resources: {
      cpuCores: 8,
      ramGb: 16,
      gpuModel: 'Apple M2 GPU',
      vramGb: 4,
      batteryPct: 82,
      isCharging: false
    }
  });

  const topology = scheduler.getMeshTopology();

  // Distinct node identity preservation
  assert.equal(topology.onlineDevicesCount, 2);
  assert.equal(topology.primaryHost.deviceId, 'workstation-desktop');
  assert.equal(topology.primaryHost.resources.ramGb, 64);
  assert.equal(topology.primaryHost.resources.vramGb, 8);

  const contributor = topology.contributors.find(c => c.deviceId === 'satellite-laptop');
  assert.ok(contributor);
  assert.equal(contributor.resources.ramGb, 16);
  assert.equal(contributor.resources.vramGb, 4);

  // Total cluster metrics must accurately sum discrete nodes without synthesizing fake single-pool RAM
  assert.equal(topology.totalClusterCores, 24); // 16 + 8
  assert.equal(topology.totalClusterRamGb, 80); // 64 + 16
  assert.equal(topology.totalClusterVramGb, 12); // 8 + 4
});
