'use strict';

/**
 * MAVE Brain Mesh: Distributed Resource Policy Engine
 * Provides user-governed resource policies for compute sharing across the device mesh.
 */

const APPROVED_WORKLOAD_TYPES = Object.freeze([
  'compilation',
  'testing',
  'data_processing',
  'ai_inference',
  'research'
]);

const DEFAULT_POLICY_SETTINGS = Object.freeze({
  enableComputeSharing: true,
  shareCpu: true,
  shareGpu: true,
  maxCpuPercent: 75,
  ramAllocationLimitGb: 8,
  minReservedRamGb: 4,
  vramBudgetGb: 6,
  shareOnlyWhileIdle: false,
  shareOnlyWhileCharging: true,
  minBatteryPercent: 25,
  thermalProtection: true,
  gamingPriority: true,
  maxBandwidthMbps: 100,
  localNetworkOnly: true,
  approvedUsers: ['*'],
  approvedWorkloadTypes: APPROVED_WORKLOAD_TYPES,
  paused: false
});

class MeshPolicy {
  /**
   * @param {Object} [initialSettings]
   */
  constructor(initialSettings = {}) {
    this.enableComputeSharing = DEFAULT_POLICY_SETTINGS.enableComputeSharing;
    this.shareCpu = DEFAULT_POLICY_SETTINGS.shareCpu;
    this.shareGpu = DEFAULT_POLICY_SETTINGS.shareGpu;
    this.maxCpuPercent = DEFAULT_POLICY_SETTINGS.maxCpuPercent;
    this.ramAllocationLimitGb = DEFAULT_POLICY_SETTINGS.ramAllocationLimitGb;
    this.minReservedRamGb = DEFAULT_POLICY_SETTINGS.minReservedRamGb;
    this.vramBudgetGb = DEFAULT_POLICY_SETTINGS.vramBudgetGb;
    this.shareOnlyWhileIdle = DEFAULT_POLICY_SETTINGS.shareOnlyWhileIdle;
    this.shareOnlyWhileCharging = DEFAULT_POLICY_SETTINGS.shareOnlyWhileCharging;
    this.minBatteryPercent = DEFAULT_POLICY_SETTINGS.minBatteryPercent;
    this.thermalProtection = DEFAULT_POLICY_SETTINGS.thermalProtection;
    this.gamingPriority = DEFAULT_POLICY_SETTINGS.gamingPriority;
    this.maxBandwidthMbps = DEFAULT_POLICY_SETTINGS.maxBandwidthMbps;
    this.localNetworkOnly = DEFAULT_POLICY_SETTINGS.localNetworkOnly;
    this.approvedUsers = new Set(DEFAULT_POLICY_SETTINGS.approvedUsers);
    this.approvedWorkloadTypes = new Set(DEFAULT_POLICY_SETTINGS.approvedWorkloadTypes);
    this.paused = DEFAULT_POLICY_SETTINGS.paused;

    if (initialSettings && typeof initialSettings === 'object') {
      this.updateSettings(initialSettings);
    }
  }

