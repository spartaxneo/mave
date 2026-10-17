const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'electron-debug.log');
const out = fs.openSync(logFile, 'a');

console.log('Spawning electron detached...');
const child = spawn(
  path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
  ['--enable-logging', path.join(__dirname, '..')],
  {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', out, out],
    detached: true,
  }
);

child.unref();
console.log('Spawned detached electron with PID:', child.pid);
process.exit(0);
