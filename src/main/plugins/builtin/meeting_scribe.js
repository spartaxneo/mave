'use strict';
// Real-Time Meeting Secretary & Audio Scribe Plugin for Bigfoot.
// Transcribes and summarizes video conferences, Discord calls, YouTube sessions,
// and extracts action items, decisions, and timestamps directly into D:\Bigfoot\meetings\.

const { getMeetingScribe } = require('../../meeting/meeting_scribe');

module.exports = [
  {
    name: 'start_meeting_scribe',
    description: 'Start an automated meeting scribe session to listen to and record a Zoom, Google Meet, Discord, or live conference call.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title or topic of the meeting (e.g. "Sprint Planning", "Product Review", "Client Call").',
        },
        participants: {
          type: 'array',
          description: 'List of meeting participant names.',
          items: {
            type: 'string',
            description: 'Participant name.',
          },
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const scribe = getMeetingScribe();
      const session = scribe.startMeeting(input.title, input.participants || ['User']);
      ctx.log('info', `Started meeting scribe for: "${session.title}"`);
      return `🎙️ **MEETING SCRIBE ACTIVE**: Now listening and recording meeting: **"${session.title}"**.\n• Participants: ${session.participants.join(', ')}\n• Use \`record_meeting_note\` to capture dialogue and \`finish_meeting_scribe\` when the meeting concludes.`;
    },
  },
  {
    name: 'record_meeting_note',
    description: 'Add a spoken statement, dialogue line, or key observation to the currently active meeting transcript.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The spoken dialogue or note statement to record.',
        },
        speaker: {
          type: 'string',
          description: 'Name of the speaker (default: "Speaker").',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const scribe = getMeetingScribe();
      if (!scribe.isRecording()) {
        return '⚠️ No meeting is currently active. Use `start_meeting_scribe` first.';
      }

      const entry = scribe.addTranscriptEntry(input.text, input.speaker || 'Speaker');
      return `✍️ Recorded [${entry.speaker}]: "${entry.text.slice(0, 100)}${entry.text.length > 100 ? '...' : ''}"`;
    },
  },
  {
    name: 'finish_meeting_scribe',
    description: 'Conclude the active meeting, synthesize executive summary, extract actionable checkboxes and decisions, and save the markdown notes to D:\\Bigfoot\\meetings\\.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const scribe = getMeetingScribe();
      if (!scribe.isRecording()) {
        return '⚠️ No meeting is currently active. Use `start_meeting_scribe` to begin a session.';
      }

      ctx.log('info', 'Synthesizing meeting summary, action items, and markdown document...');
      const summary = scribe.finishMeeting();

      return `📋 **MEETING CONCLUDED & MINUTES SAVED**:
• **Title**: **${summary.title}**
• **Saved Markdown File**: \`${summary.savedFile}\`
• **Action Items Identified**: **${summary.actionItemCount}**
• **Transcript Dialogue Entries**: **${summary.transcriptLinesCount}**

Preview:
\`\`\`markdown
${summary.markdown.slice(0, 500)}...
\`\`\``;
    },
  },
  {
    name: 'list_saved_meetings',
    description: 'List all previously recorded and summarized meeting minutes in D:\\Bigfoot\\meetings\\.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const scribe = getMeetingScribe();
      const meetings = scribe.listPastMeetings();

      if (!meetings.length) {
        return '📂 No saved meeting minutes found in `D:\\Bigfoot\\meetings\\`.';
      }

      const rows = meetings.map((m) =>
        `• **${m.file}** (${Math.round(m.sizeBytes / 1024)} KB) - Modified: ${new Date(m.modifiedAt).toLocaleDateString()}`
      ).join('\n');

      return `📂 **RECORDED MEETING ARCHIVE** (${meetings.length} file(s)):\n\n${rows}`;
    },
  },
];
