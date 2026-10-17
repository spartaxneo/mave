'use strict';
// Local Developer CLI Agent Bridge (inspired by OpenMausBot / milind-soni/OpenMausBot).
// Directly harnesses local command-line agent tools already installed and logged in on the user's PC:
// 1. Google Antigravity CLI (`agy`)
// 2. OpenAI Codex CLI (`codex`)
// 3. Anthropic Claude Code CLI (`claude`)
// 4. xAI Grok CLI (`grok`)
// 5. Meta Muse CLI (`muse`)
// Allows Mave to delegate tasks to the user's existing developer subscriptions and local sessions.

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runExec(cmd, timeoutMs = 25000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: err ? err.message : null,
      });
    });
  });
}

const SUPPORTED_CLIS = [
  { id: 'agy', name: 'Google Antigravity CLI', bin: 'agy', docs: 'https://github.com/agentclientprotocol/registry/tree/main/antigravity-acp' },
  { id: 'codex', name: 'OpenAI Codex CLI', bin: 'codex', docs: 'https://github.com/openai/codex' },
  { id: 'claude', name: 'Anthropic Claude Code CLI', bin: 'claude', docs: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview' },
  { id: 'grok', name: 'xAI Grok CLI', bin: 'grok', docs: 'https://docs.x.ai' },
  { id: 'muse', name: 'Meta Muse CLI', bin: 'muse', docs: 'https://about.meta.com' },
];

module.exports = [
  {
    name: 'detect_installed_cli_agents',
    description: 'Scan the host computer for installed AI developer CLIs (Google Antigravity `agy`, OpenAI `codex`, Anthropic `claude`, xAI `grok`, and Meta `muse`) to leverage existing user logins and subscriptions (OpenMausBot BYO-CLI parity).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      ctx.log('info', 'Scanning system PATH for local developer CLI agents...');

      const results = [];
      for (const cli of SUPPORTED_CLIS) {
        const findCmd = process.platform === 'win32' ? `where.exe ${cli.bin}` : `which ${cli.bin}`;
        const probe = await runExec(findCmd, 4000);
        if (probe.ok && probe.stdout) {
          const firstPath = probe.stdout.split(/\r?\n/)[0];
          const verProbe = await runExec(`${cli.bin} --version`, 4000);
          results.push({
            ...cli,
            installed: true,
            path: firstPath,
            version: verProbe.stdout || 'Installed',
          });
        } else {
          results.push({
            ...cli,
            installed: false,
            path: null,
            version: 'Not Found in PATH',
          });
        }
      }

      const rows = results.map((r, i) => {
        const status = r.installed ? `✅ **ACTIVE** (\`${r.path}\` · ${r.version})` : '⚪ *Not installed*';
        return `${i + 1}. **${r.name}** (\`${r.bin}\`):\n   ${status}`;
      }).join('\n');

      const installedCount = results.filter((r) => r.installed).length;

      return `🛠️ **LOCAL DEVELOPER CLI AGENT ROSTER** (${installedCount}/${results.length} active):\n\n${rows}\n\n*Use \`execute_cli_agent_task\` to run tasks directly through any active local CLI.*`;
    },
  },

  {
    name: 'execute_cli_agent_task',
    description: 'Execute a coding, research, or execution task through a locally installed developer CLI agent (Google Antigravity `agy`, OpenAI `codex`, Anthropic `claude`, xAI `grok`, or Meta `muse`).',
    input_schema: {
      type: 'object',
      properties: {
        cli_agent: {
          type: 'string',
          enum: ['agy', 'codex', 'claude', 'grok', 'muse'],
          description: 'The local CLI agent binary to execute.',
        },
        task_prompt: {
          type: 'string',
          description: 'The task description or prompt to pass to the CLI agent.',
        },
        working_directory: {
          type: 'string',
          description: 'Optional working directory path (defaults to current project).',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Execution timeout in seconds (default: 60).',
        },
      },
      required: ['cli_agent', 'task_prompt'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const cli = input.cli_agent;
      const prompt = input.task_prompt.replace(/"/g, '\\"');
      const cwd = input.working_directory || process.cwd();
      const timeoutMs = Math.min(180, Number(input.timeout_seconds) || 60) * 1000;

      ctx.log('info', `Harnessing local CLI agent "${cli}" for prompt: ${input.task_prompt.slice(0, 80)}...`);

      // Verify binary is in PATH
      const findCmd = process.platform === 'win32' ? `where.exe ${cli}` : `which ${cli}`;
      const probe = await runExec(findCmd, 3000);

      if (!probe.ok) {
        return `⚠️ **CLI Agent "${cli}" Not Found in System PATH**:
• Mave checked for \`${cli}\` but could not locate the executable.
• **Setup Guide**:
  1. Install ${cli.toUpperCase()} (e.g. \`npm install -g @anthropic-ai/claude-code\` for Claude, \`npm install -g @openai/codex\` for Codex, or \`agy\` for Google Antigravity).
  2. Sign in once in your terminal (\`${cli} login\`).
  3. Mave will automatically detect your local session and route tasks through it!`;
      }

      // Format invocation command based on CLI convention
      let cmd = '';
      if (cli === 'agy') {
        cmd = `agy --prompt "${prompt}"`;
      } else if (cli === 'codex') {
        cmd = `codex exec "${prompt}"`;
      } else if (cli === 'claude') {
        cmd = `claude -p "${prompt}"`;
      } else if (cli === 'grok') {
        cmd = `grok "${prompt}"`;
      } else if (cli === 'muse') {
        cmd = `muse run "${prompt}"`;
      }

      const res = await runExec(`cd "${cwd}" && ${cmd}`, timeoutMs);

      return `🚀 **LOCAL CLI AGENT EXECUTION** (${cli.toUpperCase()}):
• **Command**: \`${cmd.slice(0, 100)}\`
• **Working Directory**: \`${cwd}\`
• **Status**: ${res.ok ? '✅ Completed Successfully' : '⚠️ Exited with Code/Notice'}

\`\`\`
${res.stdout || res.stderr || '(No terminal output returned)'}
\`\`\``;
    },
  },
];
