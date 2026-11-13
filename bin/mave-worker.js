#!/usr/bin/env node
'use strict';

/**
 * MAVE Brain Mesh: Standalone Worker CLI Entrypoint
 * Command-line runner for the independent MAVE compute worker daemon.
 *
 * Usage:
 *   node bin/mave-worker.js --port 50065 --primary-host 127.0.0.1:4045 --pin 123456
 */

const fs = require('fs');
const path = require('path');
const { MeshWorkerService } = require('../src/main/mesh/mesh_worker_service');

function parseArgs(args) {
  const options = {
    port: 50065,
    host: '0.0.0.0',
    primaryHost: null,
    pin: null,
    name: null,
    identityPath: null,
    workspacesRoot: null,
    policySettings: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--port' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!Number.isNaN(val)) options.port = val;
    } else if (arg === '--host') {
      options.host = args[++i];
    } else if (arg === '--primary-host') {
      options.primaryHost = args[++i];
    } else if (arg === '--pin') {
      options.pin = args[++i];
    } else if (arg === '--name') {
      options.name = args[++i];
    } else if (arg === '--identity-path' || arg === '--identity') {
      options.identityPath = args[++i];
    } else if (arg === '--workspaces-root' || arg === '--workspaces') {
      options.workspacesRoot = args[++i];
    } else if (arg === '--policy') {
      const policyArg = args[++i];
      try {
        if (policyArg && fs.existsSync(policyArg)) {
          options.policySettings = JSON.parse(fs.readFileSync(policyArg, 'utf8'));
        } else if (policyArg) {
          options.policySettings = JSON.parse(policyArg);
        }
      } catch (err) {
        console.error(`[MAVE-WORKER] Warning: Failed to parse policy JSON: ${err.message}`);
      }
    }
  }

  return options;
}

function printUsage() {
  console.log(`
MAVE Brain Mesh - Standalone Worker Daemon

Usage:
  node bin/mave-worker.js [options]

Options:
  --port, -p <port>           Port to listen on (default: 50065)
  --host <ip>                 Host/IP interface to bind (default: 0.0.0.0)
  --primary-host <host:port>  Address of Primary MAVE Host to pair with
  --pin <pin>                 Pre-shared pairing PIN or auth token
  --name <name>               Worker node display name
  --identity-path <path>      Path to persistent identity file
  --workspaces-root <path>    Root directory for isolated job execution workspaces
  --policy <file|json>        Path to policy config JSON or inline JSON
  --help, -h                  Display this help message
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  console.log('===========================================================');
  console.log('   MAVE BRAIN MESH - STANDALONE COMPUTE WORKER DAEMON     ');
  console.log('===========================================================');

  const worker = new MeshWorkerService({
    port: options.port,
    host: options.host,
    primaryHost: options.primaryHost,
    pin: options.pin,
    name: options.name,
    identityPath: options.identityPath,
    workspacesRoot: options.workspacesRoot,
    policySettings: options.policySettings
  });

  // Handle clean shutdown on signals
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[MAVE-WORKER] Received ${signal}. Shutting down worker gracefully...`);
    try {
      await worker.stop();
      console.log('[MAVE-WORKER] Worker stopped successfully. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('[MAVE-WORKER] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await worker.start();

    console.log(`[MAVE-WORKER] Status:        ONLINE`);
    console.log(`[MAVE-WORKER] Device ID:     ${worker.identity.deviceId}`);
    console.log(`[MAVE-WORKER] Fingerprint:   ${worker.identity.fingerprint}`);
    console.log(`[MAVE-WORKER] Listening on:  http://${options.host}:${worker.getPort()}`);
    console.log(`[MAVE-WORKER] Workspaces:    ${worker.workspacesRoot}`);
    console.log(`[MAVE-WORKER] Policy:        Compute Sharing=${worker.policy.enableComputeSharing}, CPU=${worker.policy.shareCpu}, MaxCPU=${worker.policy.maxCpuPercent}%`);

    if (options.primaryHost) {
      console.log(`[MAVE-WORKER] Pairing with Primary Host: ${options.primaryHost}`);
    }

    console.log('-----------------------------------------------------------');
    console.log('Ready for compute workloads. Press Ctrl+C to terminate.');
  } catch (err) {
    console.error(`[MAVE-WORKER] Failed to start worker: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, printUsage };
