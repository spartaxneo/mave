'use strict';
// The agent loop: send the conversation to the model, run the tools it calls, repeat until it answers.
// Provider details (local Qwen3-VL, Claude, OpenAI) live in ./llm; this file only sees normalized turns.

const { systemPrompt } = require('./prompt');
const llm = require('./llm');
const { ProviderError } = require('./llm/errors');
const { StoppedError, READ_ONLY, isRisky, describeAction, sleep } = require('./computer');
const { findElement } = require('./uicommand');

const HALT_TEXT = 'Not executed: an earlier action in this turn failed.';
const STOPPED_TEXT = 'Not executed: the user stopped the agent.';
const TRUNCATED_TEXT = 'Not executed: your response hit the length limit, so this call may be incomplete. Issue it again.';
const LOOKING = new Set(['screenshot', 'zoom']);
// Asking for something done on screen (as opposed to a question or a chat): the screen list goes
// with the request, which saves the model a whole step of asking for it.
const ON_SCREEN = /\b(?:click|tap|press|select|choose|pick|check|uncheck|tick|type|enter|fill|write in|scroll|drag|move|open the|close the|go to the|play the|download|sign in|log in|search (?:for|on this)|find (?:the|a)|switch to|expand|collapse|highlight|show me where|where is|which button|what(?:'s| is) on (?:the |my )?screen)\b/i;

class AgentError extends ProviderError {}

/** Parse and strip a [POINT:x,y:label] tag from a reply. */
function extractPoint(text) {
  const m = /\[POINT:\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?::\s*([^\]]*))?\]/i.exec(text);
  if (!m) return { text, point: null };
  const clean = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  return { text: clean, point: { x: Number(m[1]), y: Number(m[2]), label: (m[3] || '').trim() } };
}

const pngItem = (png) => ({ type: 'image', data: png.toString('base64') });

/**
 * A reply that announces actions without taking any: "I'll use open_url to…", "Let me open…",
 * "First, I'll…". A plain answer or a question back to the user isn't a plan.
 */