  /**
   * Update policy settings with a partial patch
   * @param {Object} patch
   * @returns {Object} exported updated settings
   */
  updateSettings(patch = {}) {
    if (!patch || typeof patch !== 'object') {
      return this.exportSettings();
    }

    if (typeof patch.enableComputeSharing === 'boolean') {
      this.enableComputeSharing = patch.enableComputeSharing;
    }
    if (typeof patch.shareCpu === 'boolean') {
      this.shareCpu = patch.shareCpu;
    }
    if (typeof patch.shareGpu === 'boolean') {
      this.shareGpu = patch.shareGpu;
    }
    if (typeof patch.maxCpuPercent === 'number' && !Number.isNaN(patch.maxCpuPercent)) {
      this.maxCpuPercent = Math.max(1, Math.min(100, patch.maxCpuPercent));
    }
    if (typeof patch.ramAllocationLimitGb === 'number' && !Number.isNaN(patch.ramAllocationLimitGb)) {
      this.ramAllocationLimitGb = Math.max(0, patch.ramAllocationLimitGb);
    }
    if (typeof patch.minReservedRamGb === 'number' && !Number.isNaN(patch.minReservedRamGb)) {
      this.minReservedRamGb = Math.max(0, patch.minReservedRamGb);
    }
    if (typeof patch.vramBudgetGb === 'number' && !Number.isNaN(patch.vramBudgetGb)) {
      this.vramBudgetGb = Math.max(0, patch.vramBudgetGb);
    }
    if (typeof patch.shareOnlyWhileIdle === 'boolean') {
      this.shareOnlyWhileIdle = patch.shareOnlyWhileIdle;
    }
    if (typeof patch.shareOnlyWhileCharging === 'boolean') {
      this.shareOnlyWhileCharging = patch.shareOnlyWhileCharging;
    }
    if (typeof patch.minBatteryPercent === 'number' && !Number.isNaN(patch.minBatteryPercent)) {
      this.minBatteryPercent = Math.max(0, Math.min(100, patch.minBatteryPercent));
    }
    if (typeof patch.thermalProtection === 'boolean') {
      this.thermalProtection = patch.thermalProtection;
    }
    if (typeof patch.gamingPriority === 'boolean') {
      this.gamingPriority = patch.gamingPriority;
    }
    if (typeof patch.maxBandwidthMbps === 'number' && !Number.isNaN(patch.maxBandwidthMbps)) {
      this.maxBandwidthMbps = Math.max(1, patch.maxBandwidthMbps);
    }
    if (typeof patch.localNetworkOnly === 'boolean') {
      this.localNetworkOnly = patch.localNetworkOnly;
    }
    if (typeof patch.paused === 'boolean') {
      this.paused = patch.paused;
    }

    if (Array.isArray(patch.approvedUsers) || patch.approvedUsers instanceof Set) {
      this.approvedUsers = new Set(patch.approvedUsers);
    }
    if (Array.isArray(patch.approvedWorkloadTypes) || patch.approvedWorkloadTypes instanceof Set) {
      this.approvedWorkloadTypes = new Set(patch.approvedWorkloadTypes);
    }

    return this.exportSettings();
  }

  /**
   * Export all policy settings as a plain JSON-safe object
   * @returns {Object}
   */
  exportSettings() {
    return {
      enableComputeSharing: this.enableComputeSharing,
      shareCpu: this.shareCpu,
      shareGpu: this.shareGpu,
      maxCpuPercent: this.maxCpuPercent,
      ramAllocationLimitGb: this.ramAllocationLimitGb,
      minReservedRamGb: this.minReservedRamGb,
      vramBudgetGb: this.vramBudgetGb,
      shareOnlyWhileIdle: this.shareOnlyWhileIdle,
      shareOnlyWhileCharging: this.shareOnlyWhileCharging,
      minBatteryPercent: this.minBatteryPercent,
      thermalProtection: this.thermalProtection,
      gamingPriority: this.gamingPriority,
      maxBandwidthMbps: this.maxBandwidthMbps,
      localNetworkOnly: this.localNetworkOnly,
      approvedUsers: Array.from(this.approvedUsers),
      approvedWorkloadTypes: Array.from(this.approvedWorkloadTypes),
      paused: this.paused
    };
  }

