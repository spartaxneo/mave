'use strict';
// Proactive Routines & Workspace Hygiene Plugin for Bigfoot.
// Provides autonomous morning executive briefings, structured folder organization,
// and background hygiene tasks with zero human effort.

const path = require('path');
const os = require('os');
const { getProactiveScheduler } = require('../../routines/proactive_scheduler');
const { resolvePath, assertWritable } = require('../lib/paths');

module.exports = [
  {
    name: 'run_morning_briefing',
    description: 'Generate and deliver a personalized executive morning briefing covering system telemetry, circadian soundtrack recommendations, and daily readiness.',
    input_schema: {
      type: 'object',
      properties: {
        user_name: {
          type: 'string',
          description: 'Name or title to address the user with (default: "Sir").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      ctx.log('info', 'Compiling morning executive briefing...');
      const scheduler = getProactiveScheduler();
      const briefing = await scheduler.generateMorningBriefing(input.user_name || 'Sir');

      return `🌅 **EXECUTIVE MORNING BRIEFING** (${briefing.date}):
• **Time**: ${briefing.time} (${briefing.period})
• **Memory & Hardware**: ${briefing.memoryStats.freeMemGB} GB free of ${briefing.memoryStats.totalMemGB} GB total
• **Circadian Music Taste**: *${briefing.musicRecommendation}*

🎙️ **Spoken Dialogue**:
> "${briefing.spokenBriefing}"`;
    },
  },
  {
    name: 'tidy_workspace_folders',
    description: 'Automatically organize and tidy cluttered folders (e.g. ~/Downloads or Desktop) by sorting files into Documents, Images, Installers, Code, and Archives.',
    input_schema: {
      type: 'object',
      properties: {
        target_directory: {
          type: 'string',
          description: 'Folder path to organize (defaults to user Downloads folder).',
        },
        execute: {
          type: 'boolean',
          description: 'Whether to actually move files (true) or preview the organization plan (false, default).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const targetDir = input.target_directory
        ? resolvePath(input.target_directory)
        : path.join(os.homedir(), 'Downloads');

      const isExecute = input.execute === true;

      if (isExecute) {
        assertWritable(targetDir);
        await ctx.confirm('change', {
          title: 'Organize Folder?',
          message: `Move categorized files into subfolders inside ${path.basename(targetDir)}`,
          confirm: 'Organize Files',
        });
      } else {
        await ctx.confirm('read', {
          title: 'Preview Folder Organization?',
          message: `Scan and plan organization for ${path.basename(targetDir)}`,
          confirm: 'Preview Plan',
        });
      }

      ctx.log('info', `${isExecute ? 'Organizing' : 'Scanning'} directory: ${targetDir}...`);
      const scheduler = getProactiveScheduler();
      const res = scheduler.tidyDirectory(targetDir, isExecute);

      if (res.totalClassified === 0) {
        return `✨ **Directory is already clean**: No unclassified loose files found in \`${targetDir}\`.`;
      }

      const summary = res.plan.slice(0, 15).map((p) =>
        `• \`${p.file}\` ➔ **${p.targetFolder}/**`
      ).join('\n');

      return `🧹 **WORKSPACE HYGIENE ${isExecute ? 'COMPLETED' : 'PLAN'}** (\`${targetDir}\`):
Total files classified: **${res.totalClassified}** ${isExecute ? '(Moved into subfolders)' : '(Dry run preview)'}

${summary}
${res.totalClassified > 15 ? `\n... and ${res.totalClassified - 15} more files` : ''}

${!isExecute ? '\n*To execute this reorganization, run again with `execute: true`.*' : ''}`;
    },
  },
  {
    name: 'configure_proactive_routines',
    description: 'Configure autonomous proactive routines such as morning briefing schedules and automated hygiene triggers.',
    input_schema: {
      type: 'object',
      properties: {
        morning_briefing_enabled: {
          type: 'boolean',
          description: 'Enable or disable the morning briefing voice greeting.',
        },
        auto_hygiene_enabled: {
          type: 'boolean',
          description: 'Enable or disable weekly automated Downloads hygiene.',
        },
        preferred_briefing_hour: {
          type: 'integer',
          description: 'Hour of morning to deliver briefing (e.g. 8 for 8:00 AM).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const scheduler = getProactiveScheduler();
      const current = scheduler.loadSettings();

      if (input.morning_briefing_enabled !== undefined) current.morningBriefingEnabled = input.morning_briefing_enabled;
      if (input.auto_hygiene_enabled !== undefined) current.autoHygieneEnabled = input.auto_hygiene_enabled;
      if (input.preferred_briefing_hour !== undefined) current.briefingHour = input.preferred_briefing_hour;

      scheduler.saveSettings(current);
      ctx.log('info', 'Updated proactive routine configuration.');

      return `⚙️ **PROACTIVE ROUTINES CONFIGURED**:
• Morning Voice Briefing: **${current.morningBriefingEnabled ? `Enabled (at ${current.briefingHour}:00)` : 'Disabled'}**
• Automated Weekly Hygiene: **${current.autoHygieneEnabled ? 'Enabled' : 'Disabled'}**`;
    },
  },
];
