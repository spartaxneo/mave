'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  generateDeviceIdentity,
  saveDeviceIdentity,
  loadDeviceIdentity,
  loadOrGenerateDeviceIdentity,
  createChallenge,
  computeHmacResponse,
  verifyHmacResponse,
  signChallengeWithKey,
  verifySignatureResponse,
  createAuthResponse,
  verifyAuthResponse,
  createMessage,
  validateMessage,
  assertValidMessage,
  encodeFrame,
  FrameDecoder
} = require('../src/main/mesh/mesh_protocol');

const { MeshPolicy } = require('../src/main/mesh/mesh_policies');
const { MeshWorkerService } = require('../src/main/mesh/mesh_worker_service');

const TEST_TMP_DIR = path.join(os.tmpdir(), `mave-worker-test-${Date.now()}`);

test.before(() => {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
});

test.after(() => {
  try {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  } catch {}
});

test('MeshProtocol: Device identity generation, cryptographic keys, and persistence', () => {
  const identity = generateDeviceIdentity({ name: 'Node-Alpha', role: 'worker' });

  assert.ok(identity.deviceId.startsWith('mave-worker-'), 'deviceId should have worker prefix');
  assert.equal(identity.name, 'Node-Alpha');
  assert.equal(identity.role, 'worker');
  assert.ok(identity.token && identity.token.length === 64, 'token should be 64-char hex');
  assert.match(identity.publicKey, /BEGIN PUBLIC KEY/, 'publicKey must be valid PEM');
  assert.match(identity.privateKey, /BEGIN PRIVATE KEY/, 'privateKey must be valid PEM');
  assert.ok(identity.fingerprint && identity.fingerprint.length === 64, 'fingerprint should be SHA-256');

  // Persistence to disk
  const identityFile = path.join(TEST_TMP_DIR, 'persistent_identity.json');
  saveDeviceIdentity(identityFile, identity);
  assert.ok(fs.existsSync(identityFile), 'identity file should be created');

  const loaded = loadDeviceIdentity(identityFile);
  assert.equal(loaded.deviceId, identity.deviceId);
  assert.equal(loaded.fingerprint, identity.fingerprint);
  assert.equal(loaded.token, identity.token);

  // loadOrGenerateDeviceIdentity should load existing identity without re-generating
  const reloaded = loadOrGenerateDeviceIdentity(identityFile);
  assert.equal(reloaded.deviceId, identity.deviceId);
  assert.equal(reloaded.fingerprint, identity.fingerprint);
});

test('MeshProtocol: Authenticated challenge/response handshake with PIN and Ed25519 signature', () => {
  const challenge = createChallenge(32);
  assert.equal(challenge.length, 64, 'challenge should be 32 bytes hex encoded');

  // 1. PIN / HMAC authentication
  const pin = '489215';
  const hmac = computeHmacResponse(challenge, pin);
  assert.ok(verifyHmacResponse(challenge, hmac, pin), 'HMAC verification must succeed with correct PIN');
  assert.equal(verifyHmacResponse(challenge, hmac, 'wrong-pin'), false, 'HMAC verification must fail with wrong PIN');

  const authPinPayload = createAuthResponse(challenge, { pin, deviceId: 'worker-1' });
  assert.equal(authPinPayload.method, 'hmac');
  assert.ok(verifyAuthResponse(challenge, authPinPayload, { pin }));
  assert.equal(verifyAuthResponse(challenge, authPinPayload, { pin: '000000' }), false);

  // 2. Ed25519 digital signature authentication
  const identity = generateDeviceIdentity();
  const signature = signChallengeWithKey(challenge, identity.privateKey);
  assert.ok(verifySignatureResponse(challenge, signature, identity.publicKey), 'Signature must verify with public key');

  const otherIdentity = generateDeviceIdentity();
  assert.equal(
    verifySignatureResponse(challenge, signature, otherIdentity.publicKey),
    false,
    'Signature verification must fail with foreign public key'
  );

  const authSigPayload = createAuthResponse(challenge, {
    privateKey: identity.privateKey,
    deviceId: identity.deviceId
  });
  assert.equal(authSigPayload.method, 'signature');
  assert.ok(verifyAuthResponse(challenge, authSigPayload, { publicKey: identity.publicKey }));
  assert.equal(verifyAuthResponse(challenge, authSigPayload, { publicKey: otherIdentity.publicKey }), false);
});

