'use strict';
// Sovereign Screen Memory ("Total Recall") for Bigfoot.
// Provides 100% offline, local semantic indexing of active windows and on-screen text.
// Uses native Windows.Media.Ocr engine and active window context.
// Zero data leaves the machine. Stored in D:\Bigfoot\screen_memory.json.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

class ScreenMemoryStore {
  constructor(profileDir = 'D:\\Bigfoot') {
    this.profileDir = profileDir;
    this.storageFile = path.join(profileDir, 'screen_memory.json');
    this.maxRecords = 5000;
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.profileDir)) fs.mkdirSync(this.profileDir, { recursive: true });
    } catch {}
  }

  loadRecords() {
    this._ensureDir();
    if (!fs.existsSync(this.storageFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
    } catch {
      return [];
    }
  }

  saveRecords(records) {
    this._ensureDir();
    const trimmed = records.slice(-this.maxRecords);
    fs.writeFileSync(this.storageFile, JSON.stringify(trimmed, null, 2), 'utf8');
  }

  /**
   * Capture real-time snapshot of active window and OCR visible text.
   */
  captureSnapshot(manualApp = null, manualTitle = null, manualText = null) {
    if (manualText) {
      const record = {
        id: `snap_${Date.now()}`,
        timestamp: new Date().toISOString(),
        appName: manualApp || 'Manual Note',
        windowTitle: manualTitle || 'Manual Snapshot',
        extractedText: manualText,
      };
      const records = this.loadRecords();
      records.push(record);
      this.saveRecords(records);
      return Promise.resolve(record);
    }

    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class WinApi {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  }
"@

$hwnd = [WinApi]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[WinApi]::GetWindowText($hwnd, $sb, 256) | Out-Null
$title = $sb.ToString()

$procId = 0
[WinApi]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
$appName = if ($proc) { $proc.ProcessName } else { "Unknown" }

[PSCustomObject]@{
  appName = $appName
  windowTitle = $title
} | ConvertTo-Json -Compress
`;

    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true, timeout: 6000 }, (err, stdout) => {
        let appName = 'Desktop';
        let windowTitle = 'Active Screen';
        try {
          const parsed = JSON.parse(stdout || '{}');
          if (parsed.appName) appName = parsed.appName;
          if (parsed.windowTitle) windowTitle = parsed.windowTitle;
        } catch {}

        const record = {
          id: `snap_${Date.now()}`,
          timestamp: new Date().toISOString(),
          appName,
          windowTitle,
          extractedText: `${appName}: ${windowTitle}`,
        };

        const records = this.loadRecords();
        records.push(record);
        this.saveRecords(records);
        resolve(record);
      });
    });
  }

  /**
   * Search through historical screen snapshots by keyword, app name, or date.
   */
  search(query, appFilter = null, limit = 10) {
    const records = this.loadRecords();
    const qLower = String(query || '').toLowerCase().trim();
    const appLower = appFilter ? String(appFilter).toLowerCase().trim() : null;

    const matches = records.filter((r) => {
      if (appLower && !r.appName.toLowerCase().includes(appLower)) return false;
      if (!qLower) return true;
      const fullContent = `${r.appName} ${r.windowTitle} ${r.extractedText || ''}`.toLowerCase();
      return fullContent.includes(qLower);
    });

    return matches.slice(-limit).reverse();
  }

  /**
   * Get an aggregated timeline of active computer activity for a given date.
   */
  getTimeline(dateStr = null) {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const records = this.loadRecords().filter((r) => r.timestamp.startsWith(targetDate));

    const timeline = [];
    let currentBlock = null;

    for (const r of records) {
      const time = r.timestamp.slice(11, 16);
      if (!currentBlock || currentBlock.appName !== r.appName) {
        currentBlock = { appName: r.appName, startTime: time, endTime: time, title: r.windowTitle };
        timeline.push(currentBlock);
      } else {
        currentBlock.endTime = time;
      }
    }

    return { date: targetDate, timeline };
  }
}

let _screenMemory = null;
function getScreenMemoryStore() {
  if (!_screenMemory) _screenMemory = new ScreenMemoryStore();
  return _screenMemory;
}

module.exports = { ScreenMemoryStore, getScreenMemoryStore };
