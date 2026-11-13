'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDistributedScheduler,
  resetDistributedScheduler,
  DistributedScheduler,
  MeshPolicy,
  APPROVED_WORKLOAD_TYPES,
  DEFAULT_POLICY_SETTINGS
} = require('../src/main/mesh');

test('MeshPolicy: Default settings and updates', () => {
  const policy = new MeshPolicy();
  const settings = policy.exportSettings();

  assert.equal(settings.enableComputeSharing, true);
  assert.equal(settings.shareCpu, true);
  assert.equal(settings.shareGpu, true);
  assert.equal(settings.maxCpuPercent, 75);
  assert.equal(settings.ramAllocationLimitGb, 8);
  assert.equal(settings.minReservedRamGb, 4);
  assert.equal(settings.vramBudgetGb, 6);
  assert.equal(settings.shareOnlyWhileCharging, true);
  assert.equal(settings.minBatteryPercent, 25);
  assert.equal(settings.thermalProtection, true);
  assert.equal(settings.paused, false);

  policy.updateSettings({
    maxCpuPercent: 80,
    shareGpu: false,
    paused: true
  });

  const updated = policy.exportSettings();
  assert.equal(updated.maxCpuPercent, 80);
  assert.equal(updated.shareGpu, false);
  assert.equal(updated.paused, true);
});

test('MeshPolicy: Validation & enforcement rules (battery, charging, idle, thermal, RAM/CPU)', () => {
  const policy = new MeshPolicy();

  // 1. Healthy state
  const healthyState = {
    batteryPct: 80,
    isCharging: true,
    isIdle: true,
    thermalOk: true,
    cpuUsagePercent: 20,
    ramAvailableGb: 16
  };
  const healthyCheck = policy.canAcceptWorkload(healthyState, 'data_processing');
  assert.equal(healthyCheck.accepted, true);
  assert.equal(healthyCheck.ok, true);
  assert.equal(healthyCheck.reason, null);

  // 2. Battery below threshold (20% < 25%)
  const lowBatteryState = { ...healthyState, batteryPct: 20 };
  const lowBatteryCheck = policy.canAcceptWorkload(lowBatteryState, 'testing');
  assert.equal(lowBatteryCheck.accepted, false);
  assert.match(lowBatteryCheck.reason, /Battery level/i);

  // 3. Not charging when policy requires charging
  const unpluggedState = { ...healthyState, batteryPct: 70, isCharging: false };
  const unpluggedCheck = policy.canAcceptWorkload(unpluggedState, 'compilation');
  assert.equal(unpluggedCheck.accepted, false);
  assert.match(unpluggedCheck.reason, /AC charging/i);

  // 4. Idle required
  policy.updateSettings({ shareOnlyWhileIdle: true });
  const activeDeviceState = { ...healthyState, isIdle: false };
  const idleCheck = policy.canAcceptWorkload(activeDeviceState, 'research');
  assert.equal(idleCheck.accepted, false);
  assert.match(idleCheck.reason, /idle state/i);
  policy.updateSettings({ shareOnlyWhileIdle: false });

  // 5. Thermal protection
  const hotState = { ...healthyState, thermalOk: false };
  const thermalCheck = policy.canAcceptWorkload(hotState, 'compilation');
  assert.equal(thermalCheck.accepted, false);
  assert.match(thermalCheck.reason, /thermal throttle/i);

  // 6. CPU usage exceeded
  const busyCpuState = { ...healthyState, cpuUsagePercent: 92 };
  const cpuCheck = policy.canAcceptWorkload(busyCpuState, 'data_processing');
  assert.equal(cpuCheck.accepted, false);
  assert.match(cpuCheck.reason, /CPU usage/i);

  // 7. RAM below reserve limit
  const lowRamState = { ...healthyState, ramAvailableGb: 2 };
  const ramCheck = policy.canAcceptWorkload(lowRamState, 'data_processing');
  assert.equal(ramCheck.accepted, false);
  assert.match(ramCheck.reason, /Available RAM/i);

  // 8. Paused policy
  policy.updateSettings({ paused: true });
  const pausedCheck = policy.canAcceptWorkload(healthyState, 'testing');
  assert.equal(pausedCheck.accepted, false);
  assert.match(pausedCheck.reason, /paused/i);
  policy.updateSettings({ paused: false });

  // 9. Unapproved workload type
  const badTypeCheck = policy.canAcceptWorkload(healthyState, 'unauthorized_miner');
  assert.equal(badTypeCheck.accepted, false);
  assert.match(badTypeCheck.reason, /not approved/i);

  // 10. GPU disabled for AI inference
  policy.updateSettings({ shareGpu: false });
  const gpuCheck = policy.canAcceptWorkload(healthyState, 'ai_inference');
  assert.equal(gpuCheck.accepted, false);
  assert.match(gpuCheck.reason, /GPU sharing is disabled/i);
});