test('MeshProtocol: Message validation and binary length-prefixed framing', () => {
  // Validate all canonical message types
  for (const type of Object.values(MESSAGE_TYPES)) {
    const payload = {
      deviceId: 'dev-1',
      jobId: 'job-1',
      command: 'node',
      challenge: 'c123',
      response: 'r123',
      reason: 'ok',
      filename: 'out.txt'
    };
    const msg = createMessage(type, payload);
    const result = validateMessage(msg);
    assert.ok(result.valid, `Message type ${type} should validate successfully`);
  }

  // Length-prefixed framing test with chunk fragmentation
  const testMessage = createMessage(MESSAGE_TYPES.JOB_PROGRESS, {
    jobId: 'job-999',
    progress: 75,
    stage: 'processing'
  });

  const frameBuf = encodeFrame(testMessage);
  assert.ok(frameBuf.length > 4, 'frame buffer must contain header and payload');
  const payloadLen = frameBuf.readUInt32BE(0);
  assert.equal(payloadLen, frameBuf.length - 4, 'length prefix must match exact payload byte size');

  // Decode frame in fragmented chunks across stream
  const decoder = new FrameDecoder();
  const splitPoint = Math.floor(frameBuf.length / 2);
  const chunk1 = frameBuf.slice(0, splitPoint);
  const chunk2 = frameBuf.slice(splitPoint);

  const decoded1 = decoder.push(chunk1);
  assert.equal(decoded1.length, 0, 'partial chunk should not produce complete message');

  const decoded2 = decoder.push(chunk2);
  assert.equal(decoded2.length, 1, 'reassembled chunks must yield decoded message');
  assert.equal(decoded2[0].type, MESSAGE_TYPES.JOB_PROGRESS);
  assert.equal(decoded2[0].payload.jobId, 'job-999');
  assert.equal(decoded2[0].payload.progress, 75);
});

test('MeshWorkerService: Policy admission control rejection rules', async () => {
  const workspacesRoot = path.join(TEST_TMP_DIR, 'policy-workspaces');
  const identityPath = path.join(TEST_TMP_DIR, 'policy-identity.json');

  const policy = new MeshPolicy({
    minBatteryPercent: 30,
    shareOnlyWhileCharging: true,
    enableComputeSharing: true,
    paused: false
  });

  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot,
    identityPath,
    policy
  });

  await worker.start();

  try {
    // 1. Rejection: Unapproved workload type
    const unapprovedJob = {
      jobId: 'job-unapproved',
      workloadType: 'unapproved_bitcoin_mining',
      script: 'console.log("bad");'
    };
    const unapprovedResult = await worker.submitJob(unapprovedJob);
    assert.equal(unapprovedResult.accepted, false, 'Unapproved workload type must be rejected');
    assert.match(unapprovedResult.reason, /not approved by policy/i);

    // 2. Rejection: Low battery threshold (20% < 30%)
    worker.setDeviceStateOverrides({ batteryPct: 20, isCharging: true });
    const lowBatteryResult = await worker.submitJob({
      jobId: 'job-low-battery',
      workloadType: 'testing',
      script: 'console.log("test");'
    });
    assert.equal(lowBatteryResult.accepted, false, 'Low battery must be rejected');
    assert.match(lowBatteryResult.reason, /Battery level/i);

    // 3. Rejection: Unplugged / Not charging when required
    worker.setDeviceStateOverrides({ batteryPct: 80, isCharging: false });
    const unpluggedResult = await worker.submitJob({
      jobId: 'job-unplugged',
      workloadType: 'compilation',
      script: 'console.log("compile");'
    });
    assert.equal(unpluggedResult.accepted, false, 'Unplugged state must be rejected');
    assert.match(unpluggedResult.reason, /AC charging/i);

    // 4. Rejection: Paused policy
    worker.clearDeviceStateOverrides();
    worker.policy.updateSettings({ paused: true });
    const pausedResult = await worker.submitJob({
      jobId: 'job-paused',
      workloadType: 'data_processing',
      script: 'console.log("paused");'
    });
    assert.equal(pausedResult.accepted, false, 'Paused policy must reject jobs');
    assert.match(pausedResult.reason, /Compute sharing is paused/i);
  } finally {
    await worker.stop();
  }
});

