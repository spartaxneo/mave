'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mediaControlPlugin = require('../src/main/plugins/builtin/media_control');
const systemPlugin = require('../src/main/plugins/builtin/system');
const { validate } = require('../src/main/plugins/registry');

test('media_control builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(mediaControlPlugin));
  assert.equal(mediaControlPlugin.length, 1);

  for (const tool of mediaControlPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} must be valid: ${error}`);
  }

  assert.equal(mediaControlPlugin[0].name, 'control_media_playback');
});

test('system builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(systemPlugin));
  assert.equal(systemPlugin.length, 4);

  for (const tool of systemPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} must be valid: ${error}`);
  }

  const names = systemPlugin.map((t) => t.name);
  assert.ok(names.includes('get_system_diagnostics'));
  assert.ok(names.includes('manage_system_power'));
  assert.ok(names.includes('toggle_wake_word'));
  assert.ok(names.includes('manage_uac_and_elevation'));
});

test('get_system_diagnostics gathers real hardware metrics', async () => {
  const tool = systemPlugin.find((t) => t.name === 'get_system_diagnostics');
  assert.ok(tool);

  const logs = [];
  const ctx = {
    log: (_kind, text) => logs.push(text),
  };

  const report = await tool.run({}, ctx);
  assert.ok(typeof report === 'string');
  assert.ok(report.includes('SYSTEM TELEMETRY REPORT'));
  assert.ok(report.includes('Memory:'));
  assert.ok(report.includes('Storage:'));
});

const webPlugin = require('../src/main/plugins/builtin/web');

