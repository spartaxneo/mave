'use strict';
// Autonomous Email Inbox Zero & AI Triage Dispatcher Plugin for Mave.

const { getInboxTriage } = require('../../communication/inbox_triage');

module.exports = [
  {
    name: 'inbox_triage_single_email',
    description: 'Triage an inbound email: identifies urgency, category, extract deadlines, and generates executive 1-click reply options.',
    input_schema: {
      type: 'object',
      properties: {
        sender: { type: 'string', description: 'Sender email address.' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Email body text.' },
      },
      required: ['sender', 'subject'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const triage = getInboxTriage();
      ctx.log('info', `Triaging inbound email: "${input.subject}" from ${input.sender}`);

      const result = triage.triageEmail({
        sender: input.sender,
        subject: input.subject,
        body: input.body || '',
      });

      const repliesFormatted = result.quickReplies.map((r, idx) => `  ${idx + 1}. **[${r.label}]**: "${r.text}"`).join('\n');

      return `📬 **INBOX TRIAGE REPORT**:
• **Sender**: \`${result.sender}\`${result.isVip ? ' ⭐ **[VIP]**' : ''}
• **Category**: \`${result.category}\` (Urgency Score: **${result.urgencyScore}/10**)
• **Action Required**: ${result.requiresAction ? 'YES 🚨' : 'NO ✅'}
• **Recommended Strategy**: \`${result.recommendedAction}\`
${result.deadline ? `• **Deadline Detected**: \`${result.deadline}\`\n` : ''}
📝 **Executive 1-Click Quick Replies**:
${repliesFormatted || '  *(No reply needed - promotional/informational)*'}`;
    },
  },

  {
    name: 'inbox_generate_daily_digest',
    description: 'Generates a 30-second executive summary of unread emails, highlighting urgent action items and financial invoices.',
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
            required: ['sender', 'subject'],
          },
          description: 'Array of unread email objects.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const triage = getInboxTriage();
      ctx.log('info', 'Compiling daily inbox digest...');

      const sampleEmails = input.emails || [
        { sender: 'client@megacorp.com', subject: 'URGENT: Contract Amendment needed by 5 PM today', body: 'Please review and sign before end of day.' },
        { sender: 'billing@aws.amazon.com', subject: 'Your Monthly AWS Invoice is Ready', body: 'Amount charged: $421.50' },
        { sender: 'deals@store.com', subject: '50% Off Everything Today Only', body: 'Click here to unsubscribe' }
      ];

      const digest = triage.summarizeDailyInbox(sampleEmails);
      const urgentLines = digest.urgentItems.map(u => `• 🚨 **${u.sender}**: "${u.subject}"`).join('\n');

      return `📊 **DAILY EXECUTIVE INBOX DIGEST**:
• **Total Inbound Analyzed**: **${digest.totalEmails}**
• **Urgent Action Items**: **${digest.urgentCount}**
• **Financial Receipts**: **${digest.receiptCount}**
• **Promotional / Marketing**: **${digest.spamCount}**
• **Inbox Health**: \`${digest.inboxHealthRating}\`

${urgentLines ? `🔥 **Urgent Action Required**:\n${urgentLines}` : '✅ Zero urgent blockers.'}`;
    },
  },
];
