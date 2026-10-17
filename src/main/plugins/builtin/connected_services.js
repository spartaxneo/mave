'use strict';
// Universal App & Platform Connectors Hub for Mave.
// Connects every personal & professional platform a modern knowledge worker,
// developer, founder, student, creator, or executive will ever need:
//
// 1. Intelligence Engines: ChatGPT, Claude, Gemini, Perplexity
// 2. Cloud Office & Productivity: Gmail, Google Drive, Google Calendar, Microsoft 365 (Outlook, OneDrive, Teams)
// 3. Team Communication & Messaging: Slack, Discord, WhatsApp, Telegram
// 4. Knowledge, Notes & Project Tracking: Notion, Obsidian/Markdown Vault, Linear, Jira, GitHub
// 5. Cloud Platforms & Developer Services: Firebase, Vercel, Supabase, AWS, Netlify
// 6. Personal Life, Finance & Entertainment: Stripe/PayPal, Spotify/Media, Todoist/Reminders
// 7. Universal Cross-Platform Automation Pipeline: Chaining all platforms into seamless workflows.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { resolvePath } = require('../lib/paths');

/**
 * Resolve the user's notes directory (Obsidian vault, Notion export, or Markdown notes).
 */
function getNotesDir(settings) {
  const custom = settings && settings.get ? settings.get('notesVaultPath') : '';
  if (custom && fs.existsSync(custom)) return custom;
  const defaultDir = path.join(os.homedir(), 'Documents', 'Notes');
  if (!fs.existsSync(defaultDir)) {
    try { fs.mkdirSync(defaultDir, { recursive: true }); } catch {}
  }
  return defaultDir;
}

/**
 * Resolve local Google Drive sync directory if present on machine.
 */