  /**
   * Validates whether this device can accept a workload given current device telemetry/state
   * @param {Object} [deviceState]
   * @param {string} [workloadType]
   * @returns {{ accepted: boolean, ok: boolean, reason: string|null, details?: Object }}
   */
  canAcceptWorkload(deviceState = {}, workloadType = 'data_processing') {
    // 1. Check paused state
    if (this.paused) {
      return {
        accepted: false,
        ok: false,
        reason: 'Compute sharing is paused by user policy'
      };
    }

    // 2. Check general compute sharing toggle
    if (!this.enableComputeSharing) {
      return {
        accepted: false,
        ok: false,
        reason: 'Compute sharing is disabled'
      };
    }

    // 3. Approved workload types
    if (workloadType && !this.approvedWorkloadTypes.has(workloadType)) {
      return {
        accepted: false,
        ok: false,
        reason: `Workload type '${workloadType}' is not approved by policy`
      };
    }

    // 4. Hardware component checks (CPU / GPU)
    const requiresGpu = workloadType === 'ai_inference' || !!deviceState.requiresGpu;
    if (requiresGpu && !this.shareGpu) {
      return {
        accepted: false,
        ok: false,
        reason: 'GPU sharing is disabled'
      };
    }

    if (!deviceState.gpuOnly && !this.shareCpu) {
      return {
        accepted: false,
        ok: false,
        reason: 'CPU sharing is disabled'
      };
    }

    // 5. Battery percentage threshold
    if (typeof deviceState.batteryPct === 'number' && !Number.isNaN(deviceState.batteryPct)) {
      if (deviceState.batteryPct < this.minBatteryPercent) {
        return {
          accepted: false,
          ok: false,
          reason: `Battery level (${deviceState.batteryPct}%) is below minimum policy threshold (${this.minBatteryPercent}%)`
        };
      }
    }

    // 6. Charging check
    if (this.shareOnlyWhileCharging) {
      const hasBattery = typeof deviceState.batteryPct === 'number' && !Number.isNaN(deviceState.batteryPct);
      if (hasBattery && deviceState.isCharging === false) {
        return {
          accepted: false,
          ok: false,
          reason: 'Device is running on battery; policy requires AC charging'
        };
      }
    }

    // 7. Idle check
    if (this.shareOnlyWhileIdle) {
      if (deviceState.isIdle === false) {
        return {
          accepted: false,
          ok: false,
          reason: 'Device is active; policy requires idle state'
        };
      }
    }

    // 8. Thermal protection
    if (this.thermalProtection) {
      if (deviceState.thermalOk === false) {
        return {
          accepted: false,
          ok: false,
          reason: 'Thermal protection triggered: device reports thermal throttle'
        };
      }
      if (typeof deviceState.temperatureC === 'number' && deviceState.temperatureC > 85) {
        return {
          accepted: false,
          ok: false,
          reason: `Thermal protection triggered: temperature (${deviceState.temperatureC}C) exceeds safety limit`
        };
      }
    }

    // 9. Gaming priority
    if (this.gamingPriority) {
      if (deviceState.isGaming === true) {
        return {
          accepted: false,
          ok: false,
          reason: 'Gaming priority active: mesh compute suspended during gameplay'
        };
      }
    }

    // 10. CPU utilization threshold
    if (typeof deviceState.cpuUsagePercent === 'number' && !Number.isNaN(deviceState.cpuUsagePercent)) {
      if (deviceState.cpuUsagePercent >= this.maxCpuPercent) {
        return {
          accepted: false,
          ok: false,
          reason: `Current CPU usage (${deviceState.cpuUsagePercent}%) exceeds policy limit (${this.maxCpuPercent}%)`
        };
      }
    }

    // 11. RAM availability threshold
    if (typeof deviceState.ramAvailableGb === 'number' && !Number.isNaN(deviceState.ramAvailableGb)) {
      if (deviceState.ramAvailableGb < this.minReservedRamGb) {
        return {
          accepted: false,
          ok: false,
          reason: `Available RAM (${deviceState.ramAvailableGb} GB) is below minimum reserved threshold (${this.minReservedRamGb} GB)`
        };
      }
    }

    // 12. Local network only check
    if (this.localNetworkOnly) {
      if (deviceState.isLocalNetwork === false) {
        return {
          accepted: false,
          ok: false,
          reason: 'Workload originates outside authorized local network'
        };
      }
    }

    // 13. Approved users check
    const requestingUser = deviceState.user || deviceState.userId;
    if (requestingUser) {
      if (!this.approvedUsers.has('*') && !this.approvedUsers.has(requestingUser)) {
        return {
          accepted: false,
          ok: false,
          reason: `User '${requestingUser}' is not authorized to submit workloads`
        };
      }
    }

    // Passed all policy checks
    return {
      accepted: true,
      ok: true,
      reason: null,
      details: {
        workloadType,
        deviceState
      }
    };
  }

