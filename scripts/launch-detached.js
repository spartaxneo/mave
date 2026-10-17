const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const pinchtabExe = 'D:\\Bigfoot\\pinchtab\\pinchtab.exe';
const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');

// Launch PinchTab bridge detached
let ptPid = null;
if (fs.existsSync(pinchtabExe)) {
  const pt = spawn(pinchtabExe, ['bridge', '--port', '9867'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  pt.unref();
  ptPid = pt.pid;
}

// Launch Electron detached
const el = spawn(electronExe, [rootDir], {
  cwd: rootDir,
  detached: true,
  stdio: 'ignore',
  env: { ...process.env }
});
el.unref();

console.log(JSON.stringify({ ok: true, pinchtabPid: ptPid, electronPid: el.pid }));
process.exit(0);
