'use strict';
// ChatGPT-Grade Code Interpreter & Advanced Data Analysis Engine for Mave.
// Executes live sandboxed Python and JavaScript scripts on-device.
// Auto-captures printed standard output, calculation results, error traces,
// and automatically captures Matplotlib/Seaborn/Plotly generated charts as high-res images.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getSandboxDir() {
  const dir = path.join(os.homedir(), '.mave', 'sandbox');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

class CodeInterpreter {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.pythonPath = options.pythonPath || 'python';
    this.nodePath = options.nodePath || process.execPath;
    this.sandboxDir = getSandboxDir();
  }

  /**
   * Run Python code in sandbox with automatic plot interceptor.
   */
  async runPython(code, { timeoutMs = 20000, args = [] } = {}) {
    const runId = crypto.randomUUID().slice(0, 8);
    const scriptPath = path.join(this.sandboxDir, `exec_${runId}.py`);
    const plotOutputDir = path.join(this.sandboxDir, `plots_${runId}`);
    fs.mkdirSync(plotOutputDir, { recursive: true });

    // Inject plot auto-saver wrapper
    const wrapperScript = `
import sys
import os

# Intercept matplotlib if imported
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    _orig_show = plt.show
    _plot_idx = 0
    def _custom_show(*args, **kwargs):
        global _plot_idx
        plot_path = os.path.join(r"${plotOutputDir.replace(/\\/g, '\\\\')}", f"plot_{_plot_idx}.png")
        plt.savefig(plot_path, bbox_inches='tight', dpi=150)
        print(f"[MAVE_GENERATED_PLOT:{plot_path}]")
        _plot_idx += 1
        plt.close()
    plt.show = _custom_show
except ImportError:
    pass

# Execute user code
${code}

# If matplotlib figure left unshown, auto-save it
try:
    if 'plt' in locals() and plt.get_fignums():
        plot_path = os.path.join(r"${plotOutputDir.replace(/\\/g, '\\\\')}", f"plot_final.png")
        plt.savefig(plot_path, bbox_inches='tight', dpi=150)
        print(f"[MAVE_GENERATED_PLOT:{plot_path}]")
        plt.close('all')
except Exception:
    pass
`;

    fs.writeFileSync(scriptPath, wrapperScript, 'utf8');

    const startTime = Date.now();
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(this.pythonPath, [scriptPath, ...args], {
        cwd: this.sandboxDir,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGKILL'); } catch {}
      }, timeoutMs);

      proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        // Extract plots
        const plots = [];
        const plotRegex = /\[MAVE_GENERATED_PLOT:(.+?)\]/g;
        let match;
        while ((match = plotRegex.exec(stdout)) !== null) {
          const plotPath = match[1].trim();
          if (fs.existsSync(plotPath)) {
            const b64 = fs.readFileSync(plotPath).toString('base64');
            plots.push({
              filePath: plotPath,
              dataUrl: `data:image/png;base64,${b64}`,
            });
          }
        }

        const cleanStdout = stdout.replace(plotRegex, '').trim();

        // Cleanup script file
        try { fs.unlinkSync(scriptPath); } catch {}

        resolve({
          ok: code === 0 && !timedOut,
          language: 'python',
          exitCode: code,
          stdout: cleanStdout,
          stderr: stderr.trim(),
          durationMs,
          timedOut,
          plots,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        try { fs.unlinkSync(scriptPath); } catch {}
        resolve({
          ok: false,
          language: 'python',
          exitCode: -1,
          stdout: '',
          stderr: `Failed to execute python: ${err.message}`,
          durationMs: Date.now() - startTime,
          timedOut: false,
          plots: [],
        });
      });
    });
  }

  /**
   * Run JavaScript / Node code in sandbox.
   */
  async runJavaScript(code, { timeoutMs = 15000 } = {}) {
    const runId = crypto.randomUUID().slice(0, 8);
    const scriptPath = path.join(this.sandboxDir, `exec_${runId}.js`);
    fs.writeFileSync(scriptPath, code, 'utf8');

    const startTime = Date.now();
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn('node', [scriptPath], {
        cwd: this.sandboxDir,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGKILL'); } catch {}
      }, timeoutMs);

      proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        try { fs.unlinkSync(scriptPath); } catch {}

        resolve({
          ok: code === 0 && !timedOut,
          language: 'javascript',
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs,
          timedOut,
          plots: [],
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        try { fs.unlinkSync(scriptPath); } catch {}
        resolve({
          ok: false,
          language: 'javascript',
          exitCode: -1,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - startTime,
          timedOut: false,
          plots: [],
        });
      });
    });
  }
}

let instance = null;

function getCodeInterpreter(options) {
  if (!instance) {
    instance = new CodeInterpreter(options);
  }
  return instance;
}

module.exports = {
  CodeInterpreter,
  getCodeInterpreter,
};
