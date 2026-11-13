'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  DistributedScheduler,
  RemoteWorkerClient,
  MeshWorkerService,
  RemoteInferenceProvider,
  MeshCodingDistributor,
  meshProtocol
} = require('../src/main/mesh');

test('MeshProtocol: Challenge/response authentication handshake validation', () => {
  const challenge = meshProtocol.createChallenge(32);
  assert.equal(challenge.length, 64, 'Challenge should be 32 bytes hex encoded');

  const validPin = 'super-secret-pairing-pin';
  const wrongPin = 'invalid-wrong-pin';

  // 1. HMAC computation & verification
  const hmac = meshProtocol.computeHmacResponse(challenge, validPin);
  assert.ok(hmac);
  assert.equal(typeof hmac, 'string');

  const isValid = meshProtocol.verifyHmacResponse(challenge, hmac, validPin);
  assert.equal(isValid, true, 'Verification must succeed with valid PIN');

  const isInvalid = meshProtocol.verifyHmacResponse(challenge, hmac, wrongPin);
  assert.equal(isInvalid, false, 'Verification must fail with incorrect PIN');

  // 2. Structured Auth Response
  const authPayload = meshProtocol.createAuthResponse(challenge, {
    pin: validPin,
    deviceId: 'test-device-1'
  });
  assert.equal(authPayload.method, 'hmac');
  assert.equal(authPayload.deviceId, 'test-device-1');

  const authVerified = meshProtocol.verifyAuthResponse(challenge, authPayload, { pin: validPin });
  assert.equal(authVerified, true);

  const authRejected = meshProtocol.verifyAuthResponse(challenge, authPayload, { pin: wrongPin });
  assert.equal(authRejected, false);
});

test('RemoteWorkerClient: Connect, authenticate, and heartbeat with MeshWorkerService', async () => {
  const pairingToken = 'auth-token-test-1';
  const workerService = new MeshWorkerService({
    port: 0,
    name: 'TestWorkerNode-01',
    pairingToken,
    resources: { cpuCores: 16, ramGb: 64, gpuModel: 'RTX 4090', vramGb: 24 }
  });

  await workerService.start();
  const port = workerService.getPort();

  // 1. Connection with invalid pairing token should reject
  const badClient = new RemoteWorkerClient({
    port,
    pairingToken: 'wrong-token',
    reconnect: false
  });

  await assert.rejects(
    async () => {
      await badClient.connect();
    },
    /Handshake rejected|Invalid PIN or signature|authentication failed/i
  );
  badClient.disconnect();

  // 2. Connection with valid pairing token succeeds
  const goodClient = new RemoteWorkerClient({
    port,
    pairingToken,
    heartbeatIntervalMs: 80
  });

  const workerInfo = await goodClient.connect();
  assert.ok(workerInfo);
  assert.equal(goodClient.authenticated, true);
  assert.equal(goodClient.connected, true);

  // 3. Heartbeat verification
  const heartbeatTelemetry = await new Promise((resolve) => {
    goodClient.once('heartbeat', resolve);
  });
  assert.ok(heartbeatTelemetry);
  assert.ok(heartbeatTelemetry.resources);

  goodClient.disconnect();
  await workerService.stop();
});

