'use strict';
// The agent loop: send the conversation to the model, run the tools it calls, repeat until it answers.
// Provider details (local Qwen3-VL, Claude, OpenAI) live in ./llm; this file only sees normalized turns.

const { systemPrompt } = require('./prompt');
const llm = require('./llm');
const { ProviderError } = require('./llm/errors');
const { StoppedError, READ_ONLY, isRisky, describeAction, sleep } = require('./computer');
const { findElement } = require('./uicommand');
const { getGoalDriftDetector } = require('./orchestrator/goal_drift_detector');
const { getToolRegistryAndVerifier } = require('./orchestrator/tool_contract');
const { GoalContract, TaskStatus } = require('./orchestrator/goal_contract');

const HALT_TEXT = 'Not executed: an earlier action in this turn failed.';
const STOPPED_TEXT = 'Not executed: the user stopped the agent.';
const TRUNCATED_TEXT = 'Not executed: your response hit the length limit, so this call may be incomplete. Issue it again.';
const LOOKING = new Set(['screenshot', 'zoom']);
// Asking for something done on screen (as opposed to a question or a chat): the screen list goes
// with the request, which saves the model a whole step of asking for it.
const ON_SCREEN = /\b(?:click|tap|press|select|choose|pick|check|uncheck|tick|type|enter|fill|write in|scroll|drag|move|open the|close the|go to the|play the|download|sign in|log in|search (?:for|on this)|find (?:the|a)|switch to|expand|collapse|highlight|show me where|where is|which button|what(?:'s| is) on (?:the |my )?screen|inspect(?: the)? (?:screen|window|display|elements?|page|ui|desktop)|see (?:the |my )?screen|look at (?:the |my )?screen)\b/i;

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
 * Detect explicit requests to inspect or read the user's live desktop screen or window.
 */
function isScreenInspectionQuery(task = '') {
  const t = String(task || '').trim();
  if (!t) return false;
  if (/\b(?:what (?:(?:all|else|other|things) )?(?:you can|can you|are you able to) do|what capabilities|who are you)\b/i.test(t)) {
    return false;
  }
  return /\b(?:what(?:'s| is)\s+on\s+(?:the\s+|my\s+|this\s+)?screen|inspect\s+(?:the\s+|my\s+|this\s+)?(?:screen|window|display|ui|page|desktop)|read\s+(?:the\s+|my\s+)?screen|look\s+at\s+(?:the\s+|my\s+)?screen|see\s+(?:the\s+|my\s+)?screen|where\s+is\s+(?:the\s+|my\s+)?.+(?:button|icon|link|menu|tab|window|box)|which\s+button|take\s+a\s+screenshot|screenshot\s+(?:the\s+|my\s+)?screen)\b/i.test(t);
}

/**
 * Detect self-referential inquiries about MAVE itself (capabilities, identity, improvements, help).
 */
function isSelfOrCapabilityQuestion(task = '') {
  const t = String(task || '').trim();
  if (!t) return false;
  return /\b(?:who (?:are you|made you|built you|created you)|what (?:(?:all|else|other|kinds? of|sorts? of|things)\s+)?(?:you can|can you|you are able to|are you able to)\s*(?:do|help(?: with| me with)?|perform|handle|automate)?|what (?:are )?your (?:capabilities|features|tools|skills)|what capabilities|what features (?:do you|you)|how (?:can you|you can|do you) (?:work|help|be better|improve)|can you (?:be better|improve)|tell me (?:about yourself|what you can do|what can you do)|what are you capable of|what you(?:'re| are) capable of)\b/i.test(t);
}

const GREETING_OR_SMALLTALK = /^(?:hi|hello|hey|yo|howdy|greetings|good\s+(?:morning|afternoon|evening|night)|thanks|thank you|thx|ok|okay|sure|cool|nice|great|awesome|got it|bye|goodbye|how are you|how(?:'s| is) it going|what(?:'s| is) up|whats up|sup)(?:\s+(?:mave|big\s?foot|there|buddy|friend|again|so much|a lot))?[\s.!?,]*$/i;

const INFORMATIONAL_QUESTIONS = /\b(?:what (?:(?:all|else|other|kinds? of|sorts? of|things)\s+)?(?:you can|can you|are you able to|you are able to|do you|you do|capabilities|features|tools|skills|is|are|should|would|could|does|did)|what's|how (?:can|you can|could|you could|are|do|does|did|to|would|should|much|many|long|far|often|well)|who (?:are|is|was|were|made|built|created|founded)|why (?:is|are|do|does|did|would|should|can't|won't)|when (?:is|are|was|were|do|does|did|will)|which (?:capabilities|features|tools|model|models|option|one|ones)|tell me (?:about|what|why|how|when|who|more|a joke|a story)|do you (?:know|think|understand|support|have|remember|recommend|suggest|mean)|are you (?:able|capable|sure|ready|okay|working|listening|local|real)|can you (?:be better|improve|help|give|explain|tell|describe|suggest|recommend|compare|teach|summarize|clarify|translate|answer|talk|chat|list)|could you (?:explain|tell|describe|help me understand|suggest|recommend|compare|summarize|clarify|translate)|explain|help me (?:understand|learn|brainstorm|think)|list (?:your|all)|describe|summarize|define|clarify|difference between|improve|be better|advice|feedback|opinion|thoughts on)\b/i;

function isConversationalTask(task = '') {
  const t = String(task || '').trim();
  if (!t) return false;

  if (GREETING_OR_SMALLTALK.test(t)) return true;

  // Strip optional wake prefix ("Hey Mave, ...") before checking imperative vs conversational intent
  const body = t.replace(/^(?:hey|hi|ok(?:ay)?)?\s*,?\s*(?:big\s?foot|bigfoot|mave)\s*[,.!]?\s*/i, '').trim();

  // Imperative physical/computer commands must NOT be treated as pure conversation
  if (/^(?:open|launch|start|run|execute|click|tap|press|type|enter|fill|scroll|drag|move|download|install|play|send|delete|remove|create|make\s+a\s+(?:note|file|folder)|write(?:\s+to)?\s+(?:a\s+|the\s+)?file|save|close|quit|kill|navigate|go\s+to|browse|search\s+for|find\s+(?:the|my)|inspect|take\s+a\s+screenshot|capture|draw|annotate|mute|unmute|lock|switch\s+to)\b/i.test(body)) {
    return false;
  }

  // Polite imperative computer commands ("can you please open Chrome", "could you run npm test")
  if (/^(?:please\s+|kindly\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?)(?:open|launch|start|run|execute|click|tap|press|type|enter|scroll|drag|download|install|play|send|delete|remove|create\s+(?:a\s+|the\s+)?file|write\s+(?:to\s+)?(?:a\s+|the\s+)?file|save|close|quit|kill|navigate|go\s+to|take\s+a\s+screenshot)\b/i.test(body)) {
    return false;
  }

  if (isScreenInspectionQuery(t)) return false;

  if (isSelfOrCapabilityQuestion(t) || INFORMATIONAL_QUESTIONS.test(t)) {
    return true;
  }
  return false;
}

/**
 * Determine whether this task should expose desktop, terminal, browser-opening, and computer-control tools.
 * Pure conversational prompts and explicit Chat mode keep computer/terminal tools turned off.
 */
function taskUsesDesktopTools(task = '', options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  if (opts.region || opts.drawing) return true;
  if (opts.mode === 'chat') return false;
  if (isConversationalTask(task)) return false;
  return true;
}

/**
 * Determine whether headless read-only web lookup tools (web_search, read_webpage)
 * are helpful during a chat-only turn (e.g., current real-world facts when online).
 */
function shouldOfferWebToolsInChat(task = '', options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  if (opts.online === false) return false;
  const t = String(task || '').trim();
  if (!t || GREETING_OR_SMALLTALK.test(t) || isSelfOrCapabilityQuestion(t)) return false;
  return /\b(?:who (?:is|was|founded)|what happened to|latest|current(?:ly)?|today(?:'s)?|news|weather|price|stock|release date|version of|search (?:the )?web|look up|what do you know about)\b/i.test(t);
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
    this.goalContract = null;
  }

  reset() {
    if (this.running) return false;
    this.provider = null;
    this.approvedWindows.clear();
    this.conversationHistory = [];
    this.goalContract = null;
    return true;
  }

  resetConversation() {
    this.conversationHistory = [];
    if (this.provider && Array.isArray(this.provider.messages)) {
      const sys = this.provider.messages[0] && this.provider.messages[0].role === 'system' ? this.provider.messages[0] : null;
      this.provider.messages = sys ? [sys] : [];
    }
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
  ensureProvider({ online = this.isOnline(), computerEnabled = true, tools = null } = {}) {
    const s = this.settings;
    const id = llm.resolveProvider(s, { online });
    const key = [id, id && s.get(llm.PROVIDERS[id].modelSetting), s.get('assistantName'), s.get('effort'), this.plugins.version].join('|');
    if (this.provider && this.providerKey === key) return this.provider;
    const initialTools = Array.isArray(tools)
      ? tools
      : ((id === 'local' || id === 'ollama')
        ? this.plugins.definitionsForTask('', id, { chatOnly: !computerEnabled })
        : (computerEnabled ? this.plugins.definitions() : this.plugins.definitionsForTask('', id, { chatOnly: true })));
    this.provider = llm.createProvider(s, {
      system: systemPrompt(s.get('assistantName')),
      tools: initialTools,
      screen: this.target.sent,
      runtime: this.runtime,
      online,
      computerEnabled,
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
        try {
          const snap = await this.ui.read(this.target);
          const item = findElement(snap, cmd.what);
          if (!item) return null;
          this.ui.shown = new Map([[item.id, item]]);
          const [result] = await this.runDirect([{ name: 'click_element', input: { id: item.id } }]);
          return /Nothing on screen changed/.test(String(result)) ? `I clicked ${item.name}, but nothing seemed to happen.` : `Clicked ${item.name}.`;
        } catch {
          return null;
        }
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
  async run(task, options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const { region = null, drawing = false, image = null, speaker = null, userId = null, deviceId = null, think = false, history = [], mode = 'work' } = opts;
    if (drawing) task = `${task}\n\n(I drew on the screen; my drawing shows in your screenshots. Use edit_drawing to correct or improve it if I ask.)`;
    if (this.running) throw new AgentError('I’m already working on something. Press Esc to stop it first.', 'Still working');
    if (!this.target) throw new AgentError('No screen is selected.');
    this.running = true;
    this.abort = new AbortController();
    this.costs.startTask();
    this.hooks.terminal('task', task);
    this.task = task;
    this.currentMode = mode;
    const desktopToolsAllowed = taskUsesDesktopTools(task, opts);
    const allowReadOnlyWeb = !desktopToolsAllowed && shouldOfferWebToolsInChat(task, { ...opts, online: this.isOnline() });
    this.desktopToolsAllowed = desktopToolsAllowed;
    this.visual = Boolean(region || drawing || image);
    this.goalContract = new GoalContract({
      originalRequest: task,
      userId: userId || 'default',
      sessionId: options.sessionId || `session_${Date.now()}`,
      status: TaskStatus.ACTIVE,
    });

    // MAVE Execution Invariant: Route desktop/automation tasks to isolated Virtual Computer.
    // Pure conversational turns & Chat mode skip Virtual Computer takeover cleanly.
    const hostTarget = this.target;
    let isGuestExecution = false;
    let virtualSession = null;
    if (desktopToolsAllowed) {
      try {
        const { getVirtualComputerSession, ExecutionTargetRouter } = require('./virtual_computer');
        virtualSession = getVirtualComputerSession();
        const router = virtualSession.targetRouter || new ExecutionTargetRouter();
        const targetDecision = router.resolveTarget(task, options);

        // If the caller explicitly passed a custom mock screen (without displayServer or real ScreenTarget)
        // or passed preferHost: true, we preserve host execution.
        const isCustomMockScreen = this.target && !this.target.isVirtual && !this.target.bounds;

        if (targetDecision.isGuest && !options.preferHost && !isCustomMockScreen) {
          isGuestExecution = true;
          virtualSession.setActiveTask(task, targetDecision.environment);
          this.target = virtualSession.getScreenTarget();
          this.hooks.terminal('info', `[MAVE Virtual Computer] Routing task to isolated guest (${targetDecision.environment}). Host desktop remains untouched.`);
        } else {
          if (targetDecision.requiresConfirmation && !router.isHostAuthorized(virtualSession.sessionId) && !isCustomMockScreen) {
            await this.confirm('always', {
              title: 'Physical Desktop Control Request',
              message: `MAVE was requested to operate directly on your physical computer screen:\n"${task}"\n\nAllow MAVE to control your host mouse and keyboard?`,
              confirm: 'Authorize Host Control',
            });
            router.authorizeHostSession(virtualSession.sessionId);
          }
          this.hooks.terminal('info', '[Execution Target] Operating on physical host desktop.');
        }
      } catch (routeErr) {
        if (routeErr instanceof StoppedError || (routeErr.message && routeErr.message.includes('declined'))) {
          this.running = false;
          this.abort = null;
          throw routeErr;
        }
      }
    }

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
      const activeProv = this.settings.get('provider');
      const isLocalSelection = !activeProv || ['local', 'colibri', 'airllm', 'ollama'].includes(activeProv);
      if (isLocalSelection && this.settings.get('autoModelRouting') !== false) {
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

          if ((image || decision.tier3 === 'vision') && (desktopToolsAllowed || image)) {
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
      const resolveToolsForProvider = (provId) => (
        desktopToolsAllowed
          ? this.plugins.definitionsForTask(task, provId, { chatOnly: false })
          : (allowReadOnlyWeb ? this.plugins.definitionsForTask(task, provId, { chatOnly: true, readOnlyWeb: true }) : [])
      );
      let provider = this.ensureProvider({ computerEnabled: desktopToolsAllowed });
      if (typeof provider.updateTools === 'function') {
        provider.updateTools(resolveToolsForProvider(provider.id), { computer: desktopToolsAllowed });
      }
      this.hooks.terminal('info', `Using ${llm.describe(this.settings, provider.id)}`);
      let activeWindowNote = '';
      if (desktopToolsAllowed) {
        try {
          if (this.input && typeof this.input.windowTitle === 'function') {
            const winTitle = await this.input.windowTitle();
            if (winTitle && winTitle.trim()) {
              activeWindowNote = `\n\n(Current active foreground window on user's PC: "${winTitle.trim()}")`;
            }
          }
        } catch {}
      }

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
        const explicitScreenRef = isScreenInspectionQuery(task) || /\b(?:screen|display|window|desktop|button|menu|cursor|icon)\b/i.test(task);
        const shouldReadScreen = desktopToolsAllowed && ON_SCREEN.test(task) && (!isConversationalTask(task) || explicitScreenRef);
        if (this.ui && shouldReadScreen) {
          try {
            const snap = await this.ui.read(this.target);
            screenNote = `\n\n(${this.ui.describe(snap, task, { limit: this.listLimit(provider), point: this.modelPoint(provider) })})`;
          } catch (err) {
            this.hooks.terminal('error', `Couldn’t read the screen: ${err.message}`);
          }
        }
        let groundingNote = '';
        const entityMatch = (allowReadOnlyWeb || (desktopToolsAllowed && !isSelfOrCapabilityQuestion(task)))
          ? task.match(/^(?:what do you know about|tell me about|who is|who was|who founded|what happened to|is .+ real|lookup|search for)\s+([^?.!]+)/i)
          : null;
        if (entityMatch && entityMatch[1]) {
          const entityQuery = entityMatch[1].trim();
          if (!/^(?:yourself|your capabilities|you|me|my\s+\w+)$/i.test(entityQuery)) {
            groundingNote = `\n\n[Mave Grounding Directive: The user is asking about "${entityQuery}". Do NOT guess, invent fake slang definitions, fake biographies, or hallucinated claims. If you do not have verified, ground-truth facts in your persistent memories, you MUST call web_search({ query: "${entityQuery}" }) to retrieve verified real-world facts before giving your answer. If search yields no verified records, state honestly that you do not have verified records.]`;
          }
        }
        let memoryNote = '';
        if (speaker && speaker.name) {
          memoryNote += `\n\n(Recognized Speaker via Voice Biometrics: ${speaker.name}${speaker.role ? ` [Role: ${speaker.role}]` : ''}${speaker.confidence ? ` [Confidence: ${Math.round(speaker.confidence * 100)}%]` : ''}. Address the speaker appropriately and maintain family-aware context.)`;
        }
        try {
          const { getMemoryStore, getUserProfileSummary } = require('./memory');
          const summary = getMemoryStore().contextSummary(task);
          if (summary) memoryNote += `\n\n(Relevant persistent memories:\n${summary})`;
          if (/\b(who am i|what is my name|my name|about me|know about me|know me|\bme\b)\b/i.test(task)) {
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
        const thinkNote = opts.think ? '\n\n[Deep Thinking Mode Active: Reason thoroughly step-by-step, evaluate edge cases, and think through the solution before delivering your answer.]' : '';
        const anchorNote = desktopToolsAllowed
          ? `\n\n[Mave Task Anchor: "${task}"] Stick strictly to this user request. Do NOT divert to unrelated apps, websites, suggestions, or placeholders found on screen.`
          : (mode === 'chat'
            ? `\n\n[Chat Mode Active: Answer the user's message directly and helpfully in markdown. Desktop control, app launching, terminal commands, and file writes are disabled in Chat mode.]`
            : `\n\n[Conversational Query: "${task}"] Answer the user directly in clear markdown prose. Do NOT open apps, launch terminals, read the screen, or operate the computer unless explicitly instructed to perform an action.`);
        request = (p) => p.addUserMessage(task + activeWindowNote + groundingNote + screenNote + memoryNote + personaNote + personalizationNote + commonSenseNote + govNote + timeNote + thinkNote + anchorNote);
      }

      // Rehydrate multi-turn context from current thread
      if (Array.isArray(opts.history)) {
        this.conversationHistory = opts.history.map((m) => ({ role: m.role, content: m.content }));
        const cleanTurns = opts.history.filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim().length > 0);
        const recentTurns = cleanTurns.slice(-16);

        if (provider.id === 'anthropic') {
          provider.messages = [];
          for (const turn of recentTurns) {
            if (turn.role === 'user') {
              provider.messages.push({ role: 'user', content: [{ type: 'text', text: turn.content }] });
            } else if (turn.role === 'assistant') {
              provider.messages.push({ role: 'assistant', content: [{ type: 'text', text: turn.content }] });
            }
          }
        } else if (Array.isArray(provider.messages)) {
          const sys = (provider.messages[0] && provider.messages[0].role === 'system')
            ? provider.messages[0]
            : { role: 'system', content: systemPrompt(this.settings.get('assistantName')) };
          provider.messages = [sys];
          for (const turn of recentTurns) {
            if (turn.role === 'user') {
              provider.messages.push({ role: 'user', content: [{ type: 'text', text: turn.content }] });
            } else if (turn.role === 'assistant') {
              provider.messages.push({ role: 'assistant', content: turn.content });
            }
          }
        }
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
            const extracted = getMemoryStore().autoExtractLearnings(task, result.text);
            if (extracted && extracted.length > 0) {
              try {
                const { getChatGPTPersonalization } = require('./chatgpt/personalization');
                for (const item of extracted) {
                  getChatGPTPersonalization().addMemory(item.preference || item.fact, item.category || 'general');
                }
              } catch {}
              if (this.hooks && this.hooks.notice) {
                this.hooks.notice('Memory updated');
              }
            }
          } catch { /* ignore non-fatal memory update */ }
        }
        return result;
      } catch (err) {
        if (!this.canFallBackOffline(provider, err) || this.abort.signal.aborted) throw err;
        this.hooks.notice('You’re offline, so I’m switching to the local AI.');
        this.provider = null;
        provider = this.ensureProvider({ online: false, computerEnabled: desktopToolsAllowed });
        if (typeof provider.updateTools === 'function') {
          const offlineTools = desktopToolsAllowed
            ? this.plugins.definitionsForTask(task, provider.id, { chatOnly: false })
            : [];
          provider.updateTools(offlineTools, { computer: desktopToolsAllowed });
        }
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
            const extracted = getMemoryStore().autoExtractLearnings(task, result.text);
            if (extracted && extracted.length > 0) {
              try {
                const { getChatGPTPersonalization } = require('./chatgpt/personalization');
                for (const item of extracted) {
                  getChatGPTPersonalization().addMemory(item.preference || item.fact, item.category || 'general');
                }
              } catch {}
              if (this.hooks && this.hooks.notice) {
                this.hooks.notice('Memory updated');
              }
            }
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
      if (isGuestExecution && hostTarget) {
        this.target = hostTarget;
      }
      if (virtualSession) {
        virtualSession.updateProgress('Task Completed / Idle');
      }
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
    if (this.goalContract) {
      const evalRes = getGoalDriftDetector().evaluateCandidateAction(this.goalContract, call);
      if (!evalRes.allowed) {
        return evalRes.reason;
      }
    }
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

    // 2. Conversational inquiry / Chat mode protection: never launch apps, run terminal, or control desktop
    if (this.currentMode === 'chat' || isConversationalTask(task)) {
      if (name === 'open_app' || name === 'open_url' || name === 'terminal' || name === 'run_command'
        || name === 'click_element' || name === 'type_into' || name === 'scroll_screen'
        || name === 'drag_element' || name === 'read_screen' || name === 'write_file'
        || name === 'delete_path' || name.startsWith('use_') || call.computer) {
        return this.currentMode === 'chat'
          ? `Chat mode is active: computer, terminal, and app control tools are disabled. Answer directly in chat or suggest switching to Work mode.`
          : `The user asked a conversational question ("${task}"), not to open external apps, run terminal commands, or operate the desktop. Provide a helpful answer directly in chat.`;
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
      const toolVerifier = getToolRegistryAndVerifier();
      const execRec = toolVerifier.recordExecutionStart(call.name, call.input, call.computer ? 'host' : 'guest_vm');
      try {
        let content = call.computer
          ? await this.runComputer(call.name, call.input, signal)
          : await this.plugins.run(call.name, call.input, this.pluginContext(signal));
        const artifacts = (call.input && (call.input.path || call.input.filePath)) ? [call.input.path || call.input.filePath] : [];
        execRec.complete(content, artifacts);
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
        execRec.fail(err.message);
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
    try {
      const snap = await this.ui.read(this.target);
      const list = this.ui.describe(snap, this.task, { limit: this.listLimit(provider), point: this.modelPoint(provider) });
      return snap && snap.items && snap.items.length ? list : null;
    } catch {
      return null;
    }
  }

  async runComputer(name, input, signal) {
    this.computer.validate(this.target, name, input);
    // The local model asked to look: the list answers in a second; zoom still shows real pixels.
    if (name === 'screenshot' && this.textScreen(this.provider)) {
      const list = await this.screenList(this.provider).catch(() => null);
      if (list) return `${list}\n(This is the screen as a list. To see actual pixels of an area, use the zoom action.)`;
    }
    const isGuest = Boolean(this.target && (this.target.isVirtual || this.target.isGuest));
    if (!READ_ONLY.has(name)) {
      if (!isGuest) {
        await this.guardSensitiveWindow();
      }
      const mode = this.settings.get('approvalMode');
      if (mode === 'every' || (mode === 'risky' && isRisky(name, input))) {
        await this.confirm('always', { title: 'Allow this action?', message: describeAction(name, input), confirm: 'Allow' });
      }
      if (!isGuest) {
        await this.failSafe();
      }
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

module.exports = { Agent, AgentError, extractPoint, toUserError, isPlanInsteadOfAction, isConversationalTask, isFalseCompletionHallucination, isSelfOrCapabilityQuestion, isScreenInspectionQuery, taskUsesDesktopTools };
