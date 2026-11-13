'use strict';

require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const llm = require('../src/main/llm');
const { LocalProvider } = require('../src/main/llm/local');
const { OpenAIProvider } = require('../src/main/llm/openai');
const { AnthropicProvider } = require('../src/main/llm/anthropic');
const {
  Agent,
  isConversationalTask,
  isPlanInsteadOfAction,
  isFalseCompletionHallucination,
  isSelfOrCapabilityQuestion,
  taskUsesDesktopTools,
} = require('../src/main/agent');
const { PluginRegistry } = require('../src/main/plugins/registry');
const { matchIntent, matchTerminal } = require('../src/main/intents');
const { matchUiCommand } = require('../src/main/uicommand');
const { getJevEngine } = require('../src/main/decision/jev_engine');
const { ComputerExecutor } = require('../src/main/computer');
const { CostTracker } = require('../src/main/costs');

test('conversational & capability inquiries (including "what you can do") never classify as PC actions', () => {
  const conversationalQueries = [
    'what you can do',
    'what all you can do',
    'what things you can do',
    'tell me what you can do',
    'what capabilities are configured in MAVE right now?',
    'what features do you have',
    'how do I open a terminal in Windows?',
    'can you explain how DNS works?',
    'what you can create or open?',
    'thanks mave',
    'hi there',
    'how are you doing today?',
  ];

  const jev = getJevEngine();
  for (const q of conversationalQueries) {
    assert.equal(isConversationalTask(q), true, `Expected conversational=true for "${q}"`);
    assert.equal(taskUsesDesktopTools(q, { mode: 'work' }), false, `Expected desktopTools=false for "${q}"`);
    assert.equal(matchTerminal(q), null, `Expected matchTerminal=null for "${q}"`);
    assert.equal(matchUiCommand(q), null, `Expected matchUiCommand=null for "${q}"`);
    assert.equal(matchIntent(q), null, `Expected matchIntent=null for "${q}"`);
    assert.notEqual(jev.evaluateIntent(q).type, 'immediate_action', `Expected no Jev immediate action for "${q}"`);
    assert.equal(isFalseCompletionHallucination('I can help with coding, explanations, and tasks.', q, false), false);
    assert.equal(isPlanInsteadOfAction('I will explain how that works first.', q), false);
  }

  assert.equal(isSelfOrCapabilityQuestion('what you can do'), true);
  assert.equal(isSelfOrCapabilityQuestion('What capabilities are configured in MAVE right now?'), true);
});

test('explicit action commands still trigger desktop tools in Work mode and stay blocked in Chat mode', () => {
  const actionCommands = [
    'open Chrome',
    'can you please open Spotify',
    'run npm test in the terminal',
    'click Sign in',
    'create a file index.html',
    'where is save?',
    'what is on my screen',
  ];

  for (const cmd of actionCommands) {
    assert.equal(isConversationalTask(cmd), false, `Expected conversational=false for "${cmd}"`);
    assert.equal(taskUsesDesktopTools(cmd, { mode: 'work' }), true, `Expected desktopTools=true in Work mode for "${cmd}"`);
    assert.equal(taskUsesDesktopTools(cmd, { mode: 'chat' }), false, `Expected desktopTools=false in Chat mode for "${cmd}"`);
  }

  assert.deepEqual(matchTerminal('run npm test in the terminal'), { kind: 'run', command: 'npm test' });
  assert.equal(matchIntent('find out why TCP drops packets'), null);
});

test('PluginRegistry strips desktop/terminal tools for chatOnly turns', () => {
  const registry = new PluginRegistry();
  registry.loadBuiltins();

  assert.deepEqual(registry.definitionsForTask('what you can do', 'local', { chatOnly: true }), []);
  assert.deepEqual(registry.definitionsForTask('what you can do', 'openai', { chatOnly: true }), []);

  const webOnly = registry.definitionsForTask('who founded Anthropic?', 'local', { chatOnly: true, readOnlyWeb: true });
  const webNames = webOnly.map((t) => t.name);
  assert.ok(!webNames.includes('terminal'));
  assert.ok(!webNames.includes('run_command'));
  assert.ok(!webNames.includes('open_app'));
  assert.ok(!webNames.includes('click_element'));
  assert.ok(webNames.includes('web_search'));
});