test('web builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(webPlugin));
  assert.equal(webPlugin.length, 7);

  for (const tool of webPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Web tool ${tool.name} must be valid: ${error}`);
  }

  const names = webPlugin.map((t) => t.name);
  assert.ok(names.includes('web_search'));
  assert.ok(names.includes('read_webpage'));
  assert.ok(names.includes('knowledge_lookup'));
  assert.ok(names.includes('live_news_search'));
  assert.ok(names.includes('research_and_learn'));
  assert.ok(names.includes('browse_and_research'));
  assert.ok(names.includes('handle_antibot_captcha'));
});

test('parseGoogleNewsRss extracts clean structured news items', () => {
  const xml = `
    <rss version="2.0">
      <channel>
        <title>Google News</title>
        <item>
          <title>DeepSeek V4 Architecture Analysis - AI Insider</title>
          <link>https://news.google.com/rss/articles/CBMiZ2h0dHBz...</link>
          <pubDate>Thu, 15 Oct 2026 10:30:00 GMT</pubDate>
          <source url="https://ai-insider.example.com">AI Insider</source>
        </item>
        <item>
          <title>Google Quantum Willow Processor Breaks Supercomputer Records</title>
          <link>https://news.google.com/rss/articles/CBMiZ2h0dHA1...</link>
          <pubDate>Wed, 14 Oct 2026 18:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
  `;
  const items = webPlugin.parseGoogleNewsRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'DeepSeek V4 Architecture Analysis');
  assert.equal(items[0].source, 'AI Insider');
  assert.equal(items[0].pubDate, 'Thu, 15 Oct 2026 10:30:00 GMT');
  assert.equal(items[1].title, 'Google Quantum Willow Processor Breaks Supercomputer Records');
});

test('research_and_learn synthesizes facts and commits to MemoryStore', async () => {
  const tool = webPlugin.find((t) => t.name === 'research_and_learn');
  assert.ok(tool);

  const logs = [];
  const ctx = {
    confirm: async () => {},
    log: (_k, text) => logs.push(text),
    listLimit: 10,
  };

  const result = await tool.run({
    topic: 'Alan Turing',
    open_browser: false,
    save_to_memory: true,
  }, ctx);

  assert.ok(typeof result === 'string');
  assert.ok(result.includes('Research Synthesis: Alan Turing'));
  assert.ok(result.includes('Encyclopedic Foundation'));
  assert.ok(result.includes('Learned & Committed to Long-Term Memory'));

  // Verify it was committed to MemoryStore
  const { getMemoryStore } = require('../src/main/memory');
  const store = getMemoryStore();
  const memories = store.recall('Alan Turing', { topic: 'research' });
  assert.ok(memories.length > 0);
  assert.ok(memories[0].fact.toLowerCase().includes('turing'));
});

const appAutomationPlugin = require('../src/main/plugins/builtin/app_automation');

test('app_automation builtin plugin tools have valid schemas and names', () => {
  assert.ok(Array.isArray(appAutomationPlugin));
  assert.equal(appAutomationPlugin.length, 8);

  for (const tool of appAutomationPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `App automation tool ${tool.name} must be valid: ${error}`);
  }

  const names = appAutomationPlugin.map((t) => t.name);
  assert.ok(names.includes('use_chatgpt'));
  assert.ok(names.includes('use_claude'));
  assert.ok(names.includes('use_whatsapp'));
  assert.ok(names.includes('use_gmail'));
  assert.ok(names.includes('use_instagram'));
  assert.ok(names.includes('use_firebase'));
  assert.ok(names.includes('learn_and_operate_app'));
  assert.ok(names.includes('run_cross_app_pipeline'));
});

test('app_automation tools generate proper actions and deep links', async () => {
  const ctx = {
    confirm: async () => {},
    log: () => {},
    sleep: async () => {},
  };

  // 1. ChatGPT
  const chatgpt = appAutomationPlugin.find((t) => t.name === 'use_chatgpt');
  const cgRes = await chatgpt.run({ prompt: 'Write a quicksort in Python' }, ctx);
  assert.ok(cgRes.includes('quicksort in Python'));

  // 1b. Claude
  const claude = appAutomationPlugin.find((t) => t.name === 'use_claude');
  const clRes = await claude.run({ prompt: 'Analyze system architecture' }, ctx);
  assert.ok(clRes.includes('Analyze system architecture'));

  // 2. WhatsApp
  const whatsapp = appAutomationPlugin.find((t) => t.name === 'use_whatsapp');
  const waRes = await whatsapp.run({ action: 'send_message', phone: '14155552671', message: 'Hello from Bigfoot!' }, ctx);
  assert.ok(waRes.includes('14155552671'));
  assert.ok(waRes.includes('Hello from Bigfoot!'));

  // 3. Gmail
  const gmail = appAutomationPlugin.find((t) => t.name === 'use_gmail');
  const gmRes = await gmail.run({ action: 'compose', to: 'team@example.com', subject: 'Sprint Review', body: 'Hi team' }, ctx);
  assert.ok(gmRes.includes('team@example.com'));
  assert.ok(gmRes.includes('Sprint Review'));

  // 4. Instagram
  const ig = appAutomationPlugin.find((t) => t.name === 'use_instagram');
  const igRes = await ig.run({ action: 'dms' }, ctx);
  assert.ok(igRes.includes('direct/inbox'));

  // 5. Firebase
  const fb = appAutomationPlugin.find((t) => t.name === 'use_firebase');
  const fbConsole = await fb.run({ action: 'console', project_id: 'Fromnear' }, ctx);
  assert.ok(fbConsole.includes('console.firebase.google.com/project/Fromnear'));

  // 6. Learn and operate app on the fly (Spotify with music taste personalization)
  const learnTool = appAutomationPlugin.find((t) => t.name === 'learn_and_operate_app');
  assert.ok(learnTool);
  const learnRes = await learnTool.run({ app: 'Spotify', action: 'play music' }, ctx);
  assert.ok(learnRes.includes('App Operator: Spotify'));
  assert.ok(learnRes.includes('open.spotify.com'));
  assert.ok(learnRes.includes('Learned & Committed Locally'));

  // 7. Cross-app pipeline
  const pipeTool = appAutomationPlugin.find((t) => t.name === 'run_cross_app_pipeline');
  assert.ok(pipeTool);
  const pipeRes = await pipeTool.run({
    name: 'Morning Routine',
    steps: [
      { app: 'gmail', action: 'open' },
      { app: 'spotify', action: 'play music', details: 'synthwave' }
    ]
  }, ctx);
  assert.ok(pipeRes.includes('Cross-App Pipeline Completed: Morning Routine'));
});

test('autoExtractTaste learns user tastes and injects them into context', () => {
  const { MemoryStore } = require('../src/main/memory');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  const tempFile = path.join(os.tmpdir(), `test_taste_${Date.now()}.json`);
  try {
    const store = new MemoryStore(tempFile);

    // 1. User says they like synthwave
    store.autoExtractTaste('I love synthwave and electronic music');
    const tastes = store.getTaste('music');
    assert.equal(tastes.length, 1);
    assert.ok(tastes[0].fact.includes('synthwave'));

    // 2. User says they prefer dark mode
    store.autoExtractTaste('I prefer dark mode in all apps');
    const prefs = store.recall('dark mode');
    assert.equal(prefs.length, 1);

    // 3. Negative preference (dislikes)
    store.autoExtractTaste("Don't ever play jazz");
    const dislikes = store.recall('jazz');
    assert.equal(dislikes.length, 1);
    assert.ok(dislikes[0].fact.includes('dislikes / avoids: jazz'));

    // 4. Context summary prioritizes music taste on music queries
    const summary = store.contextSummary('open spotify and play music');
    assert.ok(summary.includes('synthwave'));
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('seedAppPlaybooks populates and recalls operational playbooks', () => {
  const { MemoryStore } = require('../src/main/memory');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  const tempFile = path.join(os.tmpdir(), `test_playbooks_${Date.now()}.json`);
  try {
    const store = new MemoryStore(tempFile);
    assert.equal(store.memories.length, 0);

    store.seedAppPlaybooks();
    assert.ok(store.memories.length >= 5);

    // Recall WhatsApp playbook
    const wa = store.recall('how to use whatsapp');
    assert.ok(wa.length > 0);
    assert.ok(wa[0].fact.toLowerCase().includes('whatsapp'));

    // Recall Firebase playbook
    const fb = store.recall('firebase cli deploy');
    assert.ok(fb.length > 0);
    assert.ok(fb[0].fact.toLowerCase().includes('firebase'));

    // Recall Gmail playbook
    const gm = store.recall('compose email in gmail');
    assert.ok(gm.length > 0);
    assert.ok(gm[0].fact.toLowerCase().includes('gmail'));
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

const localProfilerPlugin = require('../src/main/plugins/builtin/local_profiler');

test('local_profiler builtin plugin tools have valid schemas and execute locally', async () => {
  assert.ok(Array.isArray(localProfilerPlugin));
  assert.equal(localProfilerPlugin.length, 2);

  for (const tool of localProfilerPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Local profiler tool ${tool.name} must be valid: ${error}`);
  }

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  const scanTool = localProfilerPlugin.find((t) => t.name === 'scan_local_environment');
  const scanRes = await scanTool.run({}, ctx);
  assert.ok(typeof scanRes === 'string');
  assert.ok(scanRes.includes('Local Environment & Taste Scan'));
  assert.ok(scanRes.includes('Hardware Profile'));

  const profileTool = localProfilerPlugin.find((t) => t.name === 'get_user_taste_profile');
  const profileRes = await profileTool.run({ category: 'all' }, ctx);
  assert.ok(profileRes.includes('User Personal Taste & Habit Profile'));
  assert.ok(profileRes.includes('Circadian Focus'));
});

