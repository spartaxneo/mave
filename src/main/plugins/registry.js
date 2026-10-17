'use strict';
// Tool plugins. A plugin module exports one tool definition or an array of them:
//
//   module.exports = {
//     name: 'word_count',                         // ^[a-z][a-z0-9_]{1,63}$, unique
//     description: 'What it does and when to use it. Claude reads this.',
//     input_schema: { type: 'object', properties: { ... }, required: [...] },
//     async run(input, ctx) { return 'text result' },   // or an array of content blocks
//   };
//
// ctx gives plugins what they need without reaching into the app:
//   ctx.confirm(level, { title, message, detail, confirm, destructive })
//       level 'read' asks only in "Every action" mode, 'change' unless approvals are off,
//       'always' in every mode. Throws if the user declines.
//   ctx.signal        AbortSignal, fires when the user presses Esc
//   ctx.log(kind, text)   write to the Bigfoot Terminal ('info', 'stdout', 'stderr', ...)
//   ctx.screen        the ScreenTarget being controlled (coordinate mapping, screenshots)
//   ctx.draw(shape)   send a drawing to the overlay
//   ctx.sleep(ms)     abortable delay
//
// Changing the tool list mid-conversation would invalidate the prompt cache, so adding or removing
// a plugin starts a new conversation.

const fs = require('fs');
const path = require('path');

const NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const RESERVED = new Set(['computer', 'screenshot', 'zoom', 'key', 'type', 'wait', 'scroll']);

class PluginRegistry {
  constructor(logger) {
    this.logger = logger;
    this.tools = new Map();
    this.sources = new Map();
    this.failures = new Map(); // user plugin file -> why it didn't load
    this.version = 0;          // bumps whenever the tool list changes
  }

  register(def, source = 'builtin') {
    const problem = validate(def);
    if (problem) throw new Error(`Plugin ${def && def.name ? def.name : '(unnamed)'} from ${source}: ${problem}`);
    if (this.tools.has(def.name)) throw new Error(`Plugin ${def.name} from ${source} clashes with one from ${this.sources.get(def.name)}`);
    this.tools.set(def.name, def);
    this.sources.set(def.name, source);
    this.version++;
  }

  /** All of a module's tools or none of them. */
  registerModule(mod, source) {
    const defs = Array.isArray(mod) ? mod : [mod];
    const names = new Set();
    for (const def of defs) {
      const problem = validate(def);
      if (problem) throw new Error(`${def && def.name ? def.name : '(unnamed)'}: ${problem}`);
      if (this.tools.has(def.name) || names.has(def.name)) throw new Error(`${def.name} clashes with another tool`);
      names.add(def.name);
    }
    for (const def of defs) this.register(def, source);
  }

  unregisterSource(source) {
    for (const [name, src] of [...this.sources]) {
      if (src === source) { this.tools.delete(name); this.sources.delete(name); this.version++; }
    }
    this.failures.delete(source);
  }

  /** Load (or reload) one user plugin file. */
  loadUserPlugin(full) {
    const file = path.basename(full);
    this.unregisterSource(file);
    try {
      delete require.cache[require.resolve(full)];
      this.registerModule(require(full), file);
      return true;
    } catch (err) {
      this.failures.set(file, err.message);
      this.logger && this.logger.error(`Skipped plugin ${file}:`, err.message);
      return false;
    }
  }