test('DistributedScheduler: Primary host registration & toggle', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });
  assert.equal(scheduler.isPrimaryHost, false);

  let eventFired = false;
  scheduler.on('primary-host-changed', evt => {
    eventFired = true;
    assert.equal(evt.isPrimaryHost, true);
  });

  scheduler.registerDevice({
    deviceId: 'desktop-primary',
    name: 'Master Workstation',
    type: 'desktop',
    resources: { cpuCores: 16, ramGb: 64, gpuModel: 'RTX 4090', vramGb: 24 }
  });

  scheduler.setPrimaryHost(true, 'desktop-primary');
  assert.equal(scheduler.isPrimaryHost, true);
  assert.equal(eventFired, true);

  const topology = scheduler.getMeshTopology();
  assert.equal(topology.isPrimaryHost, true);
  assert.ok(topology.primaryHost);
  assert.equal(topology.primaryHost.deviceId, 'desktop-primary');
});

test('DistributedScheduler: Contributor registration, telemetry updates, and disconnection', () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  const laptop = scheduler.registerDevice({
    deviceId: 'laptop-node-1',
    name: 'MacBook Pro Satellite',
    type: 'laptop',
    resources: {
      cpuCores: 10,
      ramGb: 32,
      gpuModel: 'Apple M3 Pro',
      vramGb: 18,
      batteryPct: 95,
      isCharging: true,
      isIdle: true,
      thermalOk: true
    }
  });

  assert.equal(laptop.deviceId, 'laptop-node-1');
  assert.equal(laptop.status, 'online');
  assert.equal(laptop.resources.batteryPct, 95);

  // Update telemetry
  let telemetryFired = false;
  scheduler.on('telemetry-updated', evt => {
    telemetryFired = true;
    assert.equal(evt.deviceId, 'laptop-node-1');
  });

  scheduler.updateDeviceTelemetry('laptop-node-1', {
    batteryPct: 60,
    isCharging: false,
    cpuUsagePercent: 35
  });

  assert.equal(telemetryFired, true);
  assert.equal(laptop.resources.batteryPct, 60);
  assert.equal(laptop.resources.isCharging, false);

  // Disconnect device
  let disconnectFired = false;
  scheduler.on('device-disconnected', evt => {
    disconnectFired = true;
    assert.equal(evt.deviceId, 'laptop-node-1');
  });

  const ok = scheduler.disconnectDevice('laptop-node-1');
  assert.equal(ok, true);
  assert.equal(disconnectFired, true);
  assert.equal(laptop.status, 'offline');
});