const demonstrationPlugin = require('../src/main/plugins/builtin/demonstration');

test('demonstration plugin records UI steps and saves workflow recipe', async () => {
  assert.ok(Array.isArray(demonstrationPlugin));
  assert.equal(demonstrationPlugin.length, 4);

  for (const tool of demonstrationPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Demonstration tool ${tool.name} must be valid: ${error}`);
  }

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Start demonstration
  const startTool = demonstrationPlugin.find((t) => t.name === 'start_demonstration');
  const startRes = await startTool.run({ workflow_name: 'Photoshop Web Export', app_name: 'Photoshop', goal: 'Quick web export' }, ctx);
  assert.ok(startRes.includes('Recording Started'));

  // 2. Record steps
  const stepTool = demonstrationPlugin.find((t) => t.name === 'record_demonstration_step');
  const s1 = await stepTool.run({ action: 'shortcut', target: 'File Menu', value: 'Alt+F' }, ctx);
  assert.ok(s1.includes('Recorded step 1'));
  const s2 = await stepTool.run({ action: 'click', target: 'Export for Web button' }, ctx);
  assert.ok(s2.includes('Recorded step 2'));

  // 3. Finish demonstration
  const finishTool = demonstrationPlugin.find((t) => t.name === 'finish_demonstration');
  const finishRes = await finishTool.run({ description: 'Export compressed JPEG' }, ctx);
  assert.ok(finishRes.includes('Workflow Recipe Learned: Photoshop Web Export'));
  assert.ok(finishRes.includes('Total Steps: **2**'));

  // 4. List demonstrations
  const listTool = demonstrationPlugin.find((t) => t.name === 'list_demonstrations');
  const listRes = await listTool.run({ app: 'Photoshop' }, ctx);
  assert.ok(listRes.includes('Learned Workflow Recipes'));
  assert.ok(listRes.includes('Photoshop'));
});

test('circadian rhythm and feedback tracking adapt preferences over time', () => {
  const { MemoryStore } = require('../src/main/memory');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  const tempFile = path.join(os.tmpdir(), `test_circadian_${Date.now()}.json`);
  try {
    const store = new MemoryStore(tempFile);

    // 1. Circadian time checks
    const morningDate = new Date('2026-10-15T08:30:00');
    const nightDate = new Date('2026-10-15T23:30:00');

    const morningTaste = store.getCircadianTaste('music', morningDate);
    assert.equal(morningTaste.period, 'morning');
    assert.ok(morningTaste.taste.includes('Acoustic'));

    const nightTaste = store.getCircadianTaste('music', nightDate);
    assert.equal(nightTaste.period, 'night');
    assert.ok(nightTaste.taste.includes('Dark Synthwave'));

    // 2. Feedback tracking (User skips a song)
    store.recordFeedback({ action: 'music', item: 'Heavy Death Metal', feedback: 'skip', reason: 'too loud for coding' });
    const skipped = store.recall('Heavy Death Metal');
    assert.equal(skipped.length, 1);
    assert.ok(skipped[0].fact.includes('avoided/skipped'));

    // 3. Feedback tracking (User strongly likes something)
    store.recordFeedback({ action: 'music', item: 'Daft Punk - Tron Legacy', feedback: 'like', reason: 'amazing focus' });
    const liked = store.recall('Tron Legacy');
    assert.equal(liked.length, 1);
    assert.ok(liked[0].fact.includes('strongly liked'));
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test('system power management and wake-word controls operate as expected', async () => {
  const powerTool = systemPlugin.find((t) => t.name === 'manage_system_power');
  const wakeTool = systemPlugin.find((t) => t.name === 'toggle_wake_word');
  assert.ok(powerTool);
  assert.ok(wakeTool);

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Battery status check
  const batt = await powerTool.run({ action: 'battery_status' }, ctx);
  assert.ok(typeof batt === 'string');
  assert.ok(batt.includes('Battery') || batt.includes('AC Desktop power'));

  // 2. Wake-on-LAN invalid MAC rejection
  await assert.rejects(
    () => powerTool.run({ action: 'wake_on_lan', target: 'invalid-mac' }, ctx),
    /Invalid MAC address/
  );

  // 3. Toggle wake-word
  const enabledRes = await wakeTool.run({ enabled: true, phrase: 'Hey Bigfoot' }, ctx);
  assert.ok(enabledRes.includes('Hands-Free Wake-Word Activated'));

  const disabledRes = await wakeTool.run({ enabled: false }, ctx);
  assert.ok(disabledRes.includes('Wake-Word Listener Deactivated'));
});

const appScriptingPlugin = require('../src/main/plugins/builtin/app_scripting');

test('app_scripting builtin plugin tools have valid schemas and execute spreadsheets and scripts', async () => {
  assert.ok(Array.isArray(appScriptingPlugin));
  assert.equal(appScriptingPlugin.length, 2);

  for (const tool of appScriptingPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Scripting tool ${tool.name} must be valid: ${error}`);
  }

  const excelTool = appScriptingPlugin.find((t) => t.name === 'automate_excel');
  const scriptTool = appScriptingPlugin.find((t) => t.name === 'run_app_script');
  assert.ok(excelTool);
  assert.ok(scriptTool);

  const logs = [];
  const ctx = {
    confirm: async () => {},
    log: (_k, text) => logs.push(text),
  };

  const tempCsv = path.join(os.tmpdir(), `test_sheet_${Date.now()}.csv`);
  try {
    // 1. Create spreadsheet
    const createRes = await excelTool.run({
      action: 'create_sheet',
      file_path: tempCsv,
      data: ['Item,Price,Qty', 'Laptop,1200,2', 'Mouse,25,5'],
    }, ctx);
    assert.ok(createRes.includes('Created') || createRes.includes('SUCCESS'));

    // 2. Read spreadsheet
    const readRes = await excelTool.run({
      action: 'read_cells',
      file_path: tempCsv,
    }, ctx);
    assert.ok(readRes.includes('Laptop') || readRes.includes('Mouse'));

    // 3. Run PowerShell automation script
    const psRes = await scriptTool.run({
      app: 'powershell',
      script: 'Write-Output "BIGFOOT_SCRIPT_OK"',
    }, ctx);
    assert.ok(psRes.includes('BIGFOOT_SCRIPT_OK'));
  } finally {
    if (fs.existsSync(tempCsv)) fs.unlinkSync(tempCsv);
  }
});

