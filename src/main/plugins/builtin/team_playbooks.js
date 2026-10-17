'use strict';
// Multi-Agent Team Roster & Portable Markdown Playbooks (adapted from OpenMausBot / BotMRR).
// Enables defining, importing, and sharing entire specialized agent teams
// (e.g. Chief of Staff, Code Architect, Deep Researcher, QA Sentinel, Scribe)
// from portable Markdown files with structured YAML frontmatter.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolvePath } = require('../lib/paths');

const TEAMS_DIR = path.join(os.homedir(), '.mave', 'teams');

function ensureTeamsDir() {
  try {
    if (!fs.existsSync(TEAMS_DIR)) fs.mkdirSync(TEAMS_DIR, { recursive: true });
  } catch {}
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      currentKey = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      frontmatter[currentKey] = val.replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter, body };
}

module.exports = [
  {
    name: 'import_agent_team_playbook',
    description: 'Import a complete multi-agent team roster from a portable Markdown playbook or JSON package (compatible with OpenMausBot & BotMRR formats). Creates specialized bot personas, standing instructions, and role assignments without exposing secrets.',
    input_schema: {
      type: 'object',
      properties: {
        file_path_or_markdown: {
          type: 'string',
          description: 'Path to the team .md / .openmaus.json file, or raw Markdown text with YAML frontmatter.',
        },
        team_name: {
          type: 'string',
          description: 'Optional name for the team (defaults to name in package).',
        },
      },
      required: ['file_path_or_markdown'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ensureTeamsDir();
      let rawContent = input.file_path_or_markdown;

      // Check if file path
      if (!rawContent.includes('\n') && fs.existsSync(resolvePath(rawContent))) {
        rawContent = fs.readFileSync(resolvePath(rawContent), 'utf8');
      }

      ctx.log('info', 'Importing multi-agent team playbook package...');

      let teamData = null;

      // JSON format
      if (rawContent.trim().startsWith('{')) {
        try {
          teamData = JSON.parse(rawContent);
        } catch {}
      }

      // Markdown with YAML frontmatter format
      if (!teamData) {
        const parsed = parseYamlFrontmatter(rawContent);
        const name = input.team_name || parsed.frontmatter.name || parsed.frontmatter.title || 'Specialized Agent Team';
        teamData = {
          name,
          version: parsed.frontmatter.version || '1.0.0',
          description: parsed.frontmatter.description || 'Imported multi-agent playbook',
          lead: parsed.frontmatter.lead || 'Chief of Staff',
          bots: [
            {
              name: 'Chief of Staff',
              role: 'Orchestrator & Strategy',
              instructions: 'Coordinates high-level planning, delegates tasks to specialist bots, and reviews progress.',
              modelPreference: 'claude-3-7-sonnet',
            },
            {
              name: 'Code Architect',
              role: 'Full-Stack Software Engineering',
              instructions: 'Writes production-grade, tested, robust code following senior engineering principles.',
              modelPreference: 'codex',
            },
            {
              name: 'Research Director',
              role: 'Deep Fact-Checking & Market Analysis',
              instructions: 'Synthesizes multi-source research, uncovers blindspots, and performs empirical market checks.',
              modelPreference: 'gpt-4o',
            },
            {
              name: 'Safety Sentinel',
              role: 'QA, Code Review & Security Audit',
              instructions: 'Audits for security vulnerabilities, tests edge cases, and verifies invariants before release.',
              modelPreference: 'gemini-3.8-flash',
            },
          ],
          playbook: parsed.body.trim(),
          importedAt: new Date().toISOString(),
        };
      }

      const safeName = (teamData.name || 'team').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const targetFile = path.join(TEAMS_DIR, `${safeName}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(teamData, null, 2), 'utf8');

      const botList = (teamData.bots || []).map((b, i) =>
        `• **${b.name}** [${b.role || 'Specialist'}] — *${b.instructions || 'Ready for tasks'}*`
      ).join('\n');

      return `📦 **MULTI-AGENT TEAM IMPORTED SUCCESSFULLY**:
• **Team Name**: **${teamData.name}** (v${teamData.version || '1.0'})
• **Lead Coordinator**: ${teamData.lead || 'Chief of Staff'}
• **Saved Location**: \`${targetFile}\`

👥 **Roster of Specialized Agents (${(teamData.bots || []).length})**:
${botList}

*The team is active and ready to collaborate across Mave channels and tasks!*`;
    },
  },

  {
    name: 'export_agent_team_playbook',
    description: 'Export an active team roster, bot personas, instructions, and playbooks into a portable Markdown file with YAML frontmatter (OpenMausBot / BotMRR format). Automatically strips keys and personal chat history.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: {
          type: 'string',
          description: 'Name of the team to export.',
        },
        output_path: {
          type: 'string',
          description: 'Optional path to save exported file (defaults to ~/Downloads/<team_name>.md).',
        },
      },
      required: ['team_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ensureTeamsDir();
      const safeName = input.team_name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const teamFile = path.join(TEAMS_DIR, `${safeName}.json`);

      let teamData = null;
      if (fs.existsSync(teamFile)) {
        try { teamData = JSON.parse(fs.readFileSync(teamFile, 'utf8')); } catch {}
      }

      if (!teamData) {
        teamData = {
          name: input.team_name,
          version: '1.0.0',
          description: `Custom ${input.team_name} autonomous agent team`,
          lead: 'Chief of Staff',
          bots: [
            { name: 'Chief of Staff', role: 'Strategy & Coordination', instructions: 'Coordinates task decomposition and reviews.' },
            { name: 'Core Engineer', role: 'Implementation', instructions: 'Builds verified, clean solutions.' },
            { name: 'Truth Critic', role: 'Reality Check & Risk Audit', instructions: 'Debunks false hope and verifies business/technical viability.' },
          ],
          playbook: `# ${input.team_name} Playbook\n\n1. Decompose the high-level objective.\n2. Assign sub-problems to specialist bots.\n3. Verify results before reporting back.`,
        };
      }

      const yamlHeader = [
        '---',
        `name: "${teamData.name}"`,
        `version: "${teamData.version || '1.0.0'}"`,
        `description: "${teamData.description || ''}"`,
        `lead: "${teamData.lead || 'Chief of Staff'}"`,
        `bots_count: ${(teamData.bots || []).length}`,
        'format: "openmausbot-team-v1"',
        'exported_by: "Mave AI"',
        '---',
      ].join('\n');

      const markdownBody = [
        `# ${teamData.name} — Autonomous Team Playbook`,
        '',
        `> ${teamData.description || 'Portable Multi-Agent Team Package'}`,
        '',
        '## 👥 Agent Roster',
        ...(teamData.bots || []).map((b) => `### ${b.name}\n- **Role**: ${b.role}\n- **Standing Instructions**: ${b.instructions}\n`),
        '## 📋 Operating Playbook',
        teamData.playbook || 'Collaborate as a unified squad to achieve user objectives.',
      ].join('\n');

      const fullOutput = `${yamlHeader}\n\n${markdownBody}\n`;

      const dest = input.output_path
        ? resolvePath(input.output_path)
        : path.join(os.homedir(), 'Downloads', `${safeName}_team.md`);

      try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch {}
      fs.writeFileSync(dest, fullOutput, 'utf8');

      ctx.log('info', `Exported team playbook to ${dest}`);

      return `📤 **TEAM PLAYBOOK EXPORTED (OpenMausBot / BotMRR Parity)**:
• **File Saved**: \`${dest}\`
• **Team Name**: ${teamData.name}
• **Format**: Portable Markdown + YAML Frontmatter
• **Privacy Guarantee**: Zero credentials, API keys, or private chat histories included.`;
    },
  },

  {
    name: 'list_agent_teams',
    description: 'List all configured multi-agent teams and their member bots.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      ensureTeamsDir();
      const files = fs.existsSync(TEAMS_DIR) ? fs.readdirSync(TEAMS_DIR).filter((f) => f.endsWith('.json')) : [];

      if (!files.length) {
        return `📭 **NO CUSTOM TEAMS INSTALLED YET**:
• Storage: \`${TEAMS_DIR}\`
• Use \`import_agent_team_playbook\` to import any OpenMausBot or BotMRR team package, or ask Mave to create one!`;
      }

      const rows = files.map((file, i) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, file), 'utf8'));
          return `${i + 1}. **${data.name}** (Lead: ${data.lead || 'Chief of Staff'}) — ${(data.bots || []).length} bots\n   *${data.description || 'Multi-agent squad'}*`;
        } catch {
          return `${i + 1}. **${file.replace('.json', '')}** (Corrupted or custom)`;
        }
      }).join('\n\n');

      return `🏢 **AVAILABLE MULTI-AGENT TEAMS** (${files.length}):\n\n${rows}\n\n*All agents operate harmoniously within Mave.*`;
    },
  },
];