test('DistributedScheduler: Multi-worker coding task execution & output merge', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Register workers for distributed execution
  scheduler.registerDevice({
    deviceId: 'worker-ui',
    name: 'Frontend Builder Node',
    type: 'desktop',
    resources: { cpuCores: 8, ramGb: 32, isCharging: true, thermalOk: true }
  });

  scheduler.registerDevice({
    deviceId: 'worker-api',
    name: 'Backend Microservices Node',
    type: 'desktop',
    resources: { cpuCores: 12, ramGb: 48, isCharging: true, thermalOk: true }
  });

  scheduler.registerDevice({
    deviceId: 'worker-qa',
    name: 'QA & Test Runner Node',
    type: 'desktop',
    resources: { cpuCores: 8, ramGb: 16, isCharging: true, thermalOk: true }
  });

  const taskDef = {
    type: 'coding',
    description: 'Implement Brain Mesh Distributed Scheduler Module',
    files: [
      'src/ui/MeshControlPanel.jsx',
      'src/api/meshRoutes.js',
      'test/mesh_e2e.test.js'
    ]
  };

  const completedResult = await scheduler.scheduleDistributedTask(taskDef);

  assert.ok(completedResult);
  assert.equal(completedResult.status, 'completed');
  assert.equal(completedResult.subtaskCount, 3);
  assert.equal(completedResult.completedCount, 3);

  // Verify subtasks: frontend, backend, test workers
  assert.ok(completedResult.subtaskResults.subtask_frontend);
  assert.ok(completedResult.subtaskResults.subtask_backend);
  assert.ok(completedResult.subtaskResults.subtask_test);

  assert.equal(completedResult.subtaskResults.subtask_frontend.workloadType, 'compilation');
  assert.equal(completedResult.subtaskResults.subtask_backend.workloadType, 'data_processing');
  assert.equal(completedResult.subtaskResults.subtask_test.workloadType, 'testing');

  // Verify file synthesis
  assert.ok(completedResult.filesProcessed.length >= 3);
  assert.ok(completedResult.devicesInvolved.length >= 1);
});

test('DistributedScheduler: Worker failure recovery and automatic re-routing', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Flaky worker that simulates hardware fault
  scheduler.registerDevice({
    deviceId: 'faulty-worker',
    name: 'Unstable Satellite Node',
    type: 'laptop',
    simulateFailure: true,
    resources: { cpuCores: 4, ramGb: 8, isCharging: true, thermalOk: true }
  });

  // Healthy fallback worker
  scheduler.registerDevice({
    deviceId: 'healthy-worker',
    name: 'Reliable Host Worker',
    type: 'desktop',
    simulateFailure: false,
    resources: { cpuCores: 16, ramGb: 64, isCharging: true, thermalOk: true }
  });

  let failedEventFired = false;
  scheduler.on('subtask-failed', evt => {
    failedEventFired = true;
    assert.equal(evt.failedDeviceId, 'faulty-worker');
  });

  const taskDef = {
    type: 'data_processing',
    description: 'Crunch large telemetry dataset',
    files: ['telemetry_dump_01.bin'],
    preferredDeviceId: 'faulty-worker'
  };

  const result = await scheduler.scheduleDistributedTask(taskDef);

  assert.equal(failedEventFired, true);
  assert.equal(result.status, 'completed');
  // Subtask should have recovered on healthy worker
  assert.equal(result.subtaskResults.subtask_main.deviceId, 'healthy-worker');
});

test('DistributedScheduler: Remote AI inference routing and GPU selection', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  // Standard CPU contributor
  scheduler.registerDevice({
    deviceId: 'cpu-worker',
    name: 'Office PC',
    type: 'desktop',
    resources: { cpuCores: 8, ramGb: 16, vramGb: 0, isCharging: true, thermalOk: true }
  });

  // High-end GPU contributor
  scheduler.registerDevice({
    deviceId: 'gpu-server',
    name: 'AI Rig RTX 4090',
    type: 'desktop',
    resources: { cpuCores: 24, ramGb: 128, gpuModel: 'NVIDIA RTX 4090', vramGb: 24, isCharging: true, thermalOk: true }
  });

  // 1. Auto-selection (picks best GPU)
  const autoResult = await scheduler.executeRemoteInference('Summarize distributed mesh architecture', 'llama-3.3-70b');
  assert.equal(autoResult.deviceId, 'gpu-server');
  assert.equal(autoResult.model, 'llama-3.3-70b');
  assert.ok(autoResult.tokensGenerated > 0);
  assert.match(autoResult.output, /RTX 4090/);

  // 2. Explicit target device routing
  const explicitResult = await scheduler.executeRemoteInference('Verify compilation output', 'qwen2.5-coder-7b', 'cpu-worker');
  assert.equal(explicitResult.deviceId, 'cpu-worker');
  assert.equal(explicitResult.status, 'completed');
});

