'use strict';
// Self-Builder Engine for Bigfoot.
// Handles safe code application, child-process validation, test execution,
// and dynamic hot-reloading into PluginRegistry.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { validate } = require('../plugins/registry');

class SelfBuilder {
  constructor(projectRoot = path.resolve(__dirname, '../../..')) {
    this.projectRoot = projectRoot;
  }

  /**
   * Validate proposed code in-memory or via temporary file.
   */
  validatePluginCode(code) {
    const tmpFile = path.join(this.projectRoot, `temp_evolution_${Date.now()}.js`);
    try {
      fs.writeFileSync(tmpFile, code, 'utf8');
      delete require.cache[require.resolve(tmpFile)];
      const mod = require(tmpFile);
      const defs = Array.isArray(mod) ? mod : [mod];
      for (const def of defs) {
        const error = validate(def);
        if (error) return { ok: false, error: `Tool ${def?.name || '(unnamed)'} contract invalid: ${error}` };
      }
      return { ok: true, tools: defs.map((t) => t.name) };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch {}
    }
  }

  /**
   * Run the test suite headlessly to verify no regressions.
   */
  runRegressionTests(timeoutMs = 25000) {
    return new Promise((resolve) => {
      execFile('npm.cmd', ['test'], { cwd: this.projectRoot, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ ok: false, error: stderr || stdout || err.message });
        }
        return resolve({ ok: true, output: stdout });
      });
    });
  }

  /**
   * Deploy the evolutionary patch and hot-reload.
   */
  async deployPatch(targetRelativePath, code, registry = null) {
    const fullPath = path.resolve(this.projectRoot, targetRelativePath);

    // 1. Verify code validity
    const check = this.validatePluginCode(code);
    if (!check.ok) {
      return { success: false, phase: 'validation', error: check.error };
    }

    // 2. Backup if file exists
    let backupPath = null;
    if (fs.existsSync(fullPath)) {
      backupPath = `${fullPath}.bak_${Date.now()}`;
      fs.copyFileSync(fullPath, backupPath);
    }

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, code, 'utf8');

      // 3. Hot-reload into registry if provided
      if (registry && typeof registry.loadUserPlugin === 'function') {
        registry.loadUserPlugin(fullPath);
      }

      return {
        success: true,
        deployedFile: targetRelativePath,
        tools: check.tools,
        backup: backupPath,
      };
    } catch (err) {
      // Revert if write failed
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, fullPath);
        fs.unlinkSync(backupPath);
      }
      return { success: false, phase: 'deployment', error: err.message };
    }
  }
}

let _builder = null;
function getSelfBuilder() {
  if (!_builder) _builder = new SelfBuilder();
  return _builder;
}

module.exports = { SelfBuilder, getSelfBuilder };
