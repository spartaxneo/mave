const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'pinchtab-debug.log');
const out = fs.openSync(logFile, 'a');

console.log('Spawning pinchtab detached...');
const child = spawn(
  'D:\\Bigfoot\\pinchtab\\pinchtab.exe',
  ['bridge', '--port', '9867'],
  {
    stdio: ['ignore', out, out],
    detached: true,
    windowsHide: true,
  }
);

child.unref();
console.log('Spawned detached pinchtab with PID:', child.pid);
process.exit(0);
