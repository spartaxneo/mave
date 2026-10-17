'use strict';
// Autonomous Meeting Executive Co-Pilot & Real-Time Whisper Plugin for Mave.

const { getMeetingCopilot } = require('../../meeting/meeting_copilot');

module.exports = [
  {
    name: 'meeting_set_agenda_pacing',
    description: 'Sets an agenda structure and time targets for an upcoming or active meeting to track discussion pacing.',
    input_schema: {
      type: 'object',
      properties: {
        agenda_topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              minutes: { type: 'number' },
            },
            required: ['title'],
          },
          description: 'List of topics with allocated minutes.',
        },
        total_minutes: { type: 'number', description: 'Total meeting duration in minutes (e.g. 30, 45, 60).' },
      },
      required: ['agenda_topics'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const copilot = getMeetingCopilot();
      ctx.log('info', 'Configuring meeting agenda and pacing targets...');

      const agenda = copilot.setAgenda(input.agenda_topics, input.total_minutes || 60);
      const itemsFormatted = agenda.items.map(it => `• [${it.allocatedMinutes}m] **${it.title}**`).join('\n');

      return `⏱️ **MEETING AGENDA PACING CONFIGURED** (${agenda.totalAllocatedMinutes}m total):
${itemsFormatted}
*Mave will proactively whisper pacing alerts when topic time limits are approached.*`;
    },
  },

  {
    name: 'meeting_check_live_pacing',
    description: 'Checks elapsed time against the active agenda topic and returns whisper pacing feedback.',
    input_schema: {
      type: 'object',
      properties: {
        current_topic_index: { type: 'number', description: '0-based index of current agenda topic.' },
        elapsed_minutes: { type: 'number', description: 'Minutes elapsed since meeting started.' },
      },
      required: ['current_topic_index', 'elapsed_minutes'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const copilot = getMeetingCopilot();
      ctx.log('info', 'Assessing live meeting pacing...');

      const pacing = copilot.checkPacing(input.current_topic_index, input.elapsed_minutes);
      return `🕒 **LIVE PACING STATUS**: \`${pacing.pacingStatus}\`
• **Current Topic**: **${pacing.currentItemTitle}** (${input.elapsed_minutes}m elapsed)
• **Whisper Cue**: "${pacing.whisperCue}"`;
    },
  },

  {
    name: 'meeting_whisper_fact_check',
    description: 'Fact-checks spoken statements in real time against historical minutes and contracts, generating private whisper prompter alerts.',
    input_schema: {
      type: 'object',
      properties: {
        spoken_statement: { type: 'string', description: 'The utterance spoken during the call.' },
      },
      required: ['spoken_statement'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const copilot = getMeetingCopilot();
      ctx.log('info', 'Cross-referencing spoken claim with historical knowledge base...');

      const check = copilot.factCheckUtterance(input.spoken_statement);
      if (!check.flagged) {
        return `✅ **Claim Consistent**: No factual contradictions found in verified records.`;
      }

      return check.whisper;
    },
  },
];