const smartHomePlugin = require('../src/main/plugins/builtin/smart_home');

test('smart_home builtin plugin tools have valid schemas and scan LAN devices', async () => {
  assert.ok(Array.isArray(smartHomePlugin));
  assert.equal(smartHomePlugin.length, 2);

  for (const tool of smartHomePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Smart Home tool ${tool.name} must be valid: ${error}`);
  }

  const controlTool = smartHomePlugin.find((t) => t.name === 'control_smart_home');
  const discoverTool = smartHomePlugin.find((t) => t.name === 'discover_lan_devices');
  assert.ok(controlTool);
  assert.ok(discoverTool);

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // Discover LAN devices via ARP table
  const scanReport = await discoverTool.run({}, ctx);
  assert.ok(typeof scanReport === 'string');
  assert.ok(scanReport.includes('LOCAL NETWORK DISCOVERY REPORT') || scanReport.includes('No active LAN devices'));
});

const selfEvolutionPlugin = require('../src/main/plugins/builtin/self_evolution');

test('self_evolution builtin plugin tools have valid schemas and execute introspection loop', async () => {
  assert.ok(Array.isArray(selfEvolutionPlugin));
  assert.equal(selfEvolutionPlugin.length, 4);

  for (const tool of selfEvolutionPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Self Evolution tool ${tool.name} must be valid: ${error}`);
  }

  const introspectTool = selfEvolutionPlugin.find((t) => t.name === 'trigger_self_reflection');
  const consultTool = selfEvolutionPlugin.find((t) => t.name === 'consult_architect_ai');
  const patchTool = selfEvolutionPlugin.find((t) => t.name === 'apply_evolution_patch');
  const goalTool = selfEvolutionPlugin.find((t) => t.name === 'autonomous_goal_evolution_loop');
  assert.ok(introspectTool);
  assert.ok(consultTool);
  assert.ok(patchTool);
  assert.ok(goalTool);

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Introspect with mock log
  const auditRes = await introspectTool.run({ recent_log_snippets: ['Connection to remote model failed'] }, ctx);
  assert.ok(typeof auditRes === 'string');
  assert.ok(auditRes.includes('METACOGNITIVE AUDIT REPORT') || auditRes.includes('Introspection Complete'));

  // 2. Consult Architect
  const consultRes = await consultTool.run({ ticket_id: 'test_ticket_123' }, ctx);
  assert.ok(typeof consultRes === 'string');
  assert.ok(consultRes.includes('ARCHITECT CONSULTATION RESULT'));
  assert.ok(consultRes.includes('Proposed Target File'));

  // 3. Dry-run / validate patch
  const patchRes = await patchTool.run({
    target_file: 'src/main/plugins/builtin/temp_test_tool.js',
    code: 'module.exports = { name: "temp_test_tool", description: "A valid test tool.", input_schema: { type: "object", properties: {}, required: [] }, async run() { return "OK"; } };',
    ticket_id: 'test_ticket_123',
  }, ctx);
  assert.ok(patchRes.includes('SELF-EVOLUTION UPGRADE DEPLOYED'));

  // 4. Test autonomous goal evolution loop
  const goalRes = await goalTool.run({ focus_domain: 'all' }, ctx);
  assert.ok(goalRes.includes('AUTONOMOUS GOAL EVOLUTION AUDIT'));

  // Cleanup temporary file
  const fullTarget = path.resolve(__dirname, '../src/main/plugins/builtin/temp_test_tool.js');
  if (fs.existsSync(fullTarget)) fs.unlinkSync(fullTarget);
});

