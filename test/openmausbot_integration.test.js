'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { validate } = require('../src/main/plugins/registry');
const cliBridgePlugin = require('../src/main/plugins/builtin/cli_agent_bridge');
const teamPlaybooksPlugin = require('../src/main/plugins/builtin/team_playbooks');
const { speakable, toUtterances } = require('../src/main/local/verbalizer');

const ctx = {
  confirm: async () => true,
  log: () => {},
};

// =========================================================================
// 1. Speech Verbalizer Tests (OpenMausBot speech-text parity)
// =========================================================================
test('speakable converts markdown, code fences, tables, and emojis into natural spoken English', () => {
  const rawMarkdown = `
# System Status 🚀
Here is the code to review:
\`\`\`python
def calculate_metrics(items):
    return sum(items)
\`\`\`
Check out this link: [Project Specs](https://internal.corp.net/specs/v2.html).
| Service | Status | Port |
|---------|--------|------|
| Postgres| UP     | 5432 |
| Redis   | UP     | 6379 |

Please inspect \`C:\\Users\\admin\\workspace\\project\\src\\main\\server.js\` and ensure tests pass! 💯
`;

  const spoken = speakable(rawMarkdown);

  // Assert code fence was converted to descriptive spoken phrase
  assert.ok(spoken.includes('a Python code block'));
  // Assert table was converted to spoken comma list
  assert.ok(spoken.includes('Postgres, UP, 5432'));
  assert.ok(spoken.includes('Redis, UP, 6379'));
  // Assert emojis (🚀, 💯) were removed
  assert.ok(!spoken.includes('🚀'));
  assert.ok(!spoken.includes('💯'));
  // Assert path was shortened
  assert.ok(spoken.includes('server.js'));
  // Assert link was converted
  assert.ok(spoken.includes('Project Specs'));

  // Test toUtterances breath splitting
  const utterances = toUtterances(spoken, { minChars: 10, maxChars: 120 });
  assert.ok(Array.isArray(utterances));
  assert.ok(utterances.length >= 1);
});

// =========================================================================
// 2. Bring-Your-Own-CLI Agent Bridge Tests
// =========================================================================
test('cli_agent_bridge plugin exports valid tools', () => {
  assert.ok(Array.isArray(cliBridgePlugin));
  assert.equal(cliBridgePlugin.length, 2);

  for (const tool of cliBridgePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }
});

test('detect_installed_cli_agents scans PATH for agy, codex, claude, grok, and muse', async () => {
  const detectTool = cliBridgePlugin.find((t) => t.name === 'detect_installed_cli_agents');
  assert.ok(detectTool);

  const res = await detectTool.run({}, ctx);
  assert.ok(res.includes('LOCAL DEVELOPER CLI AGENT ROSTER'));
  assert.ok(res.includes('Google Antigravity CLI'));
  assert.ok(res.includes('OpenAI Codex CLI'));
  assert.ok(res.includes('Anthropic Claude Code CLI'));
  assert.ok(res.includes('xAI Grok CLI'));
  assert.ok(res.includes('Meta Muse CLI'));
});

test('execute_cli_agent_task handles missing binary with clear installation guide', async () => {
  const execTool = cliBridgePlugin.find((t) => t.name === 'execute_cli_agent_task');
  assert.ok(execTool);

  const res = await execTool.run({
    cli_agent: 'agy',
    task_prompt: 'Refactor database models',
  }, ctx);

  assert.ok(res.includes('AGY') || res.includes('Antigravity') || res.includes('EXECUTION'));
});

// =========================================================================
// 3. Multi-Agent Team Playbook Import & Export Tests (OpenMausBot / BotMRR parity)
// =========================================================================
test('team_playbooks plugin exports valid tools', () => {
  assert.ok(Array.isArray(teamPlaybooksPlugin));
  assert.equal(teamPlaybooksPlugin.length, 3);

  for (const tool of teamPlaybooksPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }
});

test('import_agent_team_playbook imports portable Markdown YAML frontmatter', async () => {
  const importTool = teamPlaybooksPlugin.find((t) => t.name === 'import_agent_team_playbook');
  const exportTool = teamPlaybooksPlugin.find((t) => t.name === 'export_agent_team_playbook');
  const listTool = teamPlaybooksPlugin.find((t) => t.name === 'list_agent_teams');

  assert.ok(importTool);
  assert.ok(exportTool);
  assert.ok(listTool);

  const testPlaybookMd = `---
name: "Alpha Strike Engineering"
version: "1.2.0"
lead: "Chief Architect"
description: "High-velocity full-stack engineering squad"
---

# Alpha Strike Engineering Playbook

## Rules of Engagement
1. Write tests before shipping.
2. Maintain clean architecture.
3. Review security vulnerabilities.
`;

  // 1. Import playbook
  const importRes = await importTool.run({
    file_path_or_markdown: testPlaybookMd,
  }, ctx);

  assert.ok(importRes.includes('MULTI-AGENT TEAM IMPORTED SUCCESSFULLY'));
  assert.ok(importRes.includes('Alpha Strike Engineering'));
  assert.ok(importRes.includes('Roster of Specialized Agents'));

  // 2. List teams
  const listRes = await listTool.run({}, ctx);
  assert.ok(listRes.includes('Alpha Strike Engineering'));

  // 3. Export team
  const exportDest = path.join(os.tmpdir(), `alpha_strike_export_${Date.now()}.md`);
  const exportRes = await exportTool.run({
    team_name: 'Alpha Strike Engineering',
    output_path: exportDest,
  }, ctx);

  assert.ok(exportRes.includes('TEAM PLAYBOOK EXPORTED'));
  assert.ok(fs.existsSync(exportDest));

  const exportedContent = fs.readFileSync(exportDest, 'utf8');
  assert.ok(exportedContent.includes('Alpha Strike Engineering'));
  assert.ok(exportedContent.includes('openmausbot-team-v1'));

  try { fs.unlinkSync(exportDest); } catch {}
});
