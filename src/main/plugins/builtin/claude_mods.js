'use strict';
// Claude-Mods Integration Superpowers for Mave.
// Connects Mave to the 112 Agent Skills and diagnostic runbooks from 0xDarkMatter/claude-mods.
// Provides on-demand skill runbooks, automated Windows crash & health triage,
// and process rate diagnostics.

const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const CLAUDE_MODS_ROOT = path.resolve('c:/Users/ryzen/Documents/antigravity/claude-mods');
const SKILLS_DIR = path.join(CLAUDE_MODS_ROOT, 'skills');

function getAvailableSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('_')) {
      const skillMd = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      let desc = '';
      if (fs.existsSync(skillMd)) {
        try {
          const content = fs.readFileSync(skillMd, 'utf8');
          const descMatch = content.match(/description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/i);
          if (descMatch) desc = (descMatch[1] || descMatch[2] || descMatch[3] || '').trim();
        } catch { /* ignore */ }
      }
      skills.push({ name: entry.name, description: desc });
    }
  }
  return skills;
}

module.exports = [
  {
    name: 'claude_mods_list_skills',
    description: 'List or search available expert skills from the claude-mods library (112 skills covering devops, debugging, windows, docker, security, databases, frameworks, testing, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional search keyword to filter skills (e.g., "docker", "windows", "debug", "git", "python", "postgres").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = (input.query || '').toLowerCase().trim();
      const all = getAvailableSkills();
      const filtered = q
        ? all.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
        : all;

      if (!filtered.length) {
        return `No skills found matching "${q}". Total available skills: ${all.length}.`;
      }

      const lines = [
        `### Claude-Mods Skills Library (${filtered.length} matched):`,
        '',
        ...filtered.map((s) => `• **\`${s.name}\`**: ${s.description || 'No description'}`),
        '',
        `💡 *Tip: Call \`claude_mods_get_skill\` with a skill name to retrieve its operational runbook and procedure.*`,
      ];
      return lines.join('\n');
    },
  },

  {
    name: 'claude_mods_get_skill',
    description: 'Retrieve the expert runbook and instructions (SKILL.md) for any skill in the claude-mods library.',
    input_schema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'The exact name of the skill (e.g., "windows-ops", "debug-ops", "docker-ops", "security-ops", "git-ops").',
        },
      },
      required: ['skill_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sName = (input.skill_name || '').trim().toLowerCase();
      const skillPath = path.join(SKILLS_DIR, sName, 'SKILL.md');

      if (!fs.existsSync(skillPath)) {
        return `❌ Skill "${sName}" was not found. Use \`claude_mods_list_skills\` to see all 112 available skills.`;
      }

      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        // Check for scripts directory
        const scriptsDir = path.join(SKILLS_DIR, sName, 'scripts');
        let scriptsList = '';
        if (fs.existsSync(scriptsDir)) {
          const scripts = fs.readdirSync(scriptsDir).filter((f) => !f.startsWith('_'));
          if (scripts.length) {
            scriptsList = `\n\n**Bundled Executable Scripts**: ${scripts.map((s) => `\`${s}\``).join(', ')}`;
          }
        }

        // Limit length to prevent context explosion if huge
        const maxLen = 12000;
        const trimmed = content.length > maxLen
          ? content.slice(0, maxLen) + `\n\n...[Truncated: ${content.length - maxLen} additional characters. Ask for specific sections if needed.]`
          : content;

        return `📖 **Runbook for \`${sName}\`**:${scriptsList}\n\n${trimmed}`;
      } catch (err) {
        return `Failed to read skill ${sName}: ${err.message}`;
      }
    },
  },

  {
    name: 'claude_mods_windows_health',
    description: 'Run the comprehensive Windows Workstation Health Audit from claude-mods windows-ops. Audits hardware errors (WHEA), storage health per disk, recent crash BugCheck codes, runaway resource consumers, and startup inventory.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'How many days back to scan event logs (default: 7).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const days = Number(input.days) || 7;
      const scriptPath = path.join(SKILLS_DIR, 'windows-ops', 'scripts', 'health-audit.ps1');

      if (!fs.existsSync(scriptPath)) {
        return `❌ Script not found at ${scriptPath}`;
      }

      ctx.log('info', `Running Windows Health Audit over past ${days} days...`);

      return new Promise((resolve) => {
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "& '${scriptPath}' -Days ${days}"`;
        exec(cmd, { timeout: 45000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const out = (stdout || '').trim();
          const errOut = (stderr || '').trim();
          if (!out && err) {
            return resolve(`⚠️ Health Audit failed: ${err.message}\n${errOut}`);
          }
          resolve(`🩺 **Windows Health Audit Report (Last ${days} days)**:\n\n${out || errOut}`);
        });
      });
    },
  },

  {
    name: 'claude_mods_process_triage',
    description: 'Identify runaway, hung, or CPU-hogging processes by CPU rate using claude-mods process-triage.',
    input_schema: {
      type: 'object',
      properties: {
        sample_seconds: {
          type: 'number',
          description: 'Duration in seconds to sample CPU rates (default: 5).',
        },
        threshold_percent: {
          type: 'number',
          description: 'Flag processes burning at least this % of one CPU core (default: 15).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sample = Math.max(3, Math.min(30, Number(input.sample_seconds) || 5));
      const threshold = Math.max(5, Math.min(100, Number(input.threshold_percent) || 15));
      const scriptPath = path.join(SKILLS_DIR, 'windows-ops', 'scripts', 'process-triage.ps1');

      if (!fs.existsSync(scriptPath)) {
        return `❌ Script not found at ${scriptPath}`;
      }

      ctx.log('info', `Sampling process CPU rates for ${sample}s (threshold: ${threshold}%)...`);

      return new Promise((resolve) => {
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "& '${scriptPath}' -Sample ${sample} -Threshold ${threshold}"`;
        exec(cmd, { timeout: 40000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const out = (stdout || '').trim();
          if (!out && err) {
            return resolve(`⚠️ Process triage failed: ${err.message}\n${stderr}`);
          }
          resolve(`⚡ **Process CPU Triage Report** (sample: ${sample}s, threshold: ${threshold}%):\n\n${out || 'No processes exceeded CPU threshold.'}`);
        });
      });
    },
  },

  {
    name: 'claude_mods_crash_triage',
    description: 'Decode Windows Event 41 (Kernel-Power) crash records, BugCheck stop codes, and correlated pre-crash timeline.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: {
          type: 'number',
          description: 'How far back to scan for crashes (default: 30 days).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const days = Number(input.days_back) || 30;
      const scriptPath = path.join(SKILLS_DIR, 'windows-ops', 'scripts', 'crash-triage.ps1');

      if (!fs.existsSync(scriptPath)) {
        return `❌ Script not found at ${scriptPath}`;
      }

      ctx.log('info', `Scanning Event 41 crash records for past ${days} days...`);

      return new Promise((resolve) => {
        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "& '${scriptPath}' -DaysBack ${days}"`;
        exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const out = (stdout || '').trim();
          if (!out && err) {
            return resolve(`⚠️ Crash triage check: ${err.message}\n${stderr}`);
          }
          resolve(`💥 **Windows Crash Triage Report (Last ${days} days)**:\n\n${out || 'No Kernel-Power crashes recorded in the specified window.'}`);
        });
      });
    },
  },
];