test('LLM providers disable computer schema and omit empty tools array for chat-only turns', () => {
  const screen = { width: 1280, height: 720 };
  const sampleTools = [
    { name: 'terminal', description: 'Open terminal', input_schema: { type: 'object', properties: {} } },
    { name: 'open_app', description: 'Open app', input_schema: { type: 'object', properties: {} } },
  ];

  const oai = new OpenAIProvider({ apiKey: 'test', model: 'gpt-4o', system: 'sys', tools: sampleTools, screen });
  assert.ok(oai.tools.length === 3);
  oai.updateTools([], { computer: false });
  assert.equal(oai.tools.length, 0);

  const localProv = new LocalProvider({
    runtime: {},
    model: 'qwen3-vl-4b',
    label: 'Qwen3-VL 4B',
    system: 'BASE_SYS',
    tools: sampleTools,
    screen,
    computerEnabled: true,
  });
  assert.match(localProv.messages[0].content, /Acting:/);
  localProv.updateTools([], { computer: false });
  assert.equal(localProv.tools.length, 0);
  assert.doesNotMatch(localProv.messages[0].content, /Acting:/);
  assert.match(localProv.messages[0].content, /Conversational mode:/);

  const ant = new AnthropicProvider({ apiKey: 'test', model: 'claude-3-7', effort: 'medium', system: 'sys', tools: sampleTools });
  assert.equal(ant.params().tools.length, 3);
  ant.updateTools([], { computer: false });
  assert.equal('tools' in ant.params(), false);
});

test('Agent.run strips desktop tools, activeWindowNote, and Virtual PC takeover for "what you can do" and Chat mode', async () => {
  const plugins = new PluginRegistry();
  plugins.loadBuiltins();

  const recorded = { terminalLogs: [], windowReads: 0, screenReads: 0, toolUpdates: [], prompts: [] };
  class InspectableProvider {
    constructor({ tools, computerEnabled }) {
      this.id = 'openai';
      this.model = 'gpt-4o';
      this.messages = [];
      this.initialTools = tools;
      this.initialComputerEnabled = computerEnabled;
    }
    updateTools(tools, opts) {
      recorded.toolUpdates.push({ count: tools.length, names: tools.map((t) => t.name), computer: opts && opts.computer });
    }
    addUserMessage(text) {
      recorded.prompts.push(text);
    }
    async step() {
      return { model: 'gpt-4o', usage: { input_tokens: 10, output_tokens: 10 }, progress: [], text: 'I can help you answer questions, write code, or run workflows.', calls: [], stop: 'end' };
    }
  }

  const origCreate = llm.createProvider;
  const origResolve = llm.resolveProvider;
  llm.resolveProvider = () => 'openai';
  llm.createProvider = (settings, opts) => new InspectableProvider(opts);

  try {
    const values = { provider: 'openai', openaiModel: 'gpt-4o', assistantName: 'Mave', effort: 'medium', approvalMode: 'risky', maxTurns: 5, blockedWindowKeywords: '' };
    const agent = new Agent({
      settings: { get: (k) => values[k], secret: () => 'sk-test' },
      input: { windowTitle: async () => { recorded.windowReads += 1; return 'Secret Terminal Window'; }, cursor: async () => ({ x: 10, y: 10 }) },
      ui: { read: async () => { recorded.screenReads += 1; return {}; }, describe: () => '' },
      plugins,
      costs: new CostTracker(),
      computer: new ComputerExecutor({ input: {}, pointAt: async () => {} }),
      hooks: {
        state() {}, progress() {}, notice() {}, action() {}, draw() {},
        terminal: (kind, msg) => recorded.terminalLogs.push(`${kind}:${msg}`),
        approve: async () => true,
      },
    });
    agent.setTarget({ display: { id: 1 }, sent: { width: 1280, height: 720 }, sentToLocalDip: ([x, y]) => ({ x, y }) });

    // 1. Conversational phrasing in Work mode
    const res1 = await agent.run('what you can do', { mode: 'work' });
    assert.equal(res1.status, 'done');
    assert.equal(recorded.windowReads, 0, 'Must NOT inspect PC foreground window on conversational turn');
    assert.equal(recorded.screenReads, 0, 'Must NOT read desktop screen on conversational turn');
    assert.equal(recorded.toolUpdates[0].count, 0, 'Must send 0 tools for self capability inquiry');
    assert.equal(recorded.toolUpdates[0].computer, false, 'Must disable computer schema');
    assert.ok(!recorded.prompts[0].includes('Current active foreground window'));
    assert.ok(!recorded.prompts[0].includes('web_search({ query:'));
    assert.ok(!recorded.terminalLogs.some((l) => l.includes('MAVE Virtual Computer')));

    // 2. Imperative command while Chat mode toggle is active
    const res2 = await agent.run('open powershell and run dir', { mode: 'chat' });
    assert.equal(res2.status, 'done');
    assert.equal(recorded.windowReads, 0, 'Chat mode must NOT leak foreground PC window');
    assert.equal(recorded.toolUpdates[1].count, 0, 'Chat mode must expose 0 desktop/terminal tools');
    assert.equal(recorded.toolUpdates[1].computer, false, 'Chat mode must disable computer schema');

    // 3. Real command in Work mode restores desktop/terminal tools
    const res3 = await agent.run('open notepad', { mode: 'work' });
    assert.equal(res3.status, 'done');
    assert.equal(recorded.toolUpdates[2].computer, true, 'Work mode command must re-enable computer schema');
    assert.ok(recorded.toolUpdates[2].names.includes('open_app'));
  } finally {
    llm.createProvider = origCreate;
    llm.resolveProvider = origResolve;
  }
});