test('MeshWorkerService: Real mathematical CPU job execution, stdout streaming, artifact packaging, and workspace cleanup', async () => {
  const workspacesRoot = path.join(TEST_TMP_DIR, 'exec-workspaces');
  const identityPath = path.join(TEST_TMP_DIR, 'exec-identity.json');

  const policy = new MeshPolicy({
    shareCpu: true,
    shareOnlyWhileCharging: false
  });

  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot,
    identityPath,
    policy,
    cleanWorkspaceOnExit: true
  });

  worker.setDeviceStateOverrides({
    batteryPct: 90,
    isCharging: true,
    isIdle: true,
    thermalOk: true
  });

  await worker.start();

  try {
    const jobId = `prime-calc-${Date.now()}`;
    const targetWorkspace = path.join(workspacesRoot, jobId);

    // Real mathematical compute script: prime sieve and artifact file generation
    const computeScript = `
      const fs = require('fs');
      console.log('START_MATHEMATICAL_COMPUTE');
      console.log('[PROGRESS: 10]');

      function computePrimes(limit) {
        const primes = [];
        for (let i = 2; i <= limit; i++) {
          let prime = true;
          for (let j = 2; j * j <= i; j++) {
            if (i % j === 0) { prime = false; break; }
          }
          if (prime) primes.push(i);
        }
        return primes;
      }

      const primes = computePrimes(150);
      console.log('[PROGRESS: 90]');
      console.log('COMPUTED_PRIMES_COUNT: ' + primes.length);

      // Write output artifact file into workspace
      fs.writeFileSync('primes_result.json', JSON.stringify({
        count: primes.length,
        primes: primes.slice(0, 5)
      }), 'utf8');

      console.log('[PROGRESS: 100]');
      console.log('FINISHED_MATHEMATICAL_COMPUTE');
    `;

    const stdoutEvents = [];
    worker.on('job:stdout', (data) => {
      if (data.jobId === jobId) {
        stdoutEvents.push(data.text);
      }
    });

    const result = await worker.submitJob({
      jobId,
      workloadType: 'data_processing',
      script: computeScript,
      scriptFile: 'main.js'
    });

    assert.equal(result.accepted, true, 'Job must be admitted');
    assert.equal(result.ok, true, 'Job execution must succeed');
    assert.equal(result.status, 'completed');
    assert.equal(result.exitCode, 0);

    // Verify stdout captures
    assert.match(result.stdout, /START_MATHEMATICAL_COMPUTE/);
    assert.match(result.stdout, /COMPUTED_PRIMES_COUNT: 35/);
    assert.match(result.stdout, /FINISHED_MATHEMATICAL_COMPUTE/);
    assert.ok(stdoutEvents.length > 0, 'stdout events should have streamed');

    // Verify packaged output artifacts
    assert.ok(result.artifacts && result.artifacts.length > 0, 'Artifacts must be packaged');
    const primeArtifact = result.artifacts.find((a) => a.name === 'primes_result.json');
    assert.ok(primeArtifact, 'primes_result.json must be present in output artifacts');
    const parsedData = JSON.parse(primeArtifact.content);
    assert.equal(parsedData.count, 35);
    assert.deepEqual(parsedData.primes, [2, 3, 5, 7, 11]);

    // Verify workspace was cleaned up and removed from disk
    assert.equal(fs.existsSync(targetWorkspace), false, 'Workspace directory must be cleaned up on completion');
  } finally {
    await worker.stop();
  }
});