const screenMemoryPlugin = require('../src/main/plugins/builtin/screen_memory');

test('screen_memory builtin plugin tools have valid schemas and perform Total Recall', async () => {
  assert.ok(Array.isArray(screenMemoryPlugin));
  assert.equal(screenMemoryPlugin.length, 3);

  for (const tool of screenMemoryPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Screen Memory tool ${tool.name} must be valid: ${error}`);
  }

  const searchTool = screenMemoryPlugin.find((t) => t.name === 'search_screen_memory');
  const snapTool = screenMemoryPlugin.find((t) => t.name === 'capture_screen_memory_snapshot');
  const timelineTool = screenMemoryPlugin.find((t) => t.name === 'get_screen_memory_timeline');
  assert.ok(searchTool);
  assert.ok(snapTool);
  assert.ok(timelineTool);

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Capture snapshot
  const snapRes = await snapTool.run({ note: 'Unit test snapshot' }, ctx);
  assert.ok(typeof snapRes === 'string');
  assert.ok(snapRes.includes('Indexed Active Window into Memory'));

  // 2. Search snapshot
  const searchRes = await searchTool.run({ query: 'Active' }, ctx);
  assert.ok(typeof searchRes === 'string');

  // 3. Timeline
  const timeRes = await timelineTool.run({}, ctx);
  assert.ok(typeof timeRes === 'string');
  assert.ok(timeRes.includes('DESKTOP ACTIVITY TIMELINE') || timeRes.includes('No Activity Timeline'));
});

const meetingScribePlugin = require('../src/main/plugins/builtin/meeting_scribe');

test('meeting_scribe builtin plugin tools have valid schemas and generate minutes', async () => {
  assert.ok(Array.isArray(meetingScribePlugin));
  assert.equal(meetingScribePlugin.length, 4);

  for (const tool of meetingScribePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Meeting Scribe tool ${tool.name} must be valid: ${error}`);
  }

  const startTool = meetingScribePlugin.find((t) => t.name === 'start_meeting_scribe');
  const noteTool = meetingScribePlugin.find((t) => t.name === 'record_meeting_note');
  const finishTool = meetingScribePlugin.find((t) => t.name === 'finish_meeting_scribe');
  const listTool = meetingScribePlugin.find((t) => t.name === 'list_saved_meetings');

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Start meeting
  const startRes = await startTool.run({ title: 'Bigfoot Architecture Sync', participants: ['User', 'Bigfoot'] }, ctx);
  assert.ok(startRes.includes('MEETING SCRIBE ACTIVE'));

  // 2. Record notes
  await noteTool.run({ text: 'We will implement autonomous screen memory and RAG vault today.', speaker: 'Bigfoot' }, ctx);
  await noteTool.run({ text: 'Agreed, this will make the system completely sovereign.', speaker: 'User' }, ctx);

  // 3. Finish meeting
  const finishRes = await finishTool.run({}, ctx);
  assert.ok(finishRes.includes('MEETING CONCLUDED & MINUTES SAVED'));
  assert.ok(finishRes.includes('Action Items Identified'));

  // 4. List meetings
  const listRes = await listTool.run({}, ctx);
  assert.ok(listRes.includes('RECORDED MEETING ARCHIVE'));
});