test('DistributedScheduler: Natural language command handling', async () => {
  const scheduler = new DistributedScheduler({ registerLocalDevice: false });

  const desktop = scheduler.registerDevice({
    deviceId: 'primary-desktop',
    name: 'Threadripper Desktop',
    type: 'desktop',
    resources: { cpuCores: 32, ramGb: 128, vramGb: 24, isCharging: true, thermalOk: true }
  });

  const laptop = scheduler.registerDevice({
    deviceId: 'dev-laptop',
    name: 'Lightweight Laptop',
    type: 'laptop',
    resources: { cpuCores: 8, ramGb: 16, batteryPct: 75, isCharging: false, thermalOk: true }
  });

  // 1. "use my desktop for this task"
  const routeCmd = await scheduler.handleNaturalLanguageCommand('use my desktop for this task');
  assert.equal(routeCmd.intent, 'route_desktop');
  assert.equal(routeCmd.success, true);
  assert.equal(routeCmd.targetDeviceId, 'primary-desktop');

  // 2. "save my laptop battery"
  const batteryCmd = await scheduler.handleNaturalLanguageCommand('save my laptop battery');
  assert.equal(batteryCmd.intent, 'save_laptop_battery');
  assert.equal(batteryCmd.success, true);
  assert.equal(laptop.policy.shareOnlyWhileCharging, true);
  assert.equal(laptop.policy.shareCpu, false);

  // 3. "stop sharing my GPU"
  const stopGpuCmd = await scheduler.handleNaturalLanguageCommand('stop sharing my GPU');
  assert.equal(stopGpuCmd.intent, 'stop_sharing_gpu');
  assert.equal(stopGpuCmd.success, true);
  assert.equal(desktop.policy.shareGpu, false);

  // 4. "show which devices are working"
  const workingCmd = await scheduler.handleNaturalLanguageCommand('show which devices are working');
  assert.equal(workingCmd.intent, 'show_working_devices');
  assert.equal(workingCmd.success, true);
  assert.equal(typeof workingCmd.workingDevicesCount, 'number');

  // 5. "distribute this coding task"
  // Re-enable CPU on laptop so there are multiple workers
  laptop.policy.updateSettings({ shareCpu: true, shareOnlyWhileCharging: false });
  const distributeCmd = await scheduler.handleNaturalLanguageCommand('distribute this coding task');
  assert.equal(distributeCmd.intent, 'distribute_coding_task');
  assert.equal(distributeCmd.success, true);
  assert.ok(distributeCmd.taskId);
  assert.equal(distributeCmd.dagResult.status, 'completed');

  // 6. "make this device my primary mave host"
  const hostCmd = await scheduler.handleNaturalLanguageCommand('make this device my primary mave host');
  assert.equal(hostCmd.intent, 'make_primary_host');
  assert.equal(hostCmd.isPrimaryHost, true);
  assert.equal(scheduler.isPrimaryHost, true);
});

test('Mesh: Singleton lifecycle (getDistributedScheduler and resetDistributedScheduler)', () => {
  resetDistributedScheduler();
  const instance1 = getDistributedScheduler({ registerLocalDevice: false });
  const instance2 = getDistributedScheduler();
  assert.equal(instance1, instance2);

  resetDistributedScheduler();
  const instance3 = getDistributedScheduler({ registerLocalDevice: false });
  assert.notEqual(instance1, instance3);
  resetDistributedScheduler();
});