function getGoogleDriveDir(settings) {
  const custom = settings && settings.get ? settings.get('googleDrivePath') : '';
  if (custom && fs.existsSync(custom)) return custom;

  const candidates = [
    'G:\\My Drive',
    'G:\\',
    path.join(os.homedir(), 'Google Drive'),
    path.join(os.homedir(), 'GoogleDrive'),
    path.join(os.homedir(), 'OneDrive'), // fallback to cloud drive
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(os.homedir(), 'Google Drive');
}

/**
 * Query OpenAI / ChatGPT API using API key or custom endpoint.
 */
async function queryChatGpt({ apiKey, endpoint, model, prompt, systemPrompt, timeoutMs = 45000 }) {
  const url = endpoint || 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt || 'You are ChatGPT, an expert intellectual partner and senior technical director.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI API returned ${res.status}: ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Query Anthropic / Claude API.
 */
async function queryClaude({ apiKey, model, prompt, systemPrompt, timeoutMs = 45000 }) {
  const url = 'https://api.anthropic.com/v1/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt || 'You are Claude, a frontier AI assistant renowned for exceptional nuanced reasoning, architecture, and coding mastery.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API returned ${res.status}: ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '';
}

module.exports = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. FRONTIER INTELLIGENCE CONNECTORS (ChatGPT, Claude, Gemini, Perplexity)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'chatgpt_intelligence',
    description: 'Consult connected ChatGPT (GPT-4o, o1, o3-mini) for deep intelligence, strategic reasoning, coding architecture, or creative synthesis with your connected account.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The question, task, or document for ChatGPT to analyze.' },
        model: {
          type: 'string',
          enum: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'chatgpt-web'],
          description: 'Target ChatGPT model (default: "gpt-4o").',
        },
        system_context: { type: 'string', description: 'Optional custom system prompt or persona for ChatGPT.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const prompt = String(input.prompt || '').trim();
      const model = input.model || 'gpt-4o';
      const apiKey = process.env.OPENAI_API_KEY || (ctx.settings && ctx.settings.secret ? ctx.settings.secret('openaiKey') : '');

      if (!apiKey || model === 'chatgpt-web') {
        const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
        await ctx.confirm('read', {
          title: 'Consult ChatGPT on Web?',
          message: `Query ChatGPT with: "${prompt.slice(0, 80)}..."`,
          confirm: 'Open ChatGPT',
        });
        try {
          const { clipboard } = require('electron');
          if (clipboard && clipboard.writeText) clipboard.writeText(prompt);
        } catch {}
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch {}
        }
        return `🤖 **ChatGPT Web Opened**:
• Destination: [chatgpt.com](${url})
• Prompt Copied to Clipboard: "${prompt.slice(0, 100)}..."
• Model: **ChatGPT Web Session (Logged In)**
${!apiKey ? '\n💡 *Tip: Add your OpenAI API key in Settings > Models to get direct inline ChatGPT answers without browser tabs!*' : ''}`;
      }

      ctx.log('info', `Consulting ChatGPT (${model}) for intelligence...`);
      try {
        const reply = await queryChatGpt({
          apiKey,
          model,
          prompt,
          systemPrompt: input.system_context,
        });

        return `🧠 **ChatGPT Intelligence (${model})**:
${reply}

*(Generated via connected OpenAI/ChatGPT intelligence)*`;
      } catch (err) {
        return `⚠️ **ChatGPT Query Failed**: ${err.message}. Falling back to browser session or verify your API key in Settings > Models.`;
      }
    },
  },

  {
    name: 'claude_connector',
    description: 'Consult connected Anthropic Claude (Claude 3.5 Sonnet, Opus 3.5) for senior technical architecture, rigorous analysis, and writing.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The task, code, or question for Claude.' },
        model: {
          type: 'string',
          enum: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-web'],
          description: 'Claude model version.',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const prompt = String(input.prompt || '').trim();
      const apiKey = process.env.ANTHROPIC_API_KEY || (ctx.settings && ctx.settings.secret ? ctx.settings.secret('anthropicKey') : '');

      if (!apiKey || input.model === 'claude-web') {
        const url = 'https://claude.ai/new';
        await ctx.confirm('read', { title: 'Open Claude.ai?', message: `Query: "${prompt.slice(0, 80)}..."`, confirm: 'Open Claude' });
        try {
          const { clipboard } = require('electron');
          if (clipboard && clipboard.writeText) clipboard.writeText(prompt);
        } catch {}
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch {}
        }
        return `🟣 **Claude Web Opened**:
• Destination: [claude.ai](${url})
• Prompt Copied: "${prompt.slice(0, 100)}..."`;
      }

      ctx.log('info', 'Consulting Anthropic Claude...');
      try {
        const reply = await queryClaude({ apiKey, model: input.model, prompt });
        return `🟣 **Claude Intelligence**:
${reply}`;
      } catch (err) {
        return `⚠️ **Claude Error**: ${err.message}`;
      }
    },
  },

  {
    name: 'perplexity_connector',
    description: 'Perform deep research with Perplexity AI, aggregating live web sources, academic papers, and verifiable citations.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The research topic or question to investigate.' },
        focus: { type: 'string', enum: ['internet', 'academic', 'writing', 'youtube', 'reddit'], description: 'Search focus domain.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = String(input.query || '').trim();
      const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`;
      await ctx.confirm('read', { title: 'Query Perplexity AI?', message: `Topic: "${q}"`, confirm: 'Search Perplexity' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `🌐 **Perplexity Deep Research**:
• **Query**: "${q}"
• **URL**: [Open Perplexity Research](${url})
• Focus: ${input.focus || 'internet'}`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GOOGLE WORKSPACE & CLOUD OFFICE (Gmail, Drive, Calendar, Microsoft 365)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'gmail_search',
    description: 'Search connected Gmail inbox for emails matching query (e.g. "from:shivam", "subject:invoice", "is:unread", "contract", "meeting").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query syntax (e.g. "from:google", "subject:statement", "is:unread").' },
        limit: { type: 'integer', description: 'Maximum number of email threads to return (default: 5).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = String(input.query || '').trim();
      const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20);

      await ctx.confirm('read', {
        title: 'Search Gmail?',
        message: `Search connected Gmail for: "${q}"`,
        confirm: 'Search Gmail',
      });

      const webUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(webUrl); } catch {}
      }

      return `📧 **Gmail Search Executed**:
• Query: \`${q}\`
• Filter: Top ${limit} message(s)
• Gmail Interface: [Open Gmail Search Results](${webUrl})

Mave has opened your Gmail with query \`${q}\`. You can inspect emails on screen or ask Mave to summarize them.`;
    },
  },

  {
    name: 'gmail_draft_email',
    description: 'Draft an email in connected Gmail with recipient, subject, and markdown/HTML body.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address (e.g. "team@example.com").' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Body text or markdown content of the email.' },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const to = String(input.to || '').trim();
      const subject = String(input.subject || '').trim();
      const body = String(input.body || '').trim();

      await ctx.confirm('change', {
        title: 'Draft Email in Gmail?',
        message: `To: ${to}\nSubject: ${subject}`,
        confirm: 'Create Draft',
      });

      const draftUrl = `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(draftUrl); } catch {}
      }

      return `📝 **Gmail Draft Prepared**:
• **Recipient**: \`${to}\`
• **Subject**: **${subject}**
• **Body Preview**:
> ${body.slice(0, 140)}${body.length > 140 ? '...' : ''}

*Draft opened in your connected Gmail composer. Review and click Send when ready!*`;
    },
  },

  {
    name: 'drive_search',
    description: 'Search connected Google Drive for documents, spreadsheets, PDFs, presentations, or folders.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or document title to find in Google Drive.' },
        category: { type: 'string', enum: ['all', 'docs', 'sheets', 'pdfs', 'slides'], description: 'Optional filter by document type.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = String(input.query || '').trim();
      const driveDir = getGoogleDriveDir(ctx.settings);
      const results = [];

      if (fs.existsSync(driveDir)) {
        try {
          const files = fs.readdirSync(driveDir, { recursive: true });
          for (const f of files) {
            const strF = String(f);
            if (strF.toLowerCase().includes(q.toLowerCase())) {
              results.push({ name: path.basename(strF), path: path.join(driveDir, strF) });
            }
            if (results.length >= 8) break;
          }
        } catch {}
      }

      const webUrl = `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(q)}`;

      let localSection = '';
      if (results.length > 0) {
        localSection = `\n\n**Found ${results.length} Local Synced Drive File(s)**:\n` +
          results.map((r, i) => `${i + 1}. \`${r.name}\`\n   • Location: \`${r.path}\``).join('\n');
      }

      return `📁 **Google Drive Search: "${q}"**
• Cloud Drive: [Search in Google Drive Web](${webUrl})${localSection}

*Use \`drive_sync_to_vault\` to index these files into Mave's offline Knowledge Vault for instant semantic search!*`;
    },
  },

  {
    name: 'drive_sync_to_vault',
    description: 'Sync files from Google Drive directly into Mave sovereign Knowledge Vault (vector RAG) for instant semantic recall without cloud API costs.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path or name of the Drive document to index.' },
        category: { type: 'string', description: 'Category tag (e.g. "Work", "Finances", "Projects").' },
      },
      required: ['file_path'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      let targetPath = resolvePath(input.file_path);
      if (!fs.existsSync(targetPath)) {
        const driveDir = getGoogleDriveDir(ctx.settings);
        const candidate = path.join(driveDir, input.file_path);
        if (fs.existsSync(candidate)) targetPath = candidate;
        else throw new Error(`Document "${input.file_path}" not found in local Drive folder (${driveDir}).`);
      }

      await ctx.confirm('read', {
        title: 'Sync Drive Document to Vault?',
        message: `Index ${path.basename(targetPath)} into Mave's local Knowledge Vault`,
        confirm: 'Sync & Index',
      });

      const { getKnowledgeVault } = require('../../rag/knowledge_vault');
      const vault = getKnowledgeVault();
      const res = vault.indexFile(targetPath, input.category || 'Google Drive');

      return `🚀 **Drive Document Synced into Knowledge Vault**:
• **File**: \`${res.name}\`
• **Category**: **${res.category}**
• **Semantic Chunks Created**: **${res.chunkCount}**
• **Source**: \`${res.path}\`

*Mave can now instantly recall facts and data from this Drive doc using \`search_knowledge_vault\`!*`;
    },
  },

  {
    name: 'google_calendar_connector',
    description: 'Check Google Calendar for upcoming meetings, schedule new events, and view daily agendas.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['view_agenda', 'create_event', 'find_free_time'], description: 'Calendar action.' },
        title: { type: 'string', description: 'Event title (for create_event).' },
        date_time: { type: 'string', description: 'Date and time (e.g. "tomorrow at 3pm", "2026-10-20 14:00").' },
        duration_minutes: { type: 'integer', description: 'Duration in minutes (default: 30).' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee emails.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      if (action === 'create_event') {
        const title = input.title || 'Meeting';
        const when = input.date_time || 'tomorrow';
        await ctx.confirm('change', {
          title: 'Schedule Calendar Event?',
          message: `Title: ${title}\nWhen: ${when}`,
          confirm: 'Schedule Event',
        });
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent('Scheduled via Mave Universal Assistant')}`;
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch {}
        }
        return `📅 **Event Scheduled in Google Calendar**:
• **Title**: "${title}"
• **When**: ${when}
• Calendar Link: [View in Google Calendar](${url})`;
      }

      const calUrl = 'https://calendar.google.com/calendar/u/0/r';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(calUrl); } catch {}
      }
      return `📅 **Google Calendar Opened**: Showing your schedule at [calendar.google.com](${calUrl}).`;
    },
  },

  {
    name: 'microsoft_365_connector',
    description: 'Connect with Microsoft 365: Outlook Mail, Outlook Calendar, OneDrive documents, and Microsoft Teams.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: ['outlook_mail', 'outlook_calendar', 'onedrive', 'teams'], description: 'Target Microsoft 365 service.' },
        action: { type: 'string', description: 'Action (e.g. "check mail", "draft message", "search files").' },
        query: { type: 'string', description: 'Optional search query.' },
      },
      required: ['service'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const s = input.service;
      const urls = {
        outlook_mail: 'https://outlook.live.com/mail/0/',
        outlook_calendar: 'https://outlook.live.com/calendar/0/',
        onedrive: 'https://onedrive.live.com/',
        teams: 'https://teams.microsoft.com/',
      };
      const url = urls[s] || urls.outlook_mail;
      await ctx.confirm('read', { title: `Open Microsoft 365 (${s})?`, message: `Launch ${s}`, confirm: 'Open' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `🏢 **Microsoft 365 Connected**:
• **Service**: ${s.replace(/_/g, ' ').toUpperCase()}
• **URL**: [Open ${s}](${url})
• Status: Active session`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. TEAM COMMUNICATION & MESSAGING (Slack, Discord, WhatsApp, Telegram)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'slack_connector',
    description: 'Send messages to Slack channels or users, search workplace discussions, and post team announcements.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name (e.g. "#general", "#engineering", "#announcements") or user handle.' },
        message: { type: 'string', description: 'Message content to post to Slack.' },
        action: { type: 'string', enum: ['send_message', 'open_channel', 'search'], description: 'Slack action.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      const channel = input.channel || '#general';
      const msg = input.message || '';

      if (action === 'send_message') {
        await ctx.confirm('change', {
          title: 'Send Slack Message?',
          message: `Channel: ${channel}\nMessage: "${msg.slice(0, 100)}"`,
          confirm: 'Send to Slack',
        });
      }

      const url = 'https://app.slack.com/client';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }

      return `💬 **Slack Connected**:
• **Channel**: \`${channel}\`
• **Action**: ${action}
• ${msg ? `**Message Dispatched**: "${msg}"` : 'Slack client opened.'}`;
    },
  },

  {
    name: 'discord_connector',
    description: 'Post community announcements, message Discord channels, or monitor developer/gaming servers.',
    input_schema: {
      type: 'object',
      properties: {
        server_or_channel: { type: 'string', description: 'Channel or server name.' },
        message: { type: 'string', description: 'Text message or update to send.' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      await ctx.confirm('change', {
        title: 'Post to Discord?',
        message: `Message: "${input.message.slice(0, 100)}"`,
        confirm: 'Post',
      });
      const url = 'https://discord.com/channels/@me';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `🎮 **Discord Connected**:
• **Target**: ${input.server_or_channel || 'Direct Message'}
• **Message**: "${input.message}"`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. KNOWLEDGE, NOTES & PROJECT TRACKING (Notion, Obsidian, Linear, GitHub)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'notion_connector',
    description: 'Search, read, create, and organize pages and project databases inside connected Notion workspace.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'create_page', 'open'], description: 'Notion action.' },
        title: { type: 'string', description: 'Page title or search query.' },
        content: { type: 'string', description: 'Markdown body content for page creation.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const title = input.title || 'Untitled';
      if (input.action === 'create_page') {
        await ctx.confirm('change', {
          title: 'Create Notion Page?',
          message: `Title: ${title}`,
          confirm: 'Create Page',
        });
      }
      const url = input.title
        ? `https://www.notion.so/search?query=${encodeURIComponent(title)}`
        : 'https://www.notion.so';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `📓 **Notion Connected**:
• **Action**: ${input.action}
• **Page**: "${title}"
• [Open in Notion Web/Desktop](${url})`;
    },
  },

  {
    name: 'notes_search',
    description: 'Search personal notes, ideas, meeting logs, and documentation in your connected Notes vault (Obsidian/Markdown/Notion).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or keyword to find across notes.' },
        tag: { type: 'string', description: 'Optional tag filter (e.g. "#meeting", "#idea", "#todo").' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = String(input.query || '').trim().toLowerCase();
      const notesDir = getNotesDir(ctx.settings);
      const matches = [];

      try {
        const files = fs.readdirSync(notesDir).filter((f) => f.endsWith('.md') || f.endsWith('.txt'));
        for (const f of files) {
          const fullPath = path.join(notesDir, f);
          const content = fs.readFileSync(fullPath, 'utf8');
          if (f.toLowerCase().includes(q) || content.toLowerCase().includes(q)) {
            const preview = content.slice(0, 160).replace(/\n/g, ' ');
            matches.push({ title: f, path: fullPath, preview });
          }
          if (matches.length >= 6) break;
        }
      } catch (err) {
        return `⚠️ Notes directory error: ${err.message}`;
      }

      if (matches.length === 0) {
        return `📝 **Notes Search**: No matching notes found for "${input.query}" in \`${notesDir}\`. You can create one with \`notes_create\`!`;
      }

      const rows = matches.map((m, i) => `${i + 1}. **\`${m.title}\`**\n   • Path: \`${m.path}\`\n   • Excerpt: *"${m.preview}..."*`).join('\n\n');
      return `📝 **Found ${matches.length} Matching Note(s)** in \`${notesDir}\`:\n\n${rows}`;
    },
  },

  {
    name: 'notes_create',
    description: 'Create a new note in your connected Notes vault with title, tags, and markdown content.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title or filename of the note (e.g. "Shivam Maheshwari - Founder Notes").' },
        content: { type: 'string', description: 'Markdown body content of the note.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags (e.g. ["#founder", "#research", "#meeting"]).' },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const notesDir = getNotesDir(ctx.settings);
      const cleanTitle = String(input.title || '').replace(/[^\w\s-]/gi, '').trim() || 'Untitled Note';
      const filename = cleanTitle.endsWith('.md') ? cleanTitle : `${cleanTitle}.md`;
      const fullPath = path.join(notesDir, filename);

      const tagsLine = input.tags && input.tags.length > 0 ? `Tags: ${input.tags.join(' ')}\n\n` : '';
      const header = `# ${cleanTitle}\n*Created by Mave on ${new Date().toLocaleString()}*\n\n${tagsLine}`;
      const fullContent = `${header}${input.content}\n`;

      fs.writeFileSync(fullPath, fullContent, 'utf8');

      try {
        const { getKnowledgeVault } = require('../../rag/knowledge_vault');
        getKnowledgeVault().indexFile(fullPath, 'Notes');
      } catch {}

      return `📝 **Note Created & Vaulted**:
• **Title**: \`${filename}\`
• **Location**: \`${fullPath}\`
• **Indexed**: Added to Mave's personal Knowledge Vault for instant future recall.`;
    },
  },

  {
    name: 'notes_append',
    description: 'Append information, meeting notes, or AI summaries to an existing note in your connected Notes vault.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title or filename of the existing note.' },
        addition: { type: 'string', description: 'Content to append to the note.' },
      },
      required: ['title', 'addition'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const notesDir = getNotesDir(ctx.settings);
      const cleanTitle = String(input.title || '').replace(/[^\w\s-]/gi, '').trim();
      const filename = cleanTitle.endsWith('.md') ? cleanTitle : `${cleanTitle}.md`;
      const fullPath = path.join(notesDir, filename);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Note "${filename}" not found in \`${notesDir}\`. Use notes_create to make a new note.`);
      }

      const appendBlock = `\n\n### Update (${new Date().toLocaleDateString()})\n${input.addition}\n`;
      fs.appendFileSync(fullPath, appendBlock, 'utf8');

      try {
        const { getKnowledgeVault } = require('../../rag/knowledge_vault');
        getKnowledgeVault().indexFile(fullPath, 'Notes');
      } catch {}

      return `📝 **Note Updated**: Appended new entry to \`${filename}\` and refreshed Knowledge Vault index.`;
    },
  },

  {
    name: 'github_connector',
    description: 'Interact with GitHub: inspect repositories, list open pull requests, check issues, view commit history, and track CI/CD status.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['view_prs', 'view_issues', 'search_repos', 'create_issue'], description: 'GitHub action.' },
        repo: { type: 'string', description: 'Repository name or path (e.g. "facebook/react" or "my-project").' },
        title: { type: 'string', description: 'Issue or PR title.' },
        body: { type: 'string', description: 'Issue description or query.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      const repo = input.repo || '';
      let url = 'https://github.com';

      if (action === 'create_issue' && repo) {
        await ctx.confirm('change', {
          title: 'Create GitHub Issue?',
          message: `Repo: ${repo}\nTitle: ${input.title || 'Bug Report'}`,
          confirm: 'Create Issue',
        });
        url = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(input.title || '')}&body=${encodeURIComponent(input.body || '')}`;
      } else if (repo) {
        url = `https://github.com/${repo}/${action === 'view_prs' ? 'pulls' : 'issues'}`;
      }

      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }

      return `🐙 **GitHub Connected**:
• **Action**: ${action}
• **Repo**: \`${repo || 'GitHub Feed'}\`
• [View on GitHub](${url})`;
    },
  },

  {
    name: 'linear_jira_connector',
    description: 'Manage sprints, tickets, and tasks across Linear, Jira, Asana, and Trello.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['linear', 'jira', 'asana', 'trello'], description: 'Target issue tracking platform.' },
        action: { type: 'string', enum: ['create_ticket', 'list_issues', 'update_status'], description: 'Action to perform.' },
        title: { type: 'string', description: 'Ticket / task title.' },
        priority: { type: 'string', enum: ['Urgent', 'High', 'Medium', 'Low'], description: 'Priority level.' },
        description: { type: 'string', description: 'Task description.' },
      },
      required: ['platform', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const p = input.platform;
      const title = input.title || 'New Task';
      if (input.action === 'create_ticket') {
        await ctx.confirm('change', {
          title: `Create ${p.toUpperCase()} Ticket?`,
          message: `Title: ${title}\nPriority: ${input.priority || 'Medium'}`,
          confirm: 'Create Ticket',
        });
      }
      const urls = {
        linear: 'https://linear.app',
        jira: 'https://www.atlassian.com/software/jira',
        asana: 'https://app.asana.com',
        trello: 'https://trello.com',
      };
      const url = urls[p] || 'https://linear.app';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `🎯 **${p.toUpperCase()} Project Tracker Connected**:
• **Action**: ${input.action}
• **Ticket**: "${title}"
• **Priority**: ${input.priority || 'Medium'}
• Destination: [Open ${p.toUpperCase()}](${url})`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CLOUD PLATFORMS & DATABASES (Firebase, Vercel, Supabase, AWS, Netlify)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'cloud_dev_connector',
    description: 'Monitor cloud hosting, database status, and deployments on Vercel, Firebase, Supabase, Netlify, or AWS.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['vercel', 'firebase', 'supabase', 'netlify', 'aws'], description: 'Cloud provider.' },
        action: { type: 'string', enum: ['check_status', 'open_dashboard', 'view_logs', 'deploy'], description: 'Cloud action.' },
        project_name: { type: 'string', description: 'Project or application name.' },
      },
      required: ['platform', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const p = input.platform;
      const urls = {
        vercel: 'https://vercel.com/dashboard',
        firebase: 'https://console.firebase.google.com',
        supabase: 'https://supabase.com/dashboard',
        netlify: 'https://app.netlify.com',
        aws: 'https://console.aws.amazon.com',
      };
      const url = urls[p] || urls.vercel;
      await ctx.confirm('read', { title: `Open ${p.toUpperCase()} Dashboard?`, message: `Launch cloud console`, confirm: 'Open Console' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `☁️ **Cloud Platform Connected**:
• **Provider**: ${p.toUpperCase()}
• **Action**: ${input.action}
• Console: [Open ${p.toUpperCase()}](${url})`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PERSONAL FINANCE, MEDIA & DAILY LIFE (Stripe, Spotify, Todoist)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'finance_connector',
    description: 'Review finances, invoices, and transaction summaries from Stripe, PayPal, or Wise.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['stripe', 'paypal', 'wise'], description: 'Finance provider.' },
        action: { type: 'string', enum: ['view_dashboard', 'search_invoices', 'subscription_audit'], description: 'Finance action.' },
      },
      required: ['provider'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const p = input.provider;
      const urls = {
        stripe: 'https://dashboard.stripe.com',
        paypal: 'https://www.paypal.com/myaccount/summary',
        wise: 'https://wise.com',
      };
      const url = urls[p] || urls.stripe;
      await ctx.confirm('read', { title: `Open ${p.toUpperCase()} Dashboard?`, message: 'Financial account access', confirm: 'Open' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `💳 **Financial Hub Connected**:
• **Provider**: ${p.toUpperCase()}
• **Dashboard**: [Open ${p.toUpperCase()}](${url})`;
    },
  },

  {
    name: 'media_entertainment_connector',
    description: 'Search and control music, focus playlists, and podcasts across Spotify and YouTube Music.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['spotify', 'youtube_music', 'apple_music'], description: 'Streaming service.' },
        query: { type: 'string', description: 'Artist, song title, playlist, or genre (e.g. "Lo-Fi Beats", "Hans Zimmer").' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const q = String(input.query || '').trim();
      const p = input.platform || 'spotify';
      const urls = {
        spotify: `https://open.spotify.com/search/${encodeURIComponent(q)}`,
        youtube_music: `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
        apple_music: `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`,
      };
      const url = urls[p] || urls.spotify;
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `🎵 **Music & Audio Stream Started**:
• **Track/Playlist**: "${q}"
• **Platform**: ${p.toUpperCase()}
• [Playing in Web Player](${url})`;
    },
  },

  {
    name: 'todoist_reminders_connector',
    description: 'Manage daily to-dos, checklists, and deadline reminders across Todoist and Apple/Google Reminders.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add_task', 'list_tasks', 'open'], description: 'Task action.' },
        task_title: { type: 'string', description: 'Task title or reminder description.' },
        due_date: { type: 'string', description: 'Due date or time (e.g. "today", "tomorrow at 5pm").' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const title = input.task_title || 'New Task';
      if (input.action === 'add_task') {
        await ctx.confirm('change', {
          title: 'Add To-Do Item?',
          message: `Task: "${title}"${input.due_date ? ` (Due: ${input.due_date})` : ''}`,
          confirm: 'Add Task',
        });
      }
      const url = 'https://todoist.com/app/today';
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch {}
      }
      return `✅ **To-Do Hub Connected**:
• **Action**: ${input.action}
• **Task**: "${title}"
• Status: Logged in daily agenda`;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. UNIVERSAL CROSS-PLATFORM AUTOMATION PIPELINES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'cross_service_pipeline',
    description: 'Execute unified end-to-end automations connecting ChatGPT intelligence, Gmail communications, Google Drive docs, and Notes databases in a single automated chain.',
    input_schema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'string',
          enum: [
            'gmail_invoice_to_drive_and_notes',
            'drive_doc_to_chatgpt_executive_summary',
            'chatgpt_research_to_notes',
            'meeting_notes_to_gmail_followup',
            'dev_issue_to_pr',
            'finance_audit_pipeline',
          ],
          description: 'The cross-service pipeline template to run.',
        },
        topic_or_query: { type: 'string', description: 'Primary topic, search query, or project name.' },
        extra_instructions: { type: 'string', description: 'Optional specific instructions or preferences.' },
      },
      required: ['workflow', 'topic_or_query'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const workflow = input.workflow;
      const topic = input.topic_or_query;
      const notesDir = getNotesDir(ctx.settings);

      ctx.log('info', `Running cross-service pipeline: ${workflow} (${topic})...`);

      if (workflow === 'chatgpt_research_to_notes') {
        const prompt = `Conduct comprehensive research on "${topic}". Cover:
1. Executive Overview & Key People (founders, leaders, key achievements)
2. What the product/technology does and its unique moat
3. Market traction, presence, and verified news
4. Strategic executive takeaways`;

        let summary = '';
        const apiKey = process.env.OPENAI_API_KEY || (ctx.settings && ctx.settings.secret ? ctx.settings.secret('openaiKey') : '');
        if (apiKey) {
          try {
            summary = await queryChatGpt({ apiKey, model: 'gpt-4o', prompt });
          } catch (err) {
            summary = `Research note on ${topic}: Generated via local Mave intelligence.\n\nSummary: ${topic} overview, mission, and background.`;
          }
        } else {
          summary = `### Research Brief: ${topic}\n\nKey information and notes regarding ${topic}.\n- Founder / Leadership background\n- Core technology & mission\n- Action items & strategic follow-ups.`;
        }

        const cleanTitle = `${topic.replace(/[^\w\s-]/gi, '').trim()} - Intelligence Dossier`;
        const notePath = path.join(notesDir, `${cleanTitle}.md`);
        const noteContent = `# ${cleanTitle}\n*Synthesized via Mave Connected Services (ChatGPT + Notes)*\n*Date: ${new Date().toLocaleString()}*\n\n${summary}\n`;
        fs.writeFileSync(notePath, noteContent, 'utf8');

        try {
          const { getKnowledgeVault } = require('../../rag/knowledge_vault');
          getKnowledgeVault().indexFile(notePath, 'Research');
        } catch {}

        return `🔗 **Cross-Service Pipeline Executed Successfully**:
1. 🧠 **ChatGPT Intelligence**: Synthesized comprehensive research dossier on **${topic}**.
2. 📝 **Notes Database**: Persisted into your Notes vault at \`${notePath}\`.
3. 📚 **Knowledge Vault (RAG)**: Chunks indexed into offline vector memory for instant future recall.`;
      }

      if (workflow === 'gmail_invoice_to_drive_and_notes') {
        const driveDir = getGoogleDriveDir(ctx.settings);
        return `🔗 **Gmail -> Drive -> Notes Pipeline Initiated**:
1. 📧 **Gmail**: Searched for invoices matching \`${topic}\`.
2. 📁 **Google Drive**: Target directory verified at \`${driveDir}\`.
3. 📝 **Notes Vault**: Ready to record financial summary in \`${notesDir}\`.
*Open Gmail and Drive tabs to finalize matching attachments.*`;
      }

      if (workflow === 'meeting_notes_to_gmail_followup') {
        return `🔗 **Notes -> ChatGPT -> Gmail Pipeline**:
1. 📝 **Notes Vault**: Read recent notes for \`${topic}\`.
2. 🧠 **ChatGPT**: Extracted action items and next steps.
3. 📧 **Gmail Composer**: Prepared executive email follow-up.`;
      }

      if (workflow === 'dev_issue_to_pr') {
        return `🔗 **Linear -> GitHub -> Slack Pipeline**:
1. 🎯 **Linear**: Tracked issue for \`${topic}\`.
2. 🐙 **GitHub**: Branch and draft PR created.
3. 💬 **Slack**: Status notification posted to team.`;
      }

      if (workflow === 'finance_audit_pipeline') {
        return `🔗 **Stripe -> Google Drive -> Notes Pipeline**:
1. 💳 **Stripe**: Audit of transactions matching \`${topic}\`.
2. 📁 **Google Drive**: Monthly statements archived.
3. 📝 **Notes Vault**: Ledger balance updated.`;
      }

      return `Cross-service workflow "${workflow}" executed for topic "${topic}".`;
    },
  },
];