test('MeshWorkerService: Memory limit monitoring terminates runaway process', async () => {
  const workspacesRoot = path.join(TEST_TMP_DIR, 'memory-workspaces');
  const identityPath = path.join(TEST_TMP_DIR, 'memory-identity.json');

  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot,
    identityPath,
    cleanWorkspaceOnExit: true
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  try {
    const jobId = `memory-exceed-${Date.now()}`;

    // Script that rapidly inflates RSS memory
    const memoryHogScript = `
      console.log('MEMORY_HOG_STARTED');
      const buffers = [];
      const interval = setInterval(() => {
        try {
          // Allocate 10MB chunks rapidly
          buffers.push(Buffer.alloc(10 * 1024 * 1024, 0xAA));
        } catch (e) {
          clearInterval(interval);
        }
      }, 30);
    `;

    const result = await worker.submitJob({
      jobId,
      workloadType: 'data_processing',
      script: memoryHogScript,
      limits: {
        maxMemoryMb: 35, // Very tight 35MB limit
        memoryPollIntervalMs: 50,
        timeoutMs: 10000
      }
    });

    assert.equal(result.accepted, true);
    assert.equal(result.status, 'failed', 'Process exceeding memory limit must be terminated as failed');
    assert.match(result.error, /Memory limit exceeded/i, 'Reason must explicitly indicate memory limit breach');
  } finally {
    await worker.stop();
  }
});

test('MeshWorkerService: Job cancellation terminates child process cleanly', async () => {
  const workspacesRoot = path.join(TEST_TMP_DIR, 'cancel-workspaces');
  const identityPath = path.join(TEST_TMP_DIR, 'cancel-identity.json');

  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot,
    identityPath,
    cleanWorkspaceOnExit: true
  });

  worker.setDeviceStateOverrides({ batteryPct: 90, isCharging: true });
  await worker.start();

  try {
    const jobId = `cancel-job-${Date.now()}`;
    const workspaceDir = path.join(workspacesRoot, jobId);

    // Infinite loop script
    const infiniteScript = `
      console.log('RUNNING_LONG_PROCESS');
      setInterval(() => {
        console.log('HEARTBEAT_TICK');
      }, 200);
    `;

    // Start job asynchronously
    const jobPromise = worker.submitJob({
      jobId,
      workloadType: 'testing',
      script: infiniteScript
    });

    // Wait until process starts and outputs text
    await new Promise((resolve) => {
      const onStdout = (data) => {
        if (data.jobId === jobId && data.text.includes('RUNNING_LONG_PROCESS')) {
          worker.off('job:stdout', onStdout);
          resolve();
        }
      };
      worker.on('job:stdout', onStdout);
    });

    // Cancel job
    const cancelled = await worker.cancelJob(jobId, 'Manual test cancellation', true);
    assert.equal(cancelled, true, 'cancelJob must return true for active job');

    const result = await jobPromise;
    assert.equal(result.status, 'cancelled', 'Final job status must be cancelled');

    // Verify workspace is deleted
    assert.equal(fs.existsSync(workspaceDir), false, 'Workspace must be deleted after cancellation');
  } finally {
    await worker.stop();
  }
});

test('MeshWorkerService: HTTP API for health and remote job submission', async () => {
  const workspacesRoot = path.join(TEST_TMP_DIR, 'http-workspaces');
  const identityPath = path.join(TEST_TMP_DIR, 'http-identity.json');

  const worker = new MeshWorkerService({
    port: 0,
    workspacesRoot,
    identityPath
  });

  worker.setDeviceStateOverrides({ batteryPct: 95, isCharging: true });
  await worker.start();

  const port = worker.getPort();

  function makeRequest(pathname, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
          }
        },
        (res) => {
          let resData = '';
          res.on('data', (c) => (resData += c));
          res.on('end', () => {
            try {
              resolve({ statusCode: res.statusCode, body: JSON.parse(resData) });
            } catch {
              resolve({ statusCode: res.statusCode, raw: resData });
            }
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  try {
    // 1. Health check
    const health = await makeRequest('/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.deviceId, worker.identity.deviceId);

    // 2. Submit compute job over HTTP POST /api/mesh/jobs
    const submitRes = await makeRequest('/api/mesh/jobs', 'POST', {
      jobId: `http-job-${Date.now()}`,
      workloadType: 'compilation',
      script: 'console.log("HELLO_FROM_HTTP_MESH");'
    });

    assert.equal(submitRes.statusCode, 200);
    assert.equal(submitRes.body.ok, true);
    assert.equal(submitRes.body.status, 'completed');
    assert.match(submitRes.body.stdout, /HELLO_FROM_HTTP_MESH/);
  } finally {
    await worker.stop();
  }
});