test('DistributedScheduler: Parallel task dispatch across two RemoteWorkerService instances', async () => {
  const pairingToken = 'secure-mesh-pin-44';

  const worker1 = new MeshWorkerService({
    port: 0,
    name: 'Satellite-PC-East',
    pairingToken,
    resources: { cpuCores: 8, ramGb: 32, vramGb: 8 }
  });
  const worker2 = new MeshWorkerService({
    port: 0,
    name: 'Satellite-PC-West',
    pairingToken,
    resources: { cpuCores: 12, ramGb: 48, vramGb: 12 }
  });

  await Promise.all([worker1.start(), worker2.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Connect both remote workers via RemoteWorkerClient
  const { device: dev1, client: client1 } = await scheduler.connectRemoteWorker({
    port: worker1.getPort(),
    pairingToken,
    name: 'Satellite-PC-East',
    type: 'desktop'
  });

  const { device: dev2, client: client2 } = await scheduler.connectRemoteWorker({
    port: worker2.getPort(),
    pairingToken,
    name: 'Satellite-PC-West',
    type: 'desktop'
  });

  assert.equal(dev1.status, 'online');
  assert.equal(dev2.status, 'online');
  assert.equal(client1.connected, true);
  assert.equal(client2.connected, true);

  // Track progress events
  const progressEvents = [];
  scheduler.on('subtask-progress', (evt) => {
    progressEvents.push(evt);
  });

  // Dispatch distributed coding task with 2 subtasks across both workers in parallel
  const taskDef = {
    taskId: 'parallel-feature-build',
    type: 'coding',
    description: 'Implement distributed real-time sync module',
    subtasks: [
      {
        id: 'subtask_client',
        name: 'Client Synchronizer',
        role: 'frontend_worker',
        workloadType: 'compilation',
        files: ['src/ui/sync_view.jsx']
      },
      {
        id: 'subtask_server',
        name: 'Server Relay Handler',
        role: 'backend_worker',
        workloadType: 'data_processing',
        files: ['src/server/relay_socket.js']
      }
    ]
  };

  const result = await scheduler.scheduleDistributedTask(taskDef);

  assert.equal(result.status, 'completed');
  assert.equal(result.subtaskCount, 2);
  assert.equal(result.completedCount, 2);

  // Verify both workers executed real subtasks
  assert.ok(result.subtaskResults.subtask_client);
  assert.ok(result.subtaskResults.subtask_server);
  assert.equal(result.subtaskResults.subtask_client.status, 'completed');
  assert.equal(result.subtaskResults.subtask_server.status, 'completed');

  assert.ok(result.filesProcessed.length >= 2);
  assert.ok(result.artifacts.length >= 2);

  client1.disconnect();
  client2.disconnect();
  await Promise.all([worker1.stop(), worker2.stop()]);
});

test('DistributedScheduler: Worker failure recovery and automatic re-routing mid-subtask', async () => {
  const pairingToken = 'resilience-token-99';

  // Worker 1: Fragile worker that will be forcefully terminated mid-execution
  const flakyWorker = new MeshWorkerService({
    port: 0,
    name: 'Fragile-Satellite',
    pairingToken,
    resources: { cpuCores: 4, ramGb: 16 },
    jobHandler: async (msg, reportProgress) => {
      reportProgress({ stage: 'processing', progressPercent: 10 });
      await new Promise(r => setTimeout(r, 150));
      return { outputFiles: ['sensor_log_01.csv'] };
    }
  });

  // Worker 2: Stable fallback worker
  const stableWorker = new MeshWorkerService({
    port: 0,
    name: 'Workhorse-Desktop',
    pairingToken,
    resources: { cpuCores: 16, ramGb: 64 }
  });

  await Promise.all([flakyWorker.start(), stableWorker.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  const { device: flakyDev, client: flakyClient } = await scheduler.connectRemoteWorker({
    deviceId: 'flaky-node-1',
    port: flakyWorker.getPort(),
    pairingToken,
    name: 'Fragile-Satellite'
  });

  const { device: stableDev, client: stableClient } = await scheduler.connectRemoteWorker({
    deviceId: 'stable-node-1',
    port: stableWorker.getPort(),
    pairingToken,
    name: 'Workhorse-Desktop'
  });

  let failureLogged = false;
  scheduler.on('subtask-failed', (evt) => {
    failureLogged = true;
    assert.equal(evt.failedDeviceId, 'flaky-node-1');
  });

  // Terminate flaky worker mid-subtask
  scheduler.once('subtask-dispatched', (evt) => {
    if (evt.deviceId === 'flaky-node-1') {
      setTimeout(() => {
        flakyWorker.terminate();
      }, 20);
    }
  });

  const taskDef = {
    taskId: 'heavy-dataset-calc',
    type: 'data_processing',
    description: 'Crunch distributed sensor logs',
    files: ['sensor_log_01.csv'],
    preferredDeviceId: 'flaky-node-1'
  };

  const finalResult = await scheduler.scheduleDistributedTask(taskDef);

  assert.equal(failureLogged, true);
  assert.equal(finalResult.status, 'completed');
  // Subtask recovered and finished on stable worker
  assert.equal(finalResult.subtaskResults.subtask_main.deviceId, 'stable-node-1');
  assert.equal(finalResult.subtaskResults.subtask_main.deviceName, 'Workhorse-Desktop');

  flakyClient.disconnect();
  stableClient.disconnect();
  await stableWorker.stop();
});

test('RemoteInferenceProvider: Real token streaming and telemetry calculation', async () => {
  const pairingToken = 'neural-token-123';

  const neuralWorker = new MeshWorkerService({
    port: 0,
    name: 'Neural-Inference-Rig',
    pairingToken,
    resources: {
      cpuCores: 32,
      ramGb: 128,
      gpuModel: 'NVIDIA RTX 4090 24GB',
      vramGb: 24
    }
  });

  await neuralWorker.start();
  const port = neuralWorker.getPort();

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  let client = null;
  try {
    const conn = await scheduler.connectRemoteWorker({
      deviceId: 'neural-rig-gpu',
      port,
      pairingToken,
      name: 'Neural-Inference-Rig',
      resources: { vramGb: 24, gpuModel: 'NVIDIA RTX 4090 24GB' }
    });
    client = conn.client;

    const provider = new RemoteInferenceProvider({ scheduler });

    const streamedTokens = [];
    const telemetry = await provider.infer('Analyze memory access pattern for lock-free queue', 'llama-3.3-70b', 'neural-rig-gpu', {
      onChunk: (chunk) => {
        streamedTokens.push(chunk.token);
      }
    });

    // 1. Verify token streaming
    assert.ok(streamedTokens.length > 5);
    assert.match(telemetry.text, /MAVE/);

    // 2. Verify accurate telemetry calculation
    assert.ok(telemetry.ttftMs > 0, `ttftMs should be > 0, got: ${telemetry.ttftMs}`);
    assert.ok(telemetry.tokensPerSec > 0, `tokensPerSec should be > 0, got: ${telemetry.tokensPerSec}`);
    assert.ok(telemetry.totalLatencyMs >= telemetry.ttftMs, 'totalLatencyMs should be >= ttftMs');
    assert.equal(telemetry.remoteDeviceId, 'neural-rig-gpu');
    assert.equal(telemetry.modelUsed, 'llama-3.3-70b');
    assert.equal(telemetry.processLocation, `remote_worker:127.0.0.1:${port}`);
    assert.equal(telemetry.fallbackUsed, false);
    assert.equal(telemetry.status, 'completed');

    // Also verify scheduler.executeRemoteInference uses provider and returns telemetry
    const schedulerInference = await scheduler.executeRemoteInference('Summarize thread contention', 'llama-3.3-70b', 'neural-rig-gpu');
    assert.equal(schedulerInference.deviceId, 'neural-rig-gpu');
    assert.ok(schedulerInference.ttftMs > 0);
    assert.ok(schedulerInference.tokensPerSec > 0);
    assert.equal(schedulerInference.processLocation, `remote_worker:127.0.0.1:${port}`);
  } finally {
    if (client) client.disconnect();
    await neuralWorker.stop();
  }
});

test('RemoteInferenceProvider: Fallback to Primary Host when remote worker disconnects', async () => {
  const scheduler = new DistributedScheduler({
    registerLocalDevice: true,
    isPrimaryHost: true
  });

  const provider = new RemoteInferenceProvider({
    scheduler,
    localFallbackHandler: async (prompt, model, opts) => {
      opts.onChunk?.('Host ');
      opts.onChunk?.('Neural ');
      opts.onChunk?.('Response');
      return {
        text: 'Host Neural Response',
        tokensGenerated: 3
      };
    }
  });

  let fallbackEventTriggered = false;
  provider.on('fallback-triggered', () => {
    fallbackEventTriggered = true;
  });

  // Request inference targeting nonexistent or offline worker
  const result = await provider.infer('Emergency fallback test', 'mistral-7b', 'nonexistent-worker');

  assert.equal(fallbackEventTriggered, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.text, 'Host Neural Response');
  assert.equal(result.processLocation, 'primary_host:local');
  assert.ok(result.ttftMs > 0);
  assert.ok(result.tokensPerSec > 0);
  assert.equal(result.status, 'completed');
});

test('MeshCodingDistributor: Decompose into worktrees, parallel execution, and conflict detection', async () => {
  const pairingToken = 'coding-dist-secret';

  const workerA = new MeshWorkerService({
    port: 0,
    name: 'Frontend-Node',
    pairingToken,
    resources: { cpuCores: 8, ramGb: 32 }
  });
  const workerB = new MeshWorkerService({
    port: 0,
    name: 'Backend-Node',
    pairingToken,
    resources: { cpuCores: 16, ramGb: 64 }
  });

  await Promise.all([workerA.start(), workerB.start()]);

  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  const { client: clientA } = await scheduler.connectRemoteWorker({
    port: workerA.getPort(),
    pairingToken,
    name: 'Frontend-Node'
  });
  const { client: clientB } = await scheduler.connectRemoteWorker({
    port: workerB.getPort(),
    pairingToken,
    name: 'Backend-Node'
  });

  const distributor = new MeshCodingDistributor({ scheduler });

  // 1. Clean multi-worker coding distribution
  const taskDef = {
    taskId: 'feature-dashboard-v2',
    description: 'Implement real-time dashboard with metrics API',
    files: [
      'src/ui/components/MetricCard.jsx',
      'src/api/routes/metricsRouter.js',
      'test/unit/metrics.test.js'
    ]
  };

  const report = await distributor.distributeAndExecute(taskDef);

  assert.equal(report.taskId, 'feature-dashboard-v2');
  assert.equal(report.success, true);
  assert.equal(report.hasConflicts, false);
  assert.equal(report.subtasksCount, 3);
  assert.ok(report.worktreeDirectories.length === 3);
  assert.ok(report.mergedFiles.length === 3);
  assert.ok(report.patches.length >= 3);
  assert.ok(report.testSummary.passed > 0);

  // 2. Conflict detection when two subtasks modify the exact same file with conflicting signatures
  const conflictingSubtasks = [
    {
      id: 'subtask_1',
      role: 'worker_1',
      workloadType: 'compilation',
      files: ['src/shared/config.js']
    },
    {
      id: 'subtask_2',
      role: 'worker_2',
      workloadType: 'compilation',
      files: ['src/shared/config.js']
    }
  ];

  const conflictReport = await distributor.distributeAndExecute({
    taskId: 'task-with-collision',
    subtasks: conflictingSubtasks
  });

  assert.equal(conflictReport.hasConflicts, true);
  assert.equal(conflictReport.success, false);
  assert.equal(conflictReport.status, 'conflict_detected');
  assert.ok(conflictReport.conflicts.length > 0);
  assert.equal(conflictReport.conflicts[0].file, 'src/shared/config.js');

  clientA.disconnect();
  clientB.disconnect();
  await Promise.all([workerA.stop(), workerB.stop()]);
});

test('RemoteWorkerClient: Job cancellation support', async () => {
  const pairingToken = 'cancel-test-pin';
  const worker = new MeshWorkerService({
    port: 0,
    name: 'SlowJobWorker',
    pairingToken,
    jobHandler: async (msg, reportProgress) => {
      // Simulate long running job
      reportProgress({ stage: 'processing', progressPercent: 20 });
      await new Promise(r => setTimeout(r, 600));
      return { outputFiles: ['done.txt'] };
    }
  });

  await worker.start();
  const port = worker.getPort();

  const client = new RemoteWorkerClient({
    port,
    pairingToken
  });

  await client.connect();

  const jobPromise = client.submitJob({
    jobId: 'job-to-cancel',
    command: 'run-long'
  });

  const rejectionExpectation = assert.rejects(
    jobPromise,
    /cancelled|aborted|Request timed out/i
  );

  // Cancel immediately
  await new Promise(r => setTimeout(r, 20));
  const cancelOk = await client.cancelJob('job-to-cancel', 'User clicked Stop');
  assert.equal(cancelOk, true);

  await rejectionExpectation;

  client.disconnect();
  await worker.stop();
});
