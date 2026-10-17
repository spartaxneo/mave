'use strict';
// Filesystem Rollback & Safety Transaction Engine for Bigfoot/Mave.
// Creates point-in-time snapshots of files before destructive commands,
// allowing instant reversal and undo of modified or deleted files.

const fs = require('fs');
const path = require('path');
const os = require('os');

class RollbackEngine {
  constructor(options = {}) {
    const baseDir = process.env.BIGFOOT_PROFILE_DIR || path.join(os.homedir(), '.mave');
    this.snapshotDir = options.snapshotDir || path.join(baseDir, 'rollback-snapshots');
    this.journalFile = options.journalFile || path.join(baseDir, 'rollback-journal.json');
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  _loadJournal() {
    try {
      if (!fs.existsSync(this.journalFile)) return [];
      return JSON.parse(fs.readFileSync(this.journalFile, 'utf8'));
    } catch {
      return [];
    }
  }

  _saveJournal(journal) {
    try {
      fs.writeFileSync(this.journalFile, JSON.stringify(journal.slice(-50), null, 2));
    } catch (err) {
      console.error('Failed to write rollback journal:', err.message);
    }
  }

  /**
   * Create a rollback snapshot for a set of file paths before executing a destructive command.
   */
  snapshot(paths = [], command = '') {
    const targetPaths = Array.isArray(paths) ? paths : [paths];
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const txDir = path.join(this.snapshotDir, txId);
    fs.mkdirSync(txDir, { recursive: true });

    const backedUpFiles = [];

    for (const filePath of targetPaths) {
      try {
        const resolved = path.resolve(filePath);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const safeName = Buffer.from(resolved).toString('hex');
          const backupPath = path.join(txDir, safeName);
          fs.copyFileSync(resolved, backupPath);
          backedUpFiles.push({ original: resolved, backup: backupPath });
        }
      } catch (err) {
        console.warn(`Could not snapshot ${filePath}:`, err.message);
      }
    }

    const tx = {
      id: txId,
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      command: String(command || ''),
      files: backedUpFiles,
      status: 'active'
    };

    const journal = this._loadJournal();
    journal.push(tx);
    this._saveJournal(journal);

    return { txId, snapshotCount: backedUpFiles.length };
  }

  /**
   * Revert and restore all files from a previous snapshot.
   */
  rollback(txId = null) {
    const journal = this._loadJournal();
    if (!journal.length) throw new Error('No rollback snapshots available in journal.');

    const targetTx = txId ? journal.find((j) => j.id === txId) : journal[journal.length - 1];
    if (!targetTx) throw new Error(`Snapshot transaction ${txId} not found.`);

    let restoredCount = 0;
    const errors = [];

    for (const item of targetTx.files) {
      try {
        if (fs.existsSync(item.backup)) {
          const targetDir = path.dirname(item.original);
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
          fs.copyFileSync(item.backup, item.original);
          restoredCount++;
        }
      } catch (err) {
        errors.push({ file: item.original, error: err.message });
      }
    }

    targetTx.status = 'reverted';
    targetTx.revertedAt = Date.now();
    this._saveJournal(journal);

    return {
      ok: true,
      txId: targetTx.id,
      command: targetTx.command,
      restoredCount,
      errors
    };
  }

  /**
   * List recent transactions available for undo.
   */
  listTransactions() {
    return this._loadJournal().map((t) => ({
      id: t.id,
      timestamp: t.iso,
      command: t.command,
      fileCount: t.files.length,
      status: t.status
    }));
  }
}

module.exports = { RollbackEngine };
