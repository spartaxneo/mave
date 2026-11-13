'use strict';

/**
 * MAVE Brain Mesh: Central Module Entrypoint
 * Exports distributed scheduler singleton, policy engine, and constructors.
 */

const { DistributedScheduler } = require('./distributed_scheduler');
const {
  MeshPolicy,
  APPROVED_WORKLOAD_TYPES,
  DEFAULT_POLICY_SETTINGS,
  SCHEDULING_POLICIES,
  createSchedulingPolicyConfig
} = require('./mesh_policies');
const meshProtocol = require('./mesh_protocol');
const { MeshWorkerService } = require('./mesh_worker_service');
const { RemoteWorkerClient } = require('./remote_worker_client');
const { RemoteInferenceProvider } = require('./remote_inference_provider');
const { MeshCodingDistributor } = require('./mesh_coding_distributor');

let _schedulerInstance = null;

/**
 * Returns or initializes the global DistributedScheduler singleton
 * @param {Object} [options]
 * @returns {DistributedScheduler}
 */
function getDistributedScheduler(options = {}) {
  if (!_schedulerInstance) {
    _schedulerInstance = new DistributedScheduler(options);
  }
  return _schedulerInstance;
}

/**
 * Helper to reset singleton instance (useful for isolated unit testing)
 */
function resetDistributedScheduler() {
  _schedulerInstance = null;
}

module.exports = {
  getDistributedScheduler,
  resetDistributedScheduler,
  DistributedScheduler,
  MeshPolicy,
  APPROVED_WORKLOAD_TYPES,
  DEFAULT_POLICY_SETTINGS,
  SCHEDULING_POLICIES,
  createSchedulingPolicyConfig,
  MeshWorkerService,
  RemoteWorkerClient,
  RemoteInferenceProvider,
  MeshCodingDistributor,
  meshProtocol
};