const INFORMATIONAL_QUESTIONS = /\b(what (?:can you|are you able to|do you|all you can|is|are|should|would)|what's|how (?:can you|could you|are you|do you|does|to|would you)|who (?:are you|is|made you)|tell me (?:about|what|why|how)|explain|help me (?:understand|with)|list (?:your|all)|why (?:is|do|does|are)|describe|can you (?:be better|improve|help|give|explain)|improve|be better|advice|feedback|opinion|thoughts on|who are you)\b/i;

function isConversationalTask(task = '') {
  const t = String(task || '').trim();
  if (!t) return false;
  if (INFORMATIONAL_QUESTIONS.test(t)) {
    if (/^(?:open|launch|start|run|click|type|press|scroll|download|install|play|send|delete|write)\b/i.test(t)) {
      return false;
    }
    return true;
  }
  return false;
}

function isPlanInsteadOfAction(text, task = '') {
  if (isConversationalTask(task)) return false;
  const t = String(text || '');
  if (!t.trim() || /\?\s*$/.test(t.trim())) return false;
  const intent = /\b(I['’]?ll|I will|let me|I['’]?m going to|I am going to|first,? I|I need to (?:open|use|click|take))\b/i;
  const tooling = /\b(open_app|open_url|annotate|edit_drawing|run_command|screenshot|the \w+ (?:tool|function)|open (?:a |the )?(?:new )?(?:tab|browser|app|chrome|notepad|window)|search|click|type|draw)\b/i;
  return intent.test(t) && tooling.test(t);
}

const ACTION_INTENT_PATTERN = /\b(?:open|launch|start|run|click|press|type|write|create|send|delete|install|search|find|navigate|execute|download|clear|close)\b/i;
const CLAIMED_COMPLETION_PATTERN = /\b(?:I (?:have|already|just)?\s*(?:opened|clicked|typed|sent|created|written|ran|executed|installed|downloaded|deleted|navigated)|Done!?\b|Here (?:it is|is the file)|I've (?:opened|clicked|typed|sent|created|written|finished|completed))\b/i;

function isFalseCompletionHallucination(text, task = '', hasExecutedAction = false) {
  if (hasExecutedAction) return false;
  if (isConversationalTask(task)) return false;
  const t = String(task || '').trim();
  const reply = String(text || '').trim();
  if (!t || !reply) return false;

  if (ACTION_INTENT_PATTERN.test(t) && CLAIMED_COMPLETION_PATTERN.test(reply)) {
    return true;
  }
  return false;
}

class Agent {
  /**
   * @param {object} deps
   *   settings    Settings
   *   input       InputHelper (window titles, fail-safe)
   *   computer    ComputerExecutor
   *   plugins     PluginRegistry
   *   costs       CostTracker
   *   hooks       { state, progress, action, approve, notice, terminal, draw }
   *   runtime     LocalRuntime (runs the local model)
   *   ui          ScreenReader (the screen as a list of elements)
   *   terminals   Terminals (real terminals the AI runs commands in)
   *   isOnline    () => boolean
   */
  constructor({ settings, input, computer, plugins, costs, hooks, runtime = null, ui = null, terminals = null, isOnline = () => true }) {
    Object.assign(this, { settings, input, computer, plugins, costs, hooks, runtime, ui, terminals, isOnline });
    this.task = '';
    this.visual = false; // the request is about a drawing or a marked area: keep real screenshots
    this.provider = null;
    this.providerKey = '';
    this.target = null;
    this.abort = null;
    this.running = false;
    this.approvedWindows = new Set();
    this.conversationHistory = []; // Multi-turn dialogue history (like ChatGPT)
  }

  reset() {
    if (this.running) return false;
    this.provider = null;
    this.approvedWindows.clear();
    this.conversationHistory = [];
    return true;
  }

  stop() {
    if (this.abort) this.abort.abort();
  }

  /** A different display or resolution starts a new conversation, since coordinates change. */
  setTarget(target) {
    const same = this.target && this.target.display.id === target.display.id
      && this.target.sent.width === target.sent.width && this.target.sent.height === target.sent.height;
    if (!same) this.provider = null;
    this.target = target;
  }

  /** Reuse the conversation unless the provider, model, name, effort, or tool list changed. */
  ensureProvider({ online = this.isOnline() } = {}) {
    const s = this.settings;
    const id = llm.resolveProvider(s, { online });
    const key = [id, id && s.get(llm.PROVIDERS[id].modelSetting), s.get('assistantName'), s.get('effort'), this.plugins.version].join('|');
    if (this.provider && this.providerKey === key) return this.provider;
    const tools = (id === 'local' || id === 'ollama')
      ? this.plugins.definitionsForTask('', id)
      : this.plugins.definitions();
    this.provider = llm.createProvider(s, {
      system: systemPrompt(s.get('assistantName')),
      tools,
      screen: this.target.sent,
      runtime: this.runtime,
      online,
    });
    this.providerKey = key;
    if ('onText' in this.provider && this.hooks.stream) this.provider.onText = (text) => this.hooks.stream(text);

    // Carry over conversational history across turns with CDM compression (like ChatGPT)
    if (this.conversationHistory && this.conversationHistory.length > 0) {
      let historyToInject = this.conversationHistory;
      if (historyToInject.length > 4) {
        try {
          const { getCDMEngine } = require('./decision/cdm_engine');
          historyToInject = getCDMEngine().compressConversation(this.conversationHistory, { preserveRecent: 4 });
        } catch {}
      }
      for (const turn of historyToInject) {
        if (turn.role === 'user') {
          this.provider.addUserMessage(turn.content);
        } else if (turn.role === 'assistant') {
          this.provider.messages.push({ role: 'assistant', content: turn.content });
        } else if (turn.role === 'system') {
          this.provider.messages.push({ role: 'system', content: turn.content });
        }
      }
    }
    const chosen = s.get('provider');
    if (id !== chosen && llm.PROVIDERS[chosen]) {
      const why = llm.PROVIDERS[chosen].cloud && !online
        ? 'You’re offline'
        : chosen === 'local' ? 'The local AI isn’t installed yet' : `No ${llm.PROVIDERS[chosen].label} key is set`;
      this.hooks.terminal('info', `${why}, so ${llm.describe(s, id)} is being used.`);
    }
    return this.provider;
  }

  /** Have the local model read the fixed part of the conversation before the user asks anything. */
  async warm(onProgress) {
    if (this.running || !this.target) return false;
    const provider = this.ensureProvider();
    return provider.warm ? provider.warm(onProgress) : false;
  }

  canFallBackOffline(provider, err) {
    return provider.id !== 'local' && err instanceof ProviderError && err.title === 'You’re offline'
      && llm.resolveProvider(this.settings, { online: false }) === 'local';
  }

  /**
   * Run tool calls the user asked for directly (a recognised everyday command), without the model.
   * Same tools, logging, and stop button as the model's own calls. Resolves to the tool results.
   */
  async runDirect(calls) {
    if (this.running) throw new AgentError('I’m already working on something. Press Esc to stop it first.', 'Still working');
    this.running = true;
    this.abort = new AbortController();
    const results = [];
    try {
      for (const call of calls) {
        if (this.abort.signal.aborted) break;
        try {
          const { getGovernanceManager } = require('./security/governance');
          const gov = getGovernanceManager();
          let actionType = null;
          const name = call.name;
          if (name === 'run_command' || name === 'terminal' || name === 'start_process' || name === 'shell') actionType = 'terminal';
          else if (call.computer || ['click_element', 'type_into', 'drag_element', 'mouse_click', 'key', 'type', 'click', 'mouse_move', 'scroll_screen'].includes(name)) actionType = 'screen_control';
          if (actionType) {
            const perm = gov.isActionPermitted(actionType, this.currentUserId || gov.activeUserId, this.currentDeviceId || 'host_pc');
            if (!perm.allowed) {
              this.hooks.terminal('error', `[Parental Governance Guard] ${perm.reason}`);
              results.push(`Action Blocked by Parental Governance: ${perm.reason}`);
              continue;
            }
          }
        } catch {}
        this.hooks.action(call.name, call.input);
        const content = call.computer
          ? await this.runComputer(call.name, call.input, this.abort.signal)
          : await this.plugins.run(call.name, call.input, this.pluginContext(this.abort.signal));
        if (typeof content === 'string') this.hooks.terminal('result', content);
        results.push(content);
      }
      return results;
    } finally {
      this.running = false;
      this.abort = null;
    }
  }

  /**
   * A simple on-screen command ("click Sign in", "scroll down", "press Enter") done from the screen
   * list, without the model. Resolves to the reply, or null when the model has to decide (no
   * element by that name, or several).
   */
  async runUiCommand(cmd, text) {
    if (!this.ui || !this.target) return null;
    this.task = text;
    this.visual = false;
    switch (cmd.kind) {
      case 'click': {
        const snap = await this.ui.read(this.target);
        const item = findElement(snap, cmd.what);
        if (!item) return null;
        this.ui.shown = new Map([[item.id, item]]);
        const [result] = await this.runDirect([{ name: 'click_element', input: { id: item.id } }]);
        return /Nothing on screen changed/.test(String(result)) ? `I clicked ${item.name}, but nothing seemed to happen.` : `Clicked ${item.name}.`;
      }
      case 'scroll':
        await this.runDirect([{ name: 'scroll_screen', input: { direction: cmd.dir, amount: cmd.amount } }]);
        return cmd.reply;
      case 'key':
        await this.runDirect([{ name: 'key', computer: true, input: { text: cmd.keys } }]);
        return cmd.reply;
      case 'type':
        await this.runDirect([{ name: 'type', computer: true, input: { text: cmd.text } }]);
        return cmd.reply;
      default:
        return null;
    }
  }

  /** Run one request from the user. Resolves to { status, text, point }. */
  async run(task, { region = null, drawing = false, image = null, speaker = null, userId = null, deviceId = null } = {}) {
    if (drawing) task = `${task}\n\n(I drew on the screen; my drawing shows in your screenshots. Use edit_drawing to correct or improve it if I ask.)`;
    if (this.running) throw new AgentError('I’m already working on something. Press Esc to stop it first.', 'Still working');
    if (!this.target) throw new AgentError('No screen is selected.');
    this.running = true;
    this.abort = new AbortController();
    this.costs.startTask();
    this.hooks.terminal('task', task);
    this.task = task;
    this.visual = Boolean(region || drawing || image);

    let effectiveUserId = userId;
    let effectiveDeviceId = deviceId || 'host_pc';
    let governanceDirectives = '';
    try {
      const { getGovernanceManager } = require('./security/governance');
      const gov = getGovernanceManager();
      if (!effectiveUserId) {
        effectiveUserId = gov.activeUserId;
        if (speaker && speaker.name) {
          const matched = gov.getUsers().find(u =>
            u.name.toLowerCase().includes(speaker.name.toLowerCase()) ||
            speaker.name.toLowerCase().includes(u.name.toLowerCase()) ||
            (u.role && u.role.toLowerCase() === (speaker.role || '').toLowerCase())
          );
          if (matched) effectiveUserId = matched.id;
        }
      }
      this.currentUserId = effectiveUserId;
      this.currentDeviceId = effectiveDeviceId;
      governanceDirectives = gov.generatePromptDirectives(effectiveUserId, effectiveDeviceId);
    } catch { /* no governance */ }

    try {
      if (this.settings.get('autoModelRouting') !== false) {
        try {
          const router = require('./local/router');
          const currentId = this.settings.get('localModel');
          const manager = this.runtime ? this.runtime.manager : null;
          const decision = router.selectModelForTask(task, currentId, manager);

          let colibriReady = false;
          try {
            const { colibriService } = require('./local/colibri');
            colibriReady = await colibriService.isHealthy();
          } catch { /* colibri not loaded */ }

          if (image || decision.tier3 === 'vision') {
            const visionModel = 'qwen3-vl-8b';
            if (this.settings.get('provider') !== 'local' || this.settings.get('localModel') !== visionModel) {
              this.hooks.terminal('info', `[Auto-Router: Tier 1 (Eyes)] Routing to ${visionModel} (VRAM Vision)`);
              this.settings.update({ provider: 'local', localModel: visionModel });
            }
          } else if ((decision.tier3 === 'mid' || decision.tier3 === 'brain') && colibriReady) {
            const colibriTarget = decision.suggestedModel || 'qwen36-35b';
            const tierLabel = decision.tier3 === 'brain' ? 'Tier 3 (Sol Brain)' : 'Tier 2 (Workhorse)';
            if (this.settings.get('provider') !== 'colibri' || this.settings.get('colibriModel') !== colibriTarget) {
              this.hooks.terminal('info', `[Auto-Router: ${tierLabel}] Routing to Colibri (${colibriTarget})`);
              this.settings.update({ provider: 'colibri', colibriModel: colibriTarget });
            }
          } else if (decision.tier3 === 'airllm') {
            const airllmTarget = decision.suggestedModel || 'airllm-meta-llama-Meta-Llama-3-70B-Instruct';
            if (this.settings.get('provider') !== 'airllm' || this.settings.get('airllmModel') !== airllmTarget) {
              this.hooks.terminal('info', `[Auto-Router: AirLLM Stream] Hardware memory exceeded or layer-streaming requested. Routing to AirLLM (${airllmTarget})`);
              this.settings.update({ provider: 'airllm', airllmModel: airllmTarget });
            }
          } else if (decision.changed && decision.targetId) {
            this.hooks.terminal('info', `[Auto-Router] Selected ${decision.tier.toUpperCase()} model (${decision.targetId}) based on task complexity`);
            this.settings.update({ localModel: decision.targetId });
          }
        } catch { /* routing fallback */ }

      }
      let provider = this.ensureProvider();
      if ((provider.id === 'local' || provider.id === 'ollama') && typeof provider.updateTools === 'function') {
        const taskTools = this.plugins.definitionsForTask(task, provider.id);
        provider.updateTools(taskTools);
      }
      this.hooks.terminal('info', `Using ${llm.describe(this.settings, provider.id)}`);
      let activeWindowNote = '';
      try {
        if (this.input && typeof this.input.windowTitle === 'function') {
          const winTitle = await this.input.windowTitle();
          if (winTitle && winTitle.trim()) {
            activeWindowNote = `\n\n(Current active foreground window on user's PC: "${winTitle.trim()}")`;
          }
        }
      } catch {}

      let request = null;
      if (region) {
        const r = [region.x0, region.y0, region.x1, region.y1].map(Math.round);
        let full = await this.target.screenshot();
        const crop = await this.target.zoom(r);
        if (this.hooks.regionImage) this.hooks.regionImage(crop); // shown with the question in the chat
        let traced = false;
        if (region.points && this.hooks.markImage) {
          try {
            full = await this.hooks.markImage(full, region.points);
            traced = true;
          } catch (err) {
            this.hooks.terminal('error', `Couldn’t draw the outline on the screenshot: ${err.message}`);
          }
        }
        const speakerInfo = (speaker && speaker.name) ? `\n(Recognized Speaker via Voice Biometrics: ${speaker.name}${speaker.role ? ` [Role: ${speaker.role}]` : ''})` : '';
        const govNote = governanceDirectives ? `\n${governanceDirectives}` : '';
        request = (p) => {
          const box = (p.fromScreen ? p.fromScreen(r) : r).join(', ');
          const how = traced
            ? `I traced around something on the screen; it's outlined in blue in the first image (bounding box [${box}] in your coordinate space)`
            : `I highlighted the area [${box}] of the first image, in your coordinate space`;
          p.addUserMessage(`${task}${activeWindowNote}${speakerInfo}${govNote}\n\n(${how}. The second image is a close-up of that area. My question is about what I marked; identify it first if that helps.)`,
            [full.toString('base64'), crop.toString('base64')]);
        };
      } else if (image) {
        const imgBase64 = Buffer.isBuffer(image) ? image.toString('base64') : String(image).replace(/^data:image\/[a-z]+;base64,/, '');
        const speakerInfo = (speaker && speaker.name) ? `\n(Recognized Speaker via Voice Biometrics: ${speaker.name}${speaker.role ? ` [Role: ${speaker.role}]` : ''})` : '';
        const govNote = governanceDirectives ? `\n${governanceDirectives}` : '';
        request = (p) => {
          p.addUserMessage(`${task || 'Analyze this camera capture or photo in detail.'}${activeWindowNote}${speakerInfo}${govNote}\n\n(This photo was captured from the user's remote device camera. Describe and answer the request.)`, [imgBase64]);
        };
      } else {
        let screenNote = '';
        const explicitScreenRef = /\b(?:screen|display|window|desktop|app|button|menu|cursor|icon|interface)\b/i.test(task);
        const shouldReadScreen = ON_SCREEN.test(task) && (!isConversationalTask(task) || explicitScreenRef);
        if (this.ui && shouldReadScreen) {
          try {
            const snap = await this.ui.read(this.target);
            screenNote = `\n\n(${this.ui.describe(snap, task, { limit: this.listLimit(provider), point: this.modelPoint(provider) })})`;
          } catch (err) {
            this.hooks.terminal('error', `Couldn’t read the screen: ${err.message}`);
          }
        }
        let groundingNote = '';
        const entityMatch = task.match(/^(?:what do you know about|tell me about|who is|what is|do you know about|do you know|can you tell me about)\s+([^?.!]+)/i);
        if (entityMatch && entityMatch[1]) {
          const entityQuery = entityMatch[1].trim();
          groundingNote = `\n\n[Mave Grounding Directive: The user is asking about "${entityQuery}". Do NOT guess, invent fake slang definitions, fake biographies, or hallucinated claims. If you do not have verified, ground-truth facts in your persistent memories or active window context, you MUST call web_search({ query: "${entityQuery}" }) to retrieve verified real-world facts before giving your answer. If search yields no verified records, state honestly that you do not have verified records.]`;
        }
        let memoryNote = '';
        if (speaker && speaker.name) {
          memoryNote += `\n\n(Recognized Speaker via Voice Biometrics: ${speaker.name}${speaker.role ? ` [Role: ${speaker.role}]` : ''}${speaker.confidence ? ` [Confidence: ${Math.round(speaker.confidence * 100)}%]` : ''}. Address the speaker appropriately and maintain family-aware context.)`;
        }
        try {
          const { getMemoryStore, getUserProfileSummary } = require('./memory');
          const summary = getMemoryStore().contextSummary(task);
          if (summary) memoryNote += `\n\n(Relevant persistent memories:\n${summary})`;
          if (/\b(who am i|about me|know about me|know me|\bme\b)\b/i.test(task)) {
            memoryNote += `\n\n(User and system context: ${getUserProfileSummary()})`;
          }
        } catch { /* no memories */ }
        let personaNote = '';
        try {
          const { getPersonaStore } = require('./chatgpt/persona_store');
          const activePersona = getPersonaStore().getActivePersona();
          if (activePersona && activePersona.systemPrompt) {
            personaNote = `\n\n[Active Persona Directives: ${activePersona.name} (${activePersona.tagline})]:\n${activePersona.systemPrompt}`;
          }
        } catch {}

        let personalizationNote = '';
        try {
          const { getChatGPTPersonalization } = require('./chatgpt/personalization');
          const pContext = getChatGPTPersonalization().formatPromptContext();
          if (pContext) {
            personalizationNote = `\n\n[ChatGPT Custom Instructions & Personalization]:\n${pContext}`;
          }
        } catch {}

        let commonSenseNote = '';
        try {
          const { getCommonSenseEngine } = require('./intelligence/common_sense');
          const cs = getCommonSenseEngine();
          commonSenseNote = cs.formatCommonSensePromptContext();
          // Also check if task mentions anyone or resolves curiosity
          if (/\b(leave it|not important|not that important|ignore him|ignore her)\b/i.test(task)) {
            const nextGossip = cs.getNextGossipDebrief();
            if (nextGossip) {
              cs.resolveGossip(nextGossip.item.candidateName, task);
            }
          }
        } catch {}

        const govNote = governanceDirectives ? `\n${governanceDirectives}` : '';
        const now = new Date();
        const timeNote = `\n\n(Current system time: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString('en-US')})`;
        const anchorNote = `\n\n[Mave Task Anchor: "${task}"] Stick strictly to this user request. Do NOT divert to unrelated apps, websites, suggestions, or placeholders found on screen.`;
        request = (p) => p.addUserMessage(task + activeWindowNote + groundingNote + screenNote + memoryNote + personaNote + personalizationNote + commonSenseNote + govNote + timeNote + anchorNote);
      }
      if (provider.startTask) provider.startTask(); // keep earlier turns lean (local model)
      request(provider);
      try {
        const result = await this.loop(provider, this.abort.signal);
        if (result && result.status === 'done' && result.text) {
          this.conversationHistory.push({ role: 'user', content: task });
          this.conversationHistory.push({ role: 'assistant', content: result.text });
          if (this.conversationHistory.length > 20) this.conversationHistory = this.conversationHistory.slice(-20);
          try {
            const { getMemoryStore } = require('./memory');
            getMemoryStore().autoExtractTaste(task, result.text);
          } catch { /* ignore non-fatal memory update */ }
        }
        return result;
      } catch (err) {
        if (!this.canFallBackOffline(provider, err) || this.abort.signal.aborted) throw err;
        this.hooks.notice('You’re offline, so I’m switching to the local AI.');
        this.provider = null;
        provider = this.ensureProvider({ online: false });
        this.hooks.terminal('info', `Using ${llm.describe(this.settings, provider.id)}`);
        if (provider.startTask) provider.startTask();
        request(provider);
        const result = await this.loop(provider, this.abort.signal);
        if (result && result.status === 'done' && result.text) {
          this.conversationHistory.push({ role: 'user', content: task });
          this.conversationHistory.push({ role: 'assistant', content: result.text });
          if (this.conversationHistory.length > 20) this.conversationHistory = this.conversationHistory.slice(-20);
          try {
            const { getMemoryStore } = require('./memory');
            getMemoryStore().autoExtractTaste(task, result.text);
          } catch { /* ignore non-fatal memory update */ }
        }
        return result;
      }
    } catch (err) {
      if (err instanceof StoppedError || (this.abort && this.abort.signal.aborted)) return { status: 'stopped', text: '' };
      throw err;
    } finally {
      this.running = false;
      this.abort = null;
    }
  }

  async loop(provider, signal) {
    const maxTurns = this.settings.get('maxTurns');
    let nudges = 0;
    let falseCompletionNudges = 0;
    let hasExecutedAction = false;
    let lastKey = '';
    let repeats = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      this.hooks.state('processing');
      const step = await provider.step(signal, (msg) => this.hooks.terminal('info', msg));
      this.costs.record(step.model, step.usage);
      step.progress.forEach((p) => this.hooks.progress(p));
      // Narration between tool calls is progress; the final reply is returned below.
      if (step.text && step.calls.length) this.hooks.progress(extractPoint(step.text).text);

      if (step.stop === 'refusal') {
        if (step.calls.length) provider.addToolResults(step.calls.map((call) => ({ call, content: 'Not executed: the request was declined.', isError: true })));
        throw new AgentError(`The model declined this request${step.refusalCategory ? ` (${step.refusalCategory})` : ''}. Try rephrasing it.`, 'Request declined');
      }
      if (step.stop === 'pause') continue;
      if (!step.calls.length) {
        if (step.stop === 'max_tokens') {
          provider.addUserMessage('Your last response was cut off by the length limit. Continue.');
          continue;
        }
        // False completion hallucination: model claimed it performed an action task without calling tools
        if (isFalseCompletionHallucination(step.text, this.task, hasExecutedAction)) {
          if (falseCompletionNudges < 2) {
            falseCompletionNudges++;
            if (this.hooks.discard) this.hooks.discard();
            this.hooks.terminal('info', 'The model claimed completion without executing action tools; requiring physical action.');
            provider.addUserMessage(`You stated that you performed the action ("${step.text.slice(0, 80)}..."), but no computer action was actually executed. Call the appropriate tool now to perform the user's task: "${this.task}".`);
            continue;
          }
        }
        // A plan with no tool call ("I'll open Chrome, then…"): have the model do it instead.
        if (provider.id === 'local' && isPlanInsteadOfAction(step.text, this.task)) {
          if (nudges < 2) {
            nudges++;
            if (this.hooks.discard) this.hooks.discard(); // don't keep or speak the narration
            this.hooks.terminal('info', 'The model described a plan instead of acting; asking it to act.');
            provider.addUserMessage('Don’t describe it: do it now by calling the tools. At most one short sentence of text.');
            continue;
          }
          if (this.settings.get('autoModelRouting') !== false) {
            try {
              const router = require('./local/router');
              const currentId = this.settings.get('localModel');
              const manager = this.runtime ? this.runtime.manager : null;
              if (router.shouldEscalate({ currentModelId: currentId, nudges }, manager)) {
                const { heavy } = router.getModelTiers(manager);
                if (heavy && heavy.id !== currentId) {
                  this.hooks.terminal('info', `[Auto-Router] Model stalled on planning. Escalating to ${heavy.label || heavy.id} for deeper reasoning...`);
                  this.settings.update({ localModel: heavy.id });
                  this.provider = null;
                  provider = this.ensureProvider();
                  nudges = 0;
                  provider.addUserMessage('An earlier lighter model stalled while planning. Think through this step and call the right tool now.');
                  continue;
                }
              }
            } catch { /* continue */ }
          }
        }
        const { text, point } = extractPoint(step.text);
        return { status: 'done', text, point: point && this.localPoint(point) };
      }

      // Small models can get stuck making the very same call over and over.
      const key = JSON.stringify(step.calls.map((c) => [c.name, c.input]));
      repeats = key === lastKey ? repeats + 1 : 0;
      lastKey = key;
      if (repeats >= 2) {
        if (provider.id === 'local' && this.settings.get('autoModelRouting') !== false) {
          try {
            const router = require('./local/router');
            const currentId = this.settings.get('localModel');
            const manager = this.runtime ? this.runtime.manager : null;
            if (router.shouldEscalate({ currentModelId: currentId, repeats }, manager)) {
              const { heavy } = router.getModelTiers(manager);
              if (heavy && heavy.id !== currentId) {
                this.hooks.terminal('info', `[Auto-Router] Model repeating actions. Escalating to ${heavy.label || heavy.id} for deeper reasoning...`);
                this.settings.update({ localModel: heavy.id });
                this.provider = null;
                provider = this.ensureProvider();
                repeats = 0;
                provider.addUserMessage('An earlier lighter model repeated this step. Move to the next distinct step or complete the task.');
                continue;
              }
            }
          } catch { /* continue */ }
        }
        provider.addToolResults(step.calls.map((call) => ({ call, content: 'Not executed: repeated.', isError: true })));
        return { status: 'done', text: 'I kept repeating the same step, so I stopped. Try asking in different words.', point: null };
      }
      if (repeats === 1) {
        this.hooks.terminal('info', 'The model repeated its last step; asking it to move on.');
        provider.addToolResults(step.calls.map((call) => ({ call, content: 'Not executed: you already did exactly this and it worked. Do the next, different step, or finish with one short sentence.', isError: true })));
        continue;
      }

      this.hooks.state('acting');
      const toolResults = await this.runCalls(step.calls, step.stop === 'max_tokens', signal, provider);
      for (const r of toolResults) {
        if (!r.isError) {
          const n = r.call.name;
          if (r.call.computer || ['click_element', 'type_into', 'scroll_screen', 'drag_element', 'mouse_click', 'key', 'type', 'open_app', 'open_url', 'run_command', 'write_file', 'terminal', 'shell', 'edit_drawing'].includes(n)) {
            hasExecutedAction = true;
          }
        }
      }
      // Re-anchor active goal in intermediate tool results to prevent attention drift on complex screens
      if (toolResults.length && this.task && !isConversationalTask(this.task)) {
        const last = toolResults[toolResults.length - 1];
        if (last && typeof last.content === 'string') {
          last.content += `\n\n[Active Goal Anchor: "${this.task}"] Focus solely on this objective. Do not divert to unrelated screen elements, tabs, recommendations, or suggested prompts.`;
        }
      }
      provider.addToolResults(toolResults);
    }
    return { status: 'max_turns', text: `I stopped after ${maxTurns} steps. Say "continue" if you want me to keep going.` };
  }

  localPoint(point) {
    try {
      return { ...this.target.sentToLocalDip([point.x, point.y]), label: point.label, displayId: this.target.display.id };
    } catch {
      return null;
    }
  }

  checkGoalDivert(call, task = '') {
    const t = String(task || '').trim().toLowerCase();
    const name = call.name;
    const input = call.input || {};

    // 1. Social media & entertainment unrequested divert guard
    const UNREQUESTED_DIVERT_PATTERNS = [
      { name: 'Instagram', regex: /\b(?:instagram|insta)\b/i, keywords: /\b(?:instagram|insta|reel|reels|story|stories|dm)\b/i },
      { name: 'TikTok', regex: /\btiktok\b/i, keywords: /\btiktok\b/i },
      { name: 'Netflix', regex: /\bnetflix\b/i, keywords: /\b(?:netflix|movie|film|series|watch)\b/i },
      { name: 'YouTube', regex: /\b(?:youtube\.com|youtube)\b/i, keywords: /\b(?:youtube|video|watch|stream|song|channel)\b/i },
      { name: 'Facebook', regex: /\bfacebook\b/i, keywords: /\b(?:facebook|fb)\b/i },
      { name: 'Twitter / X', regex: /\b(?:twitter\.com|x\.com)\b/i, keywords: /\b(?:twitter|tweet|x\.com)\b/i },
      { name: 'Twitch', regex: /\btwitch\b/i, keywords: /\b(?:twitch|stream)\b/i },
      { name: 'Reddit', regex: /\breddit\b/i, keywords: /\b(?:reddit|subreddit|post)\b/i },
    ];

    const targetUrl = String(input.url || '');
    const targetAppName = String(input.name || '');
    const isNavigation = name === 'open_url' || name === 'open_app' || name.startsWith('use_');

    if (isNavigation) {
      for (const divert of UNREQUESTED_DIVERT_PATTERNS) {
        const matches = (name === `use_${divert.name.toLowerCase()}`)
          || (name === 'open_url' && divert.regex.test(targetUrl))
          || (name === 'open_app' && divert.regex.test(targetAppName));
        if (matches && !divert.keywords.test(t)) {
          return `The user did NOT request opening or using ${divert.name}. Stick strictly to the user's task: "${task}".`;
        }
      }
    }

    // 2. Conversational inquiry protection: If the user asked a conversational question (e.g. "how can you be better"),
    // prevent launching apps or browsing unrequested sites instead of answering.
    if (isConversationalTask(task)) {
      if (name === 'open_app' || name === 'open_url' || name.startsWith('use_')) {
        return `The user asked a conversational question ("${task}"), not to open external apps or websites. Provide a thoughtful answer directly in chat.`;
      }
    }

    // 3. Web placeholder / suggested prompt adoption check
    if (name === 'type_into' && input.text) {
      const typed = String(input.text).trim().toLowerCase();
      const placeholders = [
        'what is the current weather',
        'current weather in new york',
        'weather in new york',
        'write an essay',
        'summarize an article',
        'help me write',
        'brainstorm names',
        'plan a trip'
      ];
      for (const ph of placeholders) {
        if (typed.includes(ph) && !t.includes(ph) && !t.includes('weather') && !t.includes('new york')) {
          return `"${input.text}" is an on-screen web placeholder/suggestion, NOT the user's request. Your task is "${task}". Please type the user's requested query instead.`;
        }
      }
    }

    return null;
  }

  // tool calls
  async runCalls(calls, truncated, signal, provider) {
    const results = [];
    let failed = false;
    for (const call of calls) {
      const known = call.computer || this.plugins.has(call.name);
      if (call.parseError || !known) {
        results.push({ call, content: call.parseError ? `Invalid call: ${call.parseError}` : `Unknown tool ${call.name}.`, isError: true });
        continue;
      }
      if (signal.aborted) { results.push({ call, content: STOPPED_TEXT, isError: true }); continue; }
      if (truncated) { results.push({ call, content: TRUNCATED_TEXT, isError: true }); continue; }
      if (failed) { results.push({ call, content: HALT_TEXT, isError: true }); continue; }

      const divertWarning = this.checkGoalDivert(call, this.task);
      if (divertWarning) {
        this.hooks.terminal('error', `[Anti-Divert Guard] ${divertWarning}`);
        results.push({ call, content: `Action Blocked by Safety Guard: ${divertWarning}. You must stick strictly to the user's objective: "${this.task}".`, isError: true });
        continue;
      }

      // Parental Governance & Power Tier Enforcement
      try {
        const { getGovernanceManager } = require('./security/governance');
        const gov = getGovernanceManager();
        let actionType = null;
        const name = call.name;
        if (name === 'run_command' || name === 'terminal' || name === 'start_process' || name === 'shell') {
          actionType = 'terminal';
        } else if (call.computer || ['click_element', 'type_into', 'drag_element', 'mouse_click', 'key', 'type', 'click', 'mouse_move', 'scroll_screen'].includes(name)) {
          actionType = 'screen_control';
        } else if (name === 'manage_credential_vault' || name.includes('vault') || name.includes('password')) {
          actionType = 'vault_access';
        } else if (name === 'search_screen_memory' || name.includes('screen_memory') || name.includes('total_recall')) {
          actionType = 'screen_memory';
        } else if (name.startsWith('remote_hands_') || name.startsWith('artemis_') || name.startsWith('iphone_use_')) {
          actionType = 'remote_hands';
        } else if (name.includes('purchase') || name.includes('payment') || name.includes('checkout')) {
          actionType = 'purchase';
        }

        if (actionType) {
          const perm = gov.isActionPermitted(actionType, this.currentUserId || gov.activeUserId, this.currentDeviceId || 'host_pc');
          if (!perm.allowed) {
            this.hooks.terminal('error', `[Parental Governance Guard] ${perm.reason}`);
            results.push({ call, content: `Action Blocked by Parental Governance: ${perm.reason}`, isError: true });
            continue;
          }
        }
      } catch { /* continue if governance check fails */ }

      this.hooks.action(call.name, call.input);
      try {
        let content = call.computer
          ? await this.runComputer(call.name, call.input, signal)
          : await this.plugins.run(call.name, call.input, this.pluginContext(signal));
        if (typeof content === 'string') {
          // CDM Optimization: If tool output is bulky (> 1800 chars), compress it with CDM
          if (content.length > 1800) {
            try {
              const { getCDMEngine } = require('./decision/cdm_engine');
              const compressed = getCDMEngine().compress(content, this.task);
              if (compressed && compressed.savingsPct > 20) {
                this.hooks.terminal('info', `[CDM Context Compression] Reduced tool payload from ${compressed.originalChars} to ${compressed.compressedChars} chars (${compressed.savingsPct}% token savings)`);
                content = `[CDM Compressed Output - High Semantic Density]:\n${compressed.compressed}`;
              }
            } catch {}
          }
          this.hooks.terminal('result', content);
        }
        results.push({ call, content });
      } catch (err) {
        if (err instanceof StoppedError || signal.aborted) {
          results.push({ call, content: STOPPED_TEXT, isError: true });
          for (const rest of calls.slice(results.length)) results.push({ call: rest, content: STOPPED_TEXT, isError: true });
          provider.addToolResults(results); // keep the history valid for a follow-up
          throw new StoppedError('Stopped');
        }
        this.hooks.terminal('error', err.message);
        results.push({ call, content: `Error: ${err.message}`, isError: true });
        failed = true;
      }
    }

    // If a batch of computer actions didn't end with a look at the screen, attach one: for the local
    // model the screen list (seconds), for others a screenshot.
    const lastCall = calls[calls.length - 1];
    const last = results[results.length - 1];
    if (last && !failed && !truncated && !last.isError && lastCall.computer && !LOOKING.has(lastCall.name)) {
      const text = typeof last.content === 'string' ? last.content : 'OK';
      const list = this.textScreen(provider) ? await this.screenList(provider).catch(() => null) : null;
      if (list) last.content = `${text}\n${list}`;
      else {
        try {
          last.content = [{ type: 'text', text }, pngItem(await this.target.screenshot())];
        } catch (err) {
          this.hooks.terminal('error', `Follow-up screenshot failed: ${err.message}`);
        }
      }
    }
    return results;
  }

  /** The local model reads the screen as a list; a screenshot costs it a minute or more. */
  textScreen(provider) {
    return Boolean(this.ui && provider && provider.id === 'local' && !this.visual);
  }

  listLimit(provider) {
    return provider && provider.id === 'local' ? 18 : 40;
  }

  /** Screenshot pixels → the model's own coordinates (the local model's 0-1000 grid). */
  modelPoint(provider) {
    return (p) => (provider && provider.toGrid ? provider.toGrid(p) : p);
  }

  async screenList(provider) {
    const snap = await this.ui.read(this.target);
    const list = this.ui.describe(snap, this.task, { limit: this.listLimit(provider), point: this.modelPoint(provider) });
    return snap.items.length ? list : null;
  }

  async runComputer(name, input, signal) {
    this.computer.validate(this.target, name, input);
    // The local model asked to look: the list answers in a second; zoom still shows real pixels.
    if (name === 'screenshot' && this.textScreen(this.provider)) {
      const list = await this.screenList(this.provider).catch(() => null);
      if (list) return `${list}\n(This is the screen as a list. To see actual pixels of an area, use the zoom action.)`;
    }
    if (!READ_ONLY.has(name)) {
      await this.guardSensitiveWindow();
      const mode = this.settings.get('approvalMode');
      if (mode === 'every' || (mode === 'risky' && isRisky(name, input))) {
        await this.confirm('always', { title: 'Allow this action?', message: describeAction(name, input), confirm: 'Allow' });
      }
      await this.failSafe();
    }
    if (signal.aborted) throw new StoppedError('Stopped');
    const out = await this.computer.run(this.target, name, input, signal);
    return typeof out === 'string' ? out : out.map((png) => pngItem(png));
  }

  pluginContext(signal) {
    return {
      signal,
      screen: this.target,
      settings: this.settings,
      confirm: (level, req) => this.confirm(level, req),
      log: (kind, text) => this.hooks.terminal(kind, text),
      draw: (shape) => this.hooks.draw({ ...shape, displayId: this.target.display.id }),
      ink: (op) => this.hooks.ink({ ...op, displayId: this.target.display.id }),
      sleep: (ms) => sleep(ms, signal),
      // For the screen tools (./plugins/builtin/screen.js)
      ui: this.ui,
      task: this.task,
      listLimit: this.listLimit(this.provider),
      modelPoint: this.modelPoint(this.provider),
      guard: async () => { await this.guardSensitiveWindow(); await this.failSafe(); },
      terminals: this.terminals, // for the terminal tools (./plugins/builtin/shell.js)
    };
  }

  /** level 'read' asks only in "every" mode, 'change' unless approvals are off, 'always' every time. */
  async confirm(level, req) {
    const mode = this.settings.get('approvalMode');
    const ask = level === 'always' || (level === 'change' && mode !== 'auto') || (level === 'read' && mode === 'every');
    if (!ask) return;
    if (!(await this.hooks.approve(req))) throw new Error('The user declined this action. Ask them how to proceed.');
  }

  /** Applies in every approval mode: never act blindly inside a password manager or bank. */
  async guardSensitiveWindow() {
    let title = '';
    try { title = await this.input.windowTitle(); } catch { return; }
    if (!title || this.approvedWindows.has(title)) return;
    const keywords = this.settings.get('blockedWindowKeywords').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (!keywords.some((k) => title.toLowerCase().includes(k))) return;
    const ok = await this.hooks.approve({
      title: 'This window looks sensitive',
      message: `“${title}” may contain passwords or financial information. Let ${this.settings.get('assistantName')} act in this window?`,
      confirm: 'Allow',
    });
    if (!ok) throw new Error('The user declined to let you act in a sensitive window. Ask them how to proceed.');
    this.approvedWindows.add(title);
  }

  /** Slamming the mouse into the top-left corner of the primary screen stops everything. */
  async failSafe() {
    const p = await this.input.cursor();
    if (p.x <= 1 && p.y <= 1) {
      this.stop();
      throw new StoppedError('Stopped');
    }
  }
}

/** Anything unexpected becomes a readable banner rather than a stack trace. */
function toUserError(err) {
  if (err instanceof ProviderError) return err;
  return new AgentError(err && err.message ? err.message : String(err));
}

module.exports = { Agent, AgentError, extractPoint, toUserError, isPlanInsteadOfAction, isConversationalTask, isFalseCompletionHallucination };
