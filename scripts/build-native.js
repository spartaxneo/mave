'use strict';
// Compiles the native input helper (src/main/native/InputHelper.cs) with the C# compiler that ships
// with Windows. Runs before `npm start` and `npm run dist`; skips the work when the exe is current.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'main', 'native');
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

if (process.platform === 'win32') {
  const source = path.join(dir, 'InputHelper.cs');
  const exe = path.join(dir, 'input-helper.exe');
  const fw = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');

  if (mtime(exe) >= mtime(source) && !process.argv.includes('--force')) process.exit(0);

  const winmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WinMetadata');
  execFileSync(path.join(fw, 'csc.exe'), [
    '-nologo', '-optimize', '-target:exe', `-lib:${path.join(fw, 'WPF')}`,
    '-r:System.Speech.dll', '-r:UIAutomationClient.dll', '-r:UIAutomationTypes.dll', '-r:WindowsBase.dll',
    '-r:System.Windows.Forms.dll', '-r:Microsoft.CSharp.dll', '-r:System.Core.dll',
    `-r:${path.join(fw, 'System.Runtime.dll')}`, `-r:${path.join(fw, 'System.Runtime.WindowsRuntime.dll')}`,
    `-r:${path.join(winmd, 'Windows.Foundation.winmd')}`, `-r:${path.join(winmd, 'Windows.UI.winmd')}`,
    `-out:${exe}`, source,
  ], { stdio: 'inherit' });
  console.log('Built src/main/native/input-helper.exe');
} else if (process.platform === 'darwin') {
  const source = path.join(dir, 'MacInputHelper.swift');
  const bin = path.join(dir, 'mac-input-helper');
  if (mtime(bin) >= mtime(source) && !process.argv.includes('--force')) process.exit(0);

  try {
    execFileSync('swiftc', [source, '-O', '-o', bin], { stdio: 'inherit' });
    console.log('Built src/main/native/mac-input-helper');
  } catch (err) {
    console.warn('Could not compile MacInputHelper.swift (requires Xcode Command Line Tools):', err.message);
  }
} else if (process.platform === 'linux') {
  const script = path.join(dir, 'linux-input-helper');
  const pyScript = path.join(dir, 'LinuxInputHelper.py');
  try {
    fs.chmodSync(script, 0o755);
    fs.chmodSync(pyScript, 0o755);
    console.log('Configured executable permissions for Linux input helper');
  } catch (err) {
    console.warn('Could not set permissions for linux input helper:', err.message);
  }
}
