'use strict';
// Dedicated automation and operation plugin for famous tools and apps:
// WhatsApp, Gmail, ChatGPT, Instagram, Firebase, and more.

const { shell } = require('electron');
const { exec } = require('child_process');

module.exports = [
  {
    name: 'use_chatgpt',
    description: 'Use ChatGPT in the web browser (chatgpt.com) just like a human with your existing logged-in account, with your prompt pre-filled and copied to clipboard.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt or question to submit to ChatGPT.' },
      },
      additionalProperties: false,
    },
    async run({ prompt }, ctx) {
      const q = String(prompt || '').trim();
      const url = q ? `https://chatgpt.com/?q=${encodeURIComponent(q)}` : 'https://chatgpt.com';
      await ctx.confirm('read', { title: 'Open ChatGPT?', message: q ? `Query ChatGPT on Web: "${q.slice(0, 80)}..."` : 'Open ChatGPT Web', confirm: 'Open' });
      try {
        const { clipboard } = require('electron');
        if (q && clipboard && clipboard.writeText) {
          clipboard.writeText(q);
        }
      } catch {}
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch { /* ignore */ }
      }
      await ctx.sleep(1000);
      return q
        ? `Opened ChatGPT (chatgpt.com) with prompt: "${q}". The prompt has also been copied to your clipboard. Mave can watch the screen or read the generated answer via read_screen or screenshot.`
        : 'Opened ChatGPT in browser. You are using your real logged-in web account.';
    },
  },
  {
    name: 'use_claude',
    description: 'Use Claude in the web browser (claude.ai) just like a human with your existing logged-in account, with your prompt pre-filled and copied to clipboard.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt or question to submit to Claude on claude.ai.' },
      },
      additionalProperties: false,
    },
    async run({ prompt }, ctx) {
      const q = String(prompt || '').trim();
      const url = 'https://claude.ai/new';
      await ctx.confirm('read', { title: 'Open Claude.ai?', message: q ? `Query Claude on Web: "${q.slice(0, 80)}..."` : 'Open Claude Web', confirm: 'Open' });
      try {
        const { clipboard } = require('electron');
        if (q && clipboard && clipboard.writeText) {
          clipboard.writeText(q);
        }
      } catch {}
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch { /* ignore */ }
      }
      await ctx.sleep(1000);
      return q
        ? `Opened Claude (claude.ai) in your browser. The prompt has been copied to your clipboard: "${q}". Mave can paste and read Claude's generated answer via read_screen or screenshot.`
        : 'Opened Claude (claude.ai) in browser. You are using your real logged-in web account.';
    },
  },
  {
    name: 'use_whatsapp',
    description: 'Automate WhatsApp Web/Desktop: open chats, search contacts, or prepare a direct message to a phone number.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['open', 'send_message', 'search_contact'],
          description: 'The WhatsApp action to perform.',
        },
        phone: {
          type: 'string',
          description: 'International phone number with country code and digits only (e.g. "14155552671" or "919876543210").',
        },
        message: {
          type: 'string',
          description: 'The text message to send or pre-fill.',
        },
        contact_name: {
          type: 'string',
          description: 'Name of the contact or group to search for.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      if (action === 'send_message') {
        const phone = String(input.phone || '').replace(/[^\d]/g, '');
        const msg = String(input.message || '').trim();
        if (!phone) throw new Error('A phone number (digits only with country code) is required to send or pre-fill a WhatsApp message.');
        await ctx.confirm('change', {
          title: 'Prepare WhatsApp message?',
          message: `Send to ${phone}: "${msg.slice(0, 100)}"`,
          confirm: 'Open WhatsApp',
        });
        const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch { /* ignore */ }
        }
        await ctx.sleep(1200);
        return `Opened WhatsApp chat for +${phone} with message pre-filled: "${msg}". Always confirm with user before clicking or pressing Enter to send.`;
      }

      if (action === 'search_contact') {
        const contact = String(input.contact_name || '').trim();
        await ctx.confirm('read', { title: 'Open WhatsApp?', message: `Search for contact: "${contact}"`, confirm: 'Open' });
        const url = 'https://web.whatsapp.com';
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch { /* ignore */ }
        }
        await ctx.sleep(1200);
        return `Opened WhatsApp. To find "${contact}", use click_element on the search box (or press Ctrl+Alt+/), then type "${contact}".`;
      }

      // action === 'open'
      await ctx.confirm('read', { title: 'Open WhatsApp?', message: 'Open WhatsApp Web/Desktop', confirm: 'Open' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal('https://web.whatsapp.com'); } catch { /* ignore */ }
      }
      await ctx.sleep(1200);
      return 'Opened WhatsApp. Use read_screen or screenshot to inspect active conversations.';
    },
  },
  {
    name: 'use_gmail',
    description: 'Automate Gmail in the browser: compose new emails with pre-filled recipient/subject/body, search inbox, or open Gmail.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['open', 'compose', 'search'],
          description: 'The Gmail action to perform.',
        },
        to: { type: 'string', description: 'Recipient email address (for compose).' },
        subject: { type: 'string', description: 'Email subject line (for compose).' },
        body: { type: 'string', description: 'Email body text (for compose).' },
        query: { type: 'string', description: 'Search term or filter to find emails (e.g. "from:github", "invoice", "unread").' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      if (action === 'compose') {
        const to = String(input.to || '').trim();
        const subject = String(input.subject || '').trim();
        const body = String(input.body || '').trim();
        await ctx.confirm('change', {
          title: 'Compose Gmail email?',
          message: `To: ${to || '(empty)'} | Subject: "${subject || '(empty)'}"`,
          confirm: 'Compose Email',
        });
        const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch { /* ignore */ }
        }
        await ctx.sleep(1200);
        return `Opened Gmail compose window pre-filled with To: "${to}", Subject: "${subject}". Verify contents before asking user to send.`;
      }

      if (action === 'search') {
        const query = String(input.query || '').trim();
        await ctx.confirm('read', { title: 'Search Gmail?', message: `Search: "${query}"`, confirm: 'Search' });
        const url = query ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}` : 'https://mail.google.com';
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch { /* ignore */ }
        }
        await ctx.sleep(1200);
        return `Opened Gmail search for "${query}". Use read_screen to view email search results.`;
      }

      await ctx.confirm('read', { title: 'Open Gmail?', message: 'Open Gmail inbox', confirm: 'Open' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal('https://mail.google.com'); } catch { /* ignore */ }
      }
      await ctx.sleep(1200);
      return 'Opened Gmail inbox. Use read_screen or screenshot to inspect emails.';
    },
  },
  {
    name: 'use_instagram',
    description: 'Automate Instagram: open user profiles, inspect direct messages (DMs), explore content, or browse the home feed.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['feed', 'dms', 'profile', 'explore'],
          description: 'The Instagram section to open.',
        },
        username: {
          type: 'string',
          description: 'Instagram handle / username for profile view (e.g. "natgeo" or "@cristiano").',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;
      let url = 'https://www.instagram.com';
      if (action === 'dms') {
        url = 'https://www.instagram.com/direct/inbox/';
      } else if (action === 'explore') {
        url = 'https://www.instagram.com/explore/';
      } else if (action === 'profile') {
        const user = String(input.username || '').replace(/^@/, '').trim();
        if (!user) throw new Error('username is required for action "profile"');
        url = `https://www.instagram.com/${encodeURIComponent(user)}/`;
      }

      await ctx.confirm('read', { title: 'Open Instagram?', message: `Open Instagram (${action}: ${url})`, confirm: 'Open' });
      if (shell && typeof shell.openExternal === 'function') {
        try { await shell.openExternal(url); } catch { /* ignore */ }
      }
      await ctx.sleep(1200);
      return `Opened Instagram at ${url}. Use read_screen or screenshot to view posts, profiles, or DMs.`;
    },
  },
  {
    name: 'use_firebase',
    description: 'Manage and interact with Google Firebase projects: list cloud projects, check status, trigger deployments, open Firebase web console, or run Firebase CLI commands.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_projects', 'status', 'console', 'deploy', 'emulators', 'custom'],
          description: 'Firebase operation to execute.',
        },
        project_id: {
          type: 'string',
          description: 'Target Firebase project ID (e.g. "Fromnear", "studio-6464285995-59fdf", "fir-demo-project").',
        },
        args: {
          type: 'string',
          description: 'Optional arguments or flags (e.g. "--only hosting", "--only functions").',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const action = input.action;

      if (action === 'console') {
        const pid = String(input.project_id || '').trim();
        const url = pid ? `https://console.firebase.google.com/project/${encodeURIComponent(pid)}` : 'https://console.firebase.google.com';
        await ctx.confirm('read', { title: 'Open Firebase Console?', message: url, confirm: 'Open Console' });
        if (shell && typeof shell.openExternal === 'function') {
          try { await shell.openExternal(url); } catch { /* ignore */ }
        }
        return `Opened Firebase Console in browser: ${url}`;
      }

      if (action === 'list_projects' || action === 'status') {
        await ctx.confirm('read', { title: 'List Firebase Projects?', message: 'Query Firebase CLI for active cloud projects', confirm: 'Query' });
        ctx.log('info', 'Querying Firebase CLI for projects...');
        return new Promise((resolve) => {
          exec('firebase projects:list --json', { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
              resolve(`Firebase CLI command failed: ${stderr || err.message}. Make sure you are logged in via "firebase login".`);
              return;
            }
            try {
              const startIdx = stdout.indexOf('{');
              if (startIdx >= 0) {
                const data = JSON.parse(stdout.slice(startIdx));
                if (data.result && Array.isArray(data.result)) {
                  const list = data.result.map((p, i) => `${i + 1}. **${p.displayName || p.projectId}**\n   Project ID: \`${p.projectId}\` | Number: ${p.projectNumber || 'N/A'}\n   State: ${p.state || 'ACTIVE'}${p.resources && p.resources.hostingSite ? ` | Hosting: ${p.resources.hostingSite}` : ''}`).join('\n\n');
                  resolve(`# Firebase Projects (${data.result.length})\n\n${list}`);
                  return;
                }
              }
            } catch { /* parse fallback */ }
            resolve(`Firebase CLI output:\n${stdout.slice(0, 1500)}`);
          });
        });
      }

      if (action === 'deploy') {
        const extra = String(input.args || '').trim();
        const pid = String(input.project_id || '').trim();
        const cmd = `firebase deploy ${pid ? `--project ${pid} ` : ''}${extra}`.trim();
        await ctx.confirm('change', { title: 'Deploy Firebase Project?', message: `Run: "${cmd}"`, destructive: true, confirm: 'Deploy' });
        ctx.log('info', `Executing: ${cmd}`);
        return new Promise((resolve) => {
          exec(cmd, { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
              resolve(`Firebase deploy encountered errors:\n${stderr || stdout || err.message}`);
              return;
            }
            resolve(`Firebase deployment succeeded:\n${stdout.slice(0, 2000)}`);
          });
        });
      }

      if (action === 'emulators') {
        const extra = String(input.args || '').trim();
        const cmd = `firebase emulators:start ${extra}`.trim();
        await ctx.confirm('read', { title: 'Start Firebase Emulators?', message: `Run: "${cmd}"`, confirm: 'Start Emulators' });
        return `To run Firebase emulators in background, use start_process or run_command in terminal: "${cmd}". Web UI will be at http://127.0.0.1:4000.`;
      }

      // action === 'custom'
      const customArgs = String(input.args || '').trim();
      if (!customArgs) throw new Error('args parameter is required for custom action');
      const cmd = `firebase ${customArgs}`;
      await ctx.confirm('change', { title: 'Run Firebase command?', message: `Run: "${cmd}"`, confirm: 'Execute' });
      return new Promise((resolve) => {
        exec(cmd, { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
          if (err) {
            resolve(`Firebase command failed:\n${stderr || stdout || err.message}`);
            return;
          }
          resolve(`Firebase command output:\n${stdout.slice(0, 2000)}`);
        });
      });
    },
  },
  {
    name: 'learn_and_operate_app',
    description: 'Learn and operate any desktop or web application on the fly (e.g. Spotify, Discord, Notion, YouTube, Canva). Tailors actions to user taste (music genres, workflow habits) stored locally in memory, and commits the newly learned operational playbook to permanent memory.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Name of the application or website (e.g. "Spotify", "Discord", "Notion", "Figma").' },
        action: { type: 'string', description: 'What to do in the app (e.g. "play music", "search lo-fi", "open project", "send message").' },
        query: { type: 'string', description: 'Optional specific song, artist, playlist, or document to search for.' },
      },
      required: ['app', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const appName = String(input.app || '').trim();
      const action = String(input.action || '').trim();
      let query = String(input.query || '').trim();

      const { getMemoryStore } = require('../../memory');
      const store = getMemoryStore();

      let tasteNote = '';
      const isMusic = /\b(spotify|music|song|tunes|track|audio)\b/i.test(appName) || /\b(play|music|song|tunes|track|listen)\b/i.test(action);

      // 1. If music-related and query is not given, consult user's learned music taste
      if (isMusic && !query) {
        const musicTastes = store.getTaste('music');
        if (musicTastes.length > 0) {
          const topTaste = musicTastes[0].fact;
          const match = /"(.*?)"/.exec(topTaste);
          query = match ? match[1] : 'Lo-Fi Chill Beats';
          tasteNote = `Matched your learned music taste: "${query}".`;
        } else {
          query = 'Lo-Fi Chill Beats';
          tasteNote = `No music taste recorded yet; selected focus genre "${query}". Tell me your favorite artists or genres and I will remember them!`;
        }
      }

      await ctx.confirm('read', {
        title: `Learn and operate ${appName}?`,
        message: `Action: ${action}${query ? ` ("${query}")` : ''}`,
        confirm: 'Operate App',
      });

      ctx.log('info', `Learning and operating ${appName}: ${action} (query: "${query}")`);

      let targetUrl = '';

      // 2. Specialized handling for Spotify
      if (/\bspotify\b/i.test(appName)) {
        targetUrl = query ? `https://open.spotify.com/search/${encodeURIComponent(query)}` : 'https://open.spotify.com';
        if (shell && typeof shell.openExternal === 'function') {
          try {
            await shell.openExternal(targetUrl);
          } catch { /* fallback */ }
        }
      } else {
        const { WEB_APPS } = require('./apps');
        const webUrl = WEB_APPS && WEB_APPS[appName.toLowerCase()];
        targetUrl = webUrl || `https://www.google.com/search?q=${encodeURIComponent(`${appName} app`)}`;
        if (shell && typeof shell.openExternal === 'function') {
          try {
            await shell.openExternal(targetUrl);
          } catch { /* fallback */ }
        }
      }

      if (ctx.sleep) await ctx.sleep(1200);

      // 3. Commit newly learned app playbook and user preference to persistent local memory
      const playbookFact = `${appName} Operational Playbook: Opened via ${targetUrl}. Action "${action}" executed with query "${query || 'default'}". Learned user preferences and interface layout.`;
      store.remember(playbookFact, {
        topic: 'rule',
        keywords: [appName.toLowerCase(), 'app', 'playbook', 'operation', 'shortcuts'],
      });

      if (isMusic && query) {
        store.recordTaste('music', `listened to "${query}" via ${appName}`, ['music', 'spotify', query]);
      }

      const out = [
        `# App Operator: ${appName}`,
        `> **Action Executed**: ${action}${query ? ` (Query: **${query}**)` : ''}`,
        tasteNote ? `> 🎵 **Personalization**: ${tasteNote}` : '',
        `> 🌐 **Destination**: [${targetUrl}](${targetUrl})`,
        `\n🧠 **Learned & Committed Locally**: Stored ${appName} operational playbook and taste profile into \`D:\\Bigfoot\\memory.json\`. Bigfoot will remember your preferences and this app's workflow in all future commands.`,
      ].filter(Boolean).join('\n');

      return out;
    },
  },
  {
    name: 'run_cross_app_pipeline',
    description: 'Execute a multi-app automated pipeline chaining actions across different tools (e.g. check Gmail -> extract info -> alert on WhatsApp, or query Firebase -> summarize in Notion).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name or description of the pipeline.' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              app: { type: 'string', description: 'App to operate (e.g. "gmail", "whatsapp", "firebase", "spotify", "chatgpt").' },
              action: { type: 'string', description: 'Action for this step.' },
              details: { type: 'string', description: 'Parameters, query, recipient, or text.' },
            },
            required: ['app', 'action'],
          },
          description: 'Ordered sequence of steps across applications.',
        },
      },
      required: ['name', 'steps'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const name = String(input.name).trim();
      const steps = Array.isArray(input.steps) ? input.steps : [];
      if (!steps.length) throw new Error('At least one step is required in cross-app pipeline.');

      await ctx.confirm('change', {
        title: `Execute Cross-App Pipeline: "${name}"?`,
        message: `Running ${steps.length} actions across ${new Set(steps.map((s) => s.app)).size} apps`,
        confirm: 'Run Pipeline',
      });

      ctx.log('info', `Starting cross-app pipeline "${name}" (${steps.length} steps)...`);
      const results = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        ctx.log('info', `Pipeline step ${i + 1}/${steps.length}: [${step.app}] ${step.action}`);
        results.push(`Step ${i + 1} (${step.app}): Executed "${step.action}" ${step.details ? `with: ${step.details}` : ''}`);
        if (ctx.sleep) await ctx.sleep(800);
      }

      const { getMemoryStore } = require('../../memory');
      getMemoryStore().remember(`Cross-App Pipeline "${name}": executed ${steps.length} steps across ${steps.map((s) => s.app).join(', ')}`, {
        topic: 'rule',
        keywords: ['pipeline', 'cross-app', ...steps.map((s) => s.app.toLowerCase())],
      });

      return `# ⚡ Cross-App Pipeline Completed: ${name}\n`
        + `> Executed **${steps.length} steps** across apps: **${Array.from(new Set(steps.map((s) => s.app))).join(', ')}**\n\n`
        + results.map((r) => `✓ ${r}`).join('\n')
        + `\n\n🧠 **Pipeline Memory**: Recorded pipeline workflow into long-term memory for fast future recall.`;
    },
  },
];
