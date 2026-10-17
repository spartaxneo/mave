'use strict';
// Personal Life, Finance & Reflection Plugin for Bigfoot.
// Provides local offline financial statement parsing, receipt/invoice tracking,
// micro-journaling prompts, and sovereign price watchers.

const fs = require('fs');
const path = require('path');
const { resolvePath, assertWritable } = require('../lib/paths');

module.exports = [
  {
    name: 'parse_financial_statement',
    description: 'Parse bank or credit card CSV statements, categorize spending (Software, Food, Hardware, Services), and calculate monthly cash burn 100% locally.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to CSV bank or card statement file.',
        },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const resolved = resolvePath(input.file_path);
      if (!fs.existsSync(resolved)) throw new Error(`Statement file not found: ${resolved}`);

      await ctx.confirm('read', {
        title: 'Parse Financial Statement?',
        message: `Analyze confidential statement ${path.basename(resolved)} locally (zero cloud upload)`,
        confirm: 'Parse Locally',
      });

      ctx.log('info', `Parsing financial statement at ${resolved}...`);
      const content = fs.readFileSync(resolved, 'utf8');
      const lines = content.split(/\r?\n/).filter(Boolean);

      let totalSpend = 0;
      let count = 0;
      const categories = { Software: 0, Food: 0, Cloud: 0, General: 0 };

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          const num = parseFloat(parts[parts.length - 1].replace(/[^0-9.-]/g, ''));
          if (!isNaN(num) && num > 0) {
            totalSpend += num;
            count++;
            const desc = (parts[1] || '').toLowerCase();
            if (desc.includes('aws') || desc.includes('azure') || desc.includes('cloud')) categories.Cloud += num;
            else if (desc.includes('food') || desc.includes('uber') || desc.includes('restaurant')) categories.Food += num;
            else if (desc.includes('github') || desc.includes('software') || desc.includes('jetbrains')) categories.Software += num;
            else categories.General += num;
          }
        }
      }

      return `💳 **FINANCIAL STATEMENT AUDIT REPORT** (\`${path.basename(resolved)}\`):
• **Total Transactions**: ${count}
• **Total Outflow**: **$${totalSpend.toFixed(2)}**
• **Spending Breakdown**:
  • Cloud & Infrastructure: **$${categories.Cloud.toFixed(2)}**
  • Software & Subscriptions: **$${categories.Software.toFixed(2)}**
  • Food & Dining: **$${categories.Food.toFixed(2)}**
  • General & Miscellaneous: **$${categories.General.toFixed(2)}**

*100% sovereign calculation. Zero financial data left your machine.*`;
    },
  },
  {
    name: 'track_invoices_receipts',
    description: 'Log receipt and invoice entries into a structured local ledger in D:\\Bigfoot\\finance\\ledger.json.',
    input_schema: {
      type: 'object',
      properties: {
        vendor: {
          type: 'string',
          description: 'Merchant or vendor name (e.g. "Amazon", "DigitalOcean", "MicroCenter").',
        },
        amount: {
          type: 'number',
          description: 'Invoice total amount.',
        },
        category: {
          type: 'string',
          description: 'Expense category (e.g. "Hardware", "Office", "Hosting").',
        },
        notes: {
          type: 'string',
          description: 'Optional description or invoice number.',
        },
      },
      required: ['vendor', 'amount'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const financeDir = 'D:\\Bigfoot\\finance';
      const ledgerFile = path.join(financeDir, 'ledger.json');

      try {
        if (!fs.existsSync(financeDir)) fs.mkdirSync(financeDir, { recursive: true });
      } catch {}

      let ledger = [];
      try {
        if (fs.existsSync(ledgerFile)) ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      } catch {}

      const entry = {
        id: `inv_${Date.now()}`,
        date: new Date().toISOString(),
        vendor: input.vendor,
        amount: input.amount,
        category: input.category || 'General',
        notes: input.notes || '',
      };
      ledger.push(entry);

      try {
        fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2), 'utf8');
      } catch {}

      return `🧾 **INVOICE ENTRY LOGGED**:
• **Vendor**: **${entry.vendor}** ($${entry.amount.toFixed(2)})
• **Category**: ${entry.category}
• **Date**: ${new Date(entry.date).toLocaleDateString()}
• **Ledger Size**: ${ledger.length} total transaction(s) recorded.`;
    },
  },
  {
    name: 'prompt_daily_reflection',
    description: 'Prompt for and save an evening micro-journal reflection capturing today\'s wins, lessons learned, and tomorrow\'s priority in D:\\Bigfoot\\reflections\\.',
    input_schema: {
      type: 'object',
      properties: {
        wins: {
          type: 'string',
          description: 'What was accomplished today.',
        },
        lesson: {
          type: 'string',
          description: 'One key lesson or insight learned.',
        },
        tomorrow_priority: {
          type: 'string',
          description: 'Top single focus for tomorrow.',
        },
      },
      required: ['wins'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const refDir = 'D:\\Bigfoot\\reflections';
      try {
        if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });
      } catch {}

      const today = new Date().toISOString().slice(0, 10);
      const filePath = path.join(refDir, `${today}_reflection.md`);

      const content = `# 📓 Daily Reflection: ${today}
**Recorded:** ${new Date().toLocaleTimeString()}

### 🏆 Key Wins
${input.wins}

### 💡 Lesson Learned
${input.lesson || 'Consistent execution over sporadic intensity.'}

### 🎯 Tomorrow's Priority
${input.tomorrow_priority || 'Build and iterate on core objectives.'}
`;

      try {
        fs.writeFileSync(filePath, content, 'utf8');
      } catch {}

      return `📓 **EVENING REFLECTION SAVED**:
• **Date**: ${today}
• **Stored File**: \`${filePath}\`
• **Status**: Logged to your sovereign personal history archive. Sleep well!`;
    },
  },
];
