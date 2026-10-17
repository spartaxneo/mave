'use strict';
// Autonomous Call Screening & Telephony Butler Plugin for Mave.

const { getCallScreeningHub } = require('../../telephony/call_screening_hub');

module.exports = [
  {
    name: 'screen_incoming_call',
    description: 'Screen an incoming phone call: checks caller ID against VIP contacts, auto-blocks telemarketers/spam, or answers as Mave AI Butler to transcribe voicemails.',
    input_schema: {
      type: 'object',
      properties: {
        caller_number: { type: 'string', description: 'Caller phone number (e.g. "+15551234567").' },
        caller_name: { type: 'string', description: 'Optional caller ID name.' },
        speech_transcript: { type: 'string', description: 'Audio speech transcript if caller spoke to the butler.' },
      },
      required: ['caller_number'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getCallScreeningHub();
      ctx.log('info', `Telephony Butler: Screening call from ${input.caller_number}...`);

      const res = hub.screenCall({
        callerNumber: input.caller_number,
        callerName: input.caller_name,
        speechTranscript: input.speech_transcript,
      });

      return `📞 **CALL SCREENING DISPOSITION**:
• **Caller**: **${res.caller}** (\`${input.caller_number}\`)
• **Action**: **${res.action.toUpperCase()}**
• **Status**: \`${res.disposition}\`
• **Butler Summary**: ${res.message}`;
    },
  },

  {
    name: 'list_voicemails',
    description: 'List transcribed voicemails taken by Mave\'s phone butler, with caller name, phone number, and message summary.',
    input_schema: {
      type: 'object',
      properties: {
        unread_only: { type: 'boolean', description: 'Whether to only list unread voicemails.' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getCallScreeningHub();
      const list = hub.getVoicemails(Boolean(input.unread_only));

      if (!list.length) {
        return '📬 **VOICEMAIL INBOX**: No voicemails currently in inbox.';
      }

      ctx.log('info', `Listing ${list.length} voicemails...`);
      const rows = list.map((v) => `• **${v.callerName}** (\`${v.callerNumber}\`, ${new Date(v.timestamp).toLocaleTimeString()}):\n  - "${v.transcript}"`).join('\n');

      return `📬 **TRANSCRIBED VOICEMAILS (${list.length})**:\n\n${rows}`;
    },
  },

  {
    name: 'triage_inbox_emails',
    description: 'Triage unread emails into high-urgency alerts, financial/deadline action items, and general newsletters.',
    input_schema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sender: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['subject'],
          },
          description: 'List of unread emails to triage.',
        },
      },
      required: ['emails'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getCallScreeningHub();
      const report = hub.triageEmails(input.emails);

      const urgentRows = (report.urgent || []).map((u) => `  - 🚨 **${u.subject}** (From: ${u.sender}) — *${u.reason}*`).join('\n') || '  - None';
      const actionRows = (report.actionRequired || []).map((a) => `  - 📝 **${a.subject}** (From: ${a.sender}) — *${a.reason}*`).join('\n') || '  - None';

      return `📧 **EMAIL TRIAGE & ACTION SUMMARY**:
${report.summary}

🔥 **Urgent Attention**:
${urgentRows}

📌 **Action / Deadlines Required**:
${actionRows}`;
    },
  },

  {
    name: 'manage_vip_call_contacts',
    description: 'Add or list VIP contacts permitted to bypass call screening and ring user devices immediately.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add'], description: 'Action to perform.' },
        contact: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            relationship: { type: 'string' },
            priority: { type: 'string' },
          },
          description: 'Contact data when adding a VIP.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getCallScreeningHub();

      if (input.action === 'add') {
        if (!input.contact || !input.contact.name || !input.contact.phone) {
          throw new Error('Contact name and phone are required.');
        }
        const c = hub.addVipContact(input.contact);
        return `✅ **VIP CONTACT ADDED**: "${c.name}" (\`${c.phone}\`, ${c.relationship}) is authorized for direct bypass.`;
      }

      const contacts = hub.getVipContacts();
      const rows = contacts.map((c) => `• **${c.name}** (\`${c.phone}\`): ${c.relationship} [${c.priority}]`).join('\n');
      return `⭐ **AUTHORIZED VIP CONTACTS (${contacts.length})**:\n\n${rows}`;
    },
  },
];