  loadBuiltins() {
    const dir = path.join(__dirname, 'builtin');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
      this.registerModule(require(path.join(dir, file)), `builtin/${file}`);
    }
  }

  /** User plugins run with full access to this computer, like any installed software. */
  loadUserPlugins(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const loaded = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
      if (this.loadUserPlugin(path.join(dir, file))) loaded.push(file);
    }
    return loaded;
  }

  /** Name -> where it comes from, for clash checks. */
  names(exceptSource = null) {
    const out = new Map();
    for (const [name, src] of this.sources) {
      if (src !== exceptSource) out.set(name, src.startsWith('builtin/') ? 'built in' : src);
    }
    return out;
  }

  has(name) { return this.tools.has(name); }

  /** Tool definitions for the API request, in a stable order. */
  definitions() {
    return [...this.tools.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  }

  /**
   * Filter tools dynamically so that local models (e.g. Qwen3-VL 8B) receive a focused,
   * high-speed subset of relevant tools (~15-28 tools) rather than all 150+ tools,
   * preventing context size exhaustion and speeding up prefill from 30s to <1s.
   */
  filterToolsForTask(task = '', allDefs = null) {
    const defs = allDefs || this.definitions();
    const coreNames = new Set([
      'click_element', 'type_into', 'scroll_screen', 'drag_element', 'highlight_element',
      'read_screen', 'open_app', 'open_url', 'run_command', 'web_search', 'read_webpage',
      'write_file', 'read_file', 'list_files', 'annotate', 'edit_drawing', 'terminal'
    ]);

    const selected = [];
    const selectedNames = new Set();

    // 1. Core tools always included
    for (const def of defs) {
      if (coreNames.has(def.name)) {
        selected.push(def);
        selectedNames.add(def.name);
      }
    }

    // 2. Keyword/intent-based domain tool inclusion
    const t = String(task || '').toLowerCase();
    if (t) {
      const domainKeywords = {
        'artemis': ['android', 'artemis', 'phone', 'tablet'],
        'iphone': ['iphone', 'ios', 'apple', 'wda'],
        'mavedrop': ['airdrop', 'share', 'mavedrop', 'transfer', 'send file', 'sync', 'clipboard'],
        'household': ['appliance', 'ac', 'thermostat', 'vacuum', 'purifier', 'chore', 'household', 'light', 'plug', 'home'],
        'camera': ['camera', 'look', 'point', 'room', 'see', 'vision', 'photo'],
        'emergency': ['emergency', 'alert', 'fall', 'contact', 'safety', 'danger', 'hazard'],
        'market': ['market', 'tam', 'competitor', 'business', 'pitch', 'grant', 'review', 'analysis', 'startup', 'honest'],
        'agent': ['agent', 'team', 'playbook', 'cli', 'openmaus', 'subagent', 'antigravity', 'codex', 'claude', 'grok'],
        'audio': ['sound', 'audio', 'tone', 'music', 'speaker', 'play', 'synth'],
        'pet': ['pet', 'codex', 'feed', 'cat', 'dog', 'buddy'],
        'memory': ['remember', 'profile', 'who am i', 'recall', 'taste', 'know me'],
        'chatgpt': ['chatgpt', 'gpt', 'openai', 'intelligence', 'ask chatgpt'],
        'claude': ['claude', 'anthropic'],
        'perplexity': ['perplexity', 'citations', 'research online'],
        'gmail': ['gmail', 'email', 'mail', 'inbox', 'draft', 'send email'],
        'drive': ['drive', 'google drive', 'docs', 'sheets', 'gdrive'],
        'calendar': ['calendar', 'meeting', 'agenda', 'schedule', 'event'],
        'microsoft': ['microsoft', 'office', 'outlook', 'teams', 'onedrive'],
        'slack': ['slack', 'channel', 'mention'],
        'discord': ['discord', 'server'],
        'notion': ['notion', 'workspace'],
        'notes': ['note', 'notes', 'obsidian', 'notion', 'dossier', 'document'],
        'github': ['github', 'repo', 'pr', 'pull request', 'issue', 'commit'],
        'linear': ['linear', 'jira', 'asana', 'trello', 'ticket', 'sprint'],
        'cloud': ['cloud', 'vercel', 'firebase', 'supabase', 'aws', 'netlify', 'deploy'],
        'finance': ['finance', 'stripe', 'paypal', 'wise', 'invoice', 'expense'],
        'todo': ['todo', 'todoist', 'task', 'checklist', 'reminder'],
        'pipeline': ['pipeline', 'cross service', 'workflow', 'automate', 'connect'],
        'exo': ['exo', 'cluster', 'sharded', 'p2p', 'gpu swarm', 'distributed'],
        'cua': ['cua', 'background', 'sandbox', 'spaces', 'untrusted', 'isolated'],
        'tapkit': ['tapkit', 'iphone', 'ios', 'touch', 'swipe', 'gesture'],
        'database': ['sql', 'query', 'dataset', 'table', 'csv', 'data tab', 'analytics'],
        'channel': ['channel', 'roundtable', 'round table', 'debate', 'squad'],
        'permission': ['permission', 'broker', 'approval', 'approve', 'risk']
      };

      for (const def of defs) {
        if (selectedNames.has(def.name)) continue;
        const desc = (def.description || '').toLowerCase();
        const name = def.name.toLowerCase();

        for (const [domain, kws] of Object.entries(domainKeywords)) {
          if (kws.some((kw) => t.includes(kw))) {
            if (name.includes(domain) || kws.some((kw) => name.includes(kw) || desc.includes(kw))) {
              selected.push(def);
              selectedNames.add(def.name);
              break;
            }
          }
        }
        if (selected.length >= 28) break;
      }
    }

    return selected;
  }

  definitionsForTask(task = '', providerId = 'local') {
    const all = this.definitions();
    if (providerId === 'local' || providerId === 'ollama') {
      return this.filterToolsForTask(task, all);
    }
    return all;
  }

  list() {
    return [...this.tools.values()].map((t) => ({ name: t.name, source: this.sources.get(t.name), description: t.description }));
  }

  async run(name, input, ctx) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool ${name}`);
    const missing = (tool.input_schema.required || []).filter((k) => input[k] === undefined || input[k] === null);
    if (missing.length) throw new Error(`Missing required input: ${missing.join(', ')}`);
    return tool.run(input, ctx);
  }
}

function validate(def) {
  if (!def || typeof def !== 'object') return 'must export an object';
  if (!NAME_RE.test(def.name || '')) return 'name must match ^[a-z][a-z0-9_]{1,63}$';
  if (RESERVED.has(def.name)) return `name "${def.name}" is reserved`;
  if (typeof def.description !== 'string' || def.description.length < 10) return 'needs a description';
  if (!def.input_schema || def.input_schema.type !== 'object') return 'input_schema must be a JSON Schema object';
  if (typeof def.run !== 'function') return 'needs a run(input, ctx) function';
  return null;
}

module.exports = { PluginRegistry, validate };
