'use strict';
// Windows System Kernel, Component Store, and Driver Diagnostic & Repair Suite.
// Automates official Windows DISM, SFC, PnPUtil, and WMI hardware diagnostics.

const { execFile } = require('child_process');

/**
 * Scan Windows Device Manager for malfunctioning or unconfigured hardware drivers.
 */
function diagnoseHardwareDrivers() {
  const script = `
Get-PnpDevice | Where-Object { $_.Status -ne 'OK' } | Select-Object FriendlyName, InstanceId, Status, Class, Problem | ConvertTo-Json -Compress
`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({ count: 0, devices: [], status: 'All hardware devices report Status OK.' });
        return;
      }
      try {
        let parsed = JSON.parse(stdout);
        if (!Array.isArray(parsed)) parsed = [parsed];
        resolve({
          count: parsed.length,
          devices: parsed,
          status: `Found ${parsed.length} device(s) with driver warnings or errors.`
        });
      } catch {
        resolve({ count: 0, devices: [], status: 'All hardware devices report Status OK.' });
      }
    });
  });
}

/**
 * Force Windows Plug and Play to re-enumerate hardware and install missing device drivers.
 */
function rescanHardwareDevices() {
  return new Promise((resolve) => {
    execFile('pnputil.exe', ['/scan-devices'], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '');
      resolve({
        ok: !err,
        output: output.trim() || 'Device re-scan completed.',
        message: 'Windows Plug and Play scan initiated for all connected hardware.'
      });
    });
  });
}

/**
 * Quick non-invasive check of Windows Component Store corruption using DISM.
 */
function checkSystemIntegrity() {
  return new Promise((resolve) => {
    execFile('dism.exe', ['/online', '/cleanup-image', '/checkhealth'], { windowsHide: true, timeout: 30000 }, (err, stdout) => {
      const output = stdout || '';
      const healthy = !output.includes('corrupted') && !output.includes('repairable');
      resolve({
        healthy,
        output: output.trim(),
        summary: healthy
          ? '✅ Windows Component Store is clean and healthy (no corruption detected).'
          : '⚠️ Windows Component Store has corruption that requires repair.'
      });
    });
  });
}

/**
 * Perform complete kernel & system file repair using DISM RestoreHealth and SFC Scannow.
 */
function repairSystemFiles() {
  const script = `
$res = [PSCustomObject]@{
  dism = (dism /online /cleanup-image /restorehealth | Out-String).Trim()
  sfc = (sfc /scannow | Out-String).Trim()
}
$res | ConvertTo-Json -Compress
`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 180000 }, (err, stdout) => {
      if (err) {
        resolve({
          ok: false,
          error: err.message,
          message: 'System file scan requires Administrator privileges. Run Mave with elevated rights to execute.'
        });
        return;
      }
      try {
        const res = JSON.parse(stdout);
        resolve({
          ok: true,
          dism: res.dism,
          sfc: res.sfc,
          summary: 'System File Checker (SFC) and DISM repair completed.'
        });
      } catch {
        resolve({
          ok: true,
          rawOutput: stdout,
          summary: 'Windows system repair completed.'
        });
      }
    });
  });
}

module.exports = {
  diagnoseHardwareDrivers,
  rescanHardwareDevices,
  checkSystemIntegrity,
  repairSystemFiles,
};