const proactiveRoutinesPlugin = require('../src/main/plugins/builtin/proactive_routines');

test('proactive_routines builtin plugin tools have valid schemas and produce executive briefings', async () => {
  assert.ok(Array.isArray(proactiveRoutinesPlugin));
  assert.equal(proactiveRoutinesPlugin.length, 3);

  for (const tool of proactiveRoutinesPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Proactive Routines tool ${tool.name} must be valid: ${error}`);
  }

  const briefTool = proactiveRoutinesPlugin.find((t) => t.name === 'run_morning_briefing');
  const tidyTool = proactiveRoutinesPlugin.find((t) => t.name === 'tidy_workspace_folders');
  const configTool = proactiveRoutinesPlugin.find((t) => t.name === 'configure_proactive_routines');

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  // 1. Morning briefing
  const briefRes = await briefTool.run({ user_name: 'Commander' }, ctx);
  assert.ok(typeof briefRes === 'string');
  assert.ok(briefRes.includes('EXECUTIVE MORNING BRIEFING'));
  assert.ok(briefRes.includes('Commander'));

  // 2. Tidy folders preview
  const tidyRes = await tidyTool.run({ target_directory: os.tmpdir(), execute: false }, ctx);
  assert.ok(typeof tidyRes === 'string');
  assert.ok(tidyRes.includes('WORKSPACE HYGIENE') || tidyRes.includes('already clean'));

  // 3. Configure routines
  const configRes = await configTool.run({ morning_briefing_enabled: true, preferred_briefing_hour: 9 }, ctx);
  assert.ok(configRes.includes('PROACTIVE ROUTINES CONFIGURED'));
  assert.ok(configRes.includes('9:00'));
});

const knowledgeVaultPlugin = require('../src/main/plugins/builtin/knowledge_vault');

test('knowledge_vault builtin plugin tools have valid schemas and perform local neural RAG', async () => {
  assert.ok(Array.isArray(knowledgeVaultPlugin));
  assert.equal(knowledgeVaultPlugin.length, 3);

  for (const tool of knowledgeVaultPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Knowledge Vault tool ${tool.name} must be valid: ${error}`);
  }

  const indexTool = knowledgeVaultPlugin.find((t) => t.name === 'index_personal_document');
  const searchTool = knowledgeVaultPlugin.find((t) => t.name === 'search_knowledge_vault');
  const statusTool = knowledgeVaultPlugin.find((t) => t.name === 'get_vault_status');

  const ctx = {
    confirm: async () => {},
    log: () => {},
  };

  const sampleDoc = path.join(os.tmpdir(), `sample_spec_${Date.now()}.md`);
  try {
    fs.writeFileSync(sampleDoc, '# Project Willow\nWillow is a quantum architecture processor designed with supercomputing cryogenic links.', 'utf8');

    // 1. Index document
    const indexRes = await indexTool.run({ file_path: sampleDoc, category: 'Hardware' }, ctx);
    assert.ok(indexRes.includes('DOCUMENT INDEXED INTO PERSONAL VAULT'));
    assert.ok(indexRes.includes('Hardware'));

    // 2. Search document
    const searchRes = await searchTool.run({ query: 'quantum architecture' }, ctx);
    assert.ok(searchRes.includes('KNOWLEDGE VAULT SEARCH RESULTS'));
    assert.ok(searchRes.includes('Willow'));

    // 3. Vault status
    const statusRes = await statusTool.run({}, ctx);
    assert.ok(statusRes.includes('KNOWLEDGE VAULT STATUS'));
    assert.ok(statusRes.includes('sample_spec_'));
  } finally {
    if (fs.existsSync(sampleDoc)) fs.unlinkSync(sampleDoc);
  }
});