  /**
   * Convenient boolean-only check
   */
  isWorkloadAcceptable(deviceState, workloadType) {
    return this.canAcceptWorkload(deviceState, workloadType).accepted;
  }
}

/**
 * 8 Canonical User-Configurable Resource Policies (Section 4)
 */
const SCHEDULING_POLICIES = Object.freeze({
  CENTRAL_HOST: 'central_host',
  MAXIMUM_PERFORMANCE: 'maximum_performance',
  BATTERY_PRESERVATION: 'battery_preservation',
  BALANCED: 'balanced',
  HOST_PRIORITY: 'host_priority',
  MANUAL_ALLOCATION: 'manual_allocation',
  LOCAL_ONLY: 'local_only',
  CUSTOM: 'custom'
});

/**
 * Creates preset policy configuration for canonical scheduling modes
 * @param {string} policyName
 * @param {Object} [customOverrides]
 * @returns {Object}
 */
function createSchedulingPolicyConfig(policyName, customOverrides = {}) {
  switch (policyName) {
    case SCHEDULING_POLICIES.CENTRAL_HOST:
      return {
        policy: SCHEDULING_POLICIES.CENTRAL_HOST,
        description: 'The selected central host coordinates workloads from connected devices',
        allowRemoteDispatch: true,
        hostPriority: true,
        strictAcPower: false,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.MAXIMUM_PERFORMANCE:
      return {
        policy: SCHEDULING_POLICIES.MAXIMUM_PERFORMANCE,
        description: 'Greedily dispatches workloads to the highest-compute node (GPU VRAM / CPU cores)',
        allowRemoteDispatch: true,
        greedyHorsepower: true,
        strictAcPower: false,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.BATTERY_PRESERVATION:
      return {
        policy: SCHEDULING_POLICIES.BATTERY_PRESERVATION,
        description: 'Prefers plugged-in devices; strictly excludes battery-powered discharging nodes from heavy jobs',
        allowRemoteDispatch: true,
        strictAcPower: true,
        minBatteryThreshold: 35,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.BALANCED:
      return {
        policy: SCHEDULING_POLICIES.BALANCED,
        description: 'Distributes workloads balancing capacity, performance, power, and network conditions',
        allowRemoteDispatch: true,
        strictAcPower: false,
        balanceRatio: 0.5,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.HOST_PRIORITY:
      return {
        policy: SCHEDULING_POLICIES.HOST_PRIORITY,
        description: 'Prefers the designated central computer; only offloads when host is insufficient or worker is better suited',
        allowRemoteDispatch: true,
        preferPrimaryHost: true,
        offloadCpuThresholdPercent: 70,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.MANUAL_ALLOCATION:
      return {
        policy: SCHEDULING_POLICIES.MANUAL_ALLOCATION,
        description: 'Strictly enforces per-device limits and explicit task type permissions set by the user',
        allowRemoteDispatch: true,
        enforceManualAllowlist: true,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.LOCAL_ONLY:
      return {
        policy: SCHEDULING_POLICIES.LOCAL_ONLY,
        description: 'Executes workloads strictly on the local machine; zero remote dispatch to other devices',
        allowRemoteDispatch: false,
        ...customOverrides
      };

    case SCHEDULING_POLICIES.CUSTOM:
    default:
      return {
        policy: SCHEDULING_POLICIES.CUSTOM,
        description: 'Custom user-defined rules, thresholds, and scheduling weights',
        allowRemoteDispatch: true,
        ...customOverrides
      };
  }
}

module.exports = {
  MeshPolicy,
  APPROVED_WORKLOAD_TYPES,
  DEFAULT_POLICY_SETTINGS,
  SCHEDULING_POLICIES,
  createSchedulingPolicyConfig
};
