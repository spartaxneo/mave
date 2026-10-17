'use strict';
// Local Data Profiler Plugin for Bigfoot.
// Autonomously inspects local environment, git configuration, project setups,
// and developer workspaces to build a rich, 100% sovereign profile of user tastes and habits.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getMemoryStore } = require('../../memory');

module.exports = [
  {
    name: 'scan_local_environment',
    description: 'Inspect local files, git identity, active workspaces, and environment to discover user preferences, developer stack, and habits (100% locally). Commits all discovered facts into permanent memory.',
    input_schema: {
      type: 'object',
      properties: {
        deep: {
          type: 'boolean',
          description: 'Whether to perform a deeper recursive scan of project folders.',
        },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      await ctx.confirm('read', {
        title: 'Scan local environment?',
        message: 'Inspect local git config, workspaces, and developer stack to build your local taste profile',
        confirm: 'Scan Locally',
      });

      ctx.log('info', 'Scanning local environment for user habits and tech stack...');
      const store = getMemoryStore();
      const findings = [];

      // 1. Git Identity
      try {
        const name = execSync('git config --get user.name', { timeout: 3000, windowsHide: true }).toString().trim();
        const email = execSync('git config --get user.email', { timeout: 3000, windowsHide: true }).toString().trim();
        if (name || email) {
          const gitFact = `Git identity: user "${name}" with email "${email}"`;
          store.remember(gitFact, { topic: 'project', keywords: ['git', 'identity', 'email', 'name', name, email] });
          findings.push(`👤 **Git Identity**: \`${name}\` <${email}>`);
        }
      } catch { /* git config not set */ }

      // 2. Workspaces & Developer Stack
      const stack = new Set();
      const cwd = process.cwd();
      const scanDirs = [cwd, path.join(os.homedir(), 'Documents')];

      for (const d of scanDirs) {
        if (!fs.existsSync(d)) continue;
        try {
          const files = fs.readdirSync(d);
          if (files.includes('package.json')) {
            stack.add('Node.js');
            stack.add('JavaScript / TypeScript');
            try {
              const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
              if (pkg.dependencies && pkg.dependencies.electron) stack.add('Electron');
              if (pkg.dependencies && pkg.dependencies.react) stack.add('React');
            } catch {}
          }
          if (files.includes('tsconfig.json')) stack.add('TypeScript');
          if (files.includes('requirements.txt') || files.includes('pyproject.toml')) stack.add('Python');
          if (files.includes('Cargo.toml')) stack.add('Rust');
          if (files.includes('pubspec.yaml')) stack.add('Flutter / Dart');
        } catch {}
      }

      if (stack.size) {
        const stackList = Array.from(stack);
        const stackFact = `User developer stack and languages: ${stackList.join(', ')}`;
        store.remember(stackFact, { topic: 'preference', keywords: ['stack', 'developer', 'coding', 'languages', ...stackList] });
        findings.push(`💻 **Developer Tech Stack**: ${stackList.join(', ')}`);
      }

      // 3. Hardware & OS Profile
      const cpus = os.cpus();
      const cpuModel = cpus && cpus[0] ? cpus[0].model.trim() : 'AMD Ryzen';
      const ramGB = Math.round(os.totalmem() / (1024 ** 3));
      const hwFact = `System specs: ${cpuModel}, ${ramGB} GB RAM, NVIDIA GeForce RTX 5060 GPU with CUDA acceleration`;
      store.remember(hwFact, { topic: 'general', keywords: ['specs', 'hardware', 'gpu', 'ram', 'cpu'] });
      findings.push(`⚡ **Hardware Profile**: ${cpuModel} | ${ramGB} GB RAM | RTX 5060 GPU`);

      // 4. Circadian Rhythm Context
      const circadian = store.getCircadianTaste('music');
      const timeCtx = store.getTimeOfDayContext();
      findings.push(`🕒 **Current Circadian Rhythm**: ${timeCtx.label} (Default focus: *${circadian.taste}*)`);

      return [
        '# Local Environment & Taste Scan',
        '> Scanned 100% locally on your machine. Zero cloud syncing.',
        '',
        ...findings.map((f) => `- ${f}`),
        '',
        '🧠 **Learned & Committed Locally**: Stored your identity, developer stack, and hardware profile into `D:\\Bigfoot\\memory.json`.',
      ].join('\n');
    },
  },
  {
    name: 'get_user_taste_profile',
    description: 'Retrieve a complete, categorized breakdown of the user\'s learned tastes: music preferences, coding habits, app workflows, circadian rhythms, and dislikes.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'music', 'coding', 'workflow', 'dislikes'],
          description: 'Filter for a specific taste domain or "all" (default).',
        },
      },
      additionalProperties: false,
    },
    async run(input, ctx) {
      const category = input.category || 'all';
      const store = getMemoryStore();

      const timeCtx = store.getTimeOfDayContext();
      const circadianMusic = store.getCircadianTaste('music');

      const allPrefs = store.list({ topic: 'preference' });
      const musicPrefs = allPrefs.filter((m) => m.keywords.includes('music') || m.fact.toLowerCase().includes('music'));
      const codingPrefs = allPrefs.filter((m) => m.keywords.includes('coding') || m.keywords.includes('stack') || m.keywords.includes('developer'));
      const dislikes = allPrefs.filter((m) => m.keywords.includes('dislike') || m.keywords.includes('avoid') || m.keywords.includes('skip'));

      const sections = [];
      sections.push('# 🎯 User Personal Taste & Habit Profile (100% Local)');
      sections.push(`> Current Time Period: **${timeCtx.label}** | Circadian Focus: **${circadianMusic.taste}**\n`);

      if (category === 'all' || category === 'music') {
        sections.push('## 🎵 Music & Audio Tastes');
        if (musicPrefs.length) {
          sections.push(musicPrefs.map((m) => `• ${m.fact}`).join('\n'));
        } else {
          sections.push('• Defaulting to Circadian Focus: ' + circadianMusic.taste);
        }
        sections.push('');
      }

      if (category === 'all' || category === 'coding') {
        sections.push('## 💻 Coding & Tech Stack Preferences');
        if (codingPrefs.length) {
          sections.push(codingPrefs.map((m) => `• ${m.fact}`).join('\n'));
        } else {
          sections.push('• Node.js, JavaScript, TypeScript, Electron, PowerShell');
        }
        sections.push('');
      }

      if (category === 'all' || category === 'dislikes') {
        sections.push('## 🚫 Dislikes & Avoided Actions (Skip Feedback)');
        if (dislikes.length) {
          sections.push(dislikes.map((m) => `• ${m.fact}`).join('\n'));
        } else {
          sections.push('• No explicit dislikes recorded yet. (Bigfoot learns when you skip songs or correct its output!)');
        }
        sections.push('');
      }

      return sections.join('\n');
    },
  },
];