test('Frontend wires __maveAppMode into task:run submissions', () => {
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/app.js'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/home.js'), 'utf8');
  assert.match(appSrc, /window\.__maveAppMode\s*=/);
  assert.match(homeSrc, /mode:\s*window\.__maveAppMode\s*\|\|\s*'work'/);
});

test('Controller.runTask routes "what you can do" and Chat mode to LLM without opening terminal or hijacking 0j', async () => {
  const electronStub = require('./electron-stub');
  const prevScreen = { ...electronStub.screen };
  const fakeDisplay = { id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1 };
  electronStub.screen.getAllDisplays = () => [fakeDisplay];
  electronStub.screen.getDisplayNearestPoint = () => fakeDisplay;
  electronStub.screen.getCursorScreenPoint = () => ({ x: 100, y: 100 });

  try {
    const { Controller } = require('../src/main/controller');
    const calls = { terminal: [], direct: [], agentRun: [] };
    const mockCtrl = {
      settings: { get: (k) => (k === 'desktopPetAutoMorph' ? false : null) },
      pendingRegion: null,
      inkCounts: new Map(),
      terminals: {},
      state: 'idle',
      voiceMode: false,
      thoughts: [],
      audio: { beginStream() {}, acknowledge() {}, stopSpeaking() {} },
      windows: { send() {}, broadcast() {} },
      logger: { audit() {}, error() {} },
      activity: { add() {} },
      local: { active: () => false, snapshot: () => ({ status: 'none' }) },
      runtime: { preparing: null, running: true },
      cursorDisplayId: () => 1,
      requireKey: () => true,
      blockedUntilReady: () => false,
      finishReply() {},
      endRegionAsk() {},
      screenshotEdge: () => 1280,
      setInkBusy() {},
      panelLog() {},
      setState() {},
      clearThoughts() { mockCtrl.thoughts = []; },
      recordThought(t) { mockCtrl.thoughts.push(t); },
      provider: () => 'openai',
      bubble() {},
      sendUsage() {},
      withDrawing: (id, png) => png,
      presentReply: async () => {},
      terminalCommand: async (cmd) => { calls.terminal.push(cmd); return 'Running in terminal.'; },
      agent: {
        running: false,
        setTarget() {},
        runDirect: async (c) => { calls.direct.push(c); return ['Direct OK']; },
        runUiCommand: async () => null,
        run: async (task, opts) => {
          calls.agentRun.push({ task, mode: opts.mode });
          return { status: 'done', text: 'I can answer questions and run tasks when asked.', point: null };
        },
      },
    };

    // 1. "what you can do" in Work mode: must NOT trigger terminal, 0j, or direct commands
    const r1 = await Controller.prototype.runTask.call(mockCtrl, 'what you can do', 'typed', { mode: 'work' });
    assert.equal(r1.ok, true);
    assert.equal(calls.terminal.length, 0);
    assert.equal(calls.direct.length, 0);
    assert.equal(calls.agentRun.length, 1);
    assert.equal(calls.agentRun[0].task, 'what you can do');

    // 2. Explicit terminal command in Chat mode: must NOT open terminal
    const r2 = await Controller.prototype.runTask.call(mockCtrl, 'run npm test in the terminal', 'typed', { mode: 'chat' });
    assert.equal(r2.ok, true);
    assert.equal(calls.terminal.length, 0);
    assert.equal(calls.agentRun.length, 2);
    assert.equal(calls.agentRun[1].mode, 'chat');

    // 3. Explicit terminal command in Work mode: opens terminal as designed
    const r3 = await Controller.prototype.runTask.call(mockCtrl, 'run npm test in the terminal', 'typed', { mode: 'work' });
    assert.equal(r3.ok, true);
    assert.deepEqual(calls.terminal, [{ kind: 'run', command: 'npm test' }]);
  } finally {
    Object.assign(electronStub.screen, prevScreen);
  }
});
