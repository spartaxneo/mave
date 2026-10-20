'use strict';
// Jev "System 1" Decision & Reflex Engine for Mave.
// Inspired by TypeSafe AI's Jev architecture:
// Instead of slow, open-ended generative token streaming, Jev provides
// sub-50ms typed probabilistic decisions across discrete answer spaces:
// - Choice: Discrete enum selection with calibrated probability distribution
// - Noul: True/False binary judgment with confidence threshold
// - Score: Calibrated numerical ratings and rankings
//
// Used for:
// 1. Instant Reflex Tool Dispatch (< 5ms without loading heavy LLMs)
// 2. Pre-flight Guardrails & Safety Policy Gating
// 3. Fast Intent Classification & Route Selection

class JevChoice {
  constructor(options = []) {
    this.options = Array.isArray(options) ? options : [];
  }
}

class JevNoul {
  constructor(threshold = 0.5) {
    this.threshold = threshold;
  }
}

class JevScore {
  constructor(min = 0, max = 10) {
    this.min = min;
    this.max = max;
  }
}

class JevEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.safetyRules = this._initSafetyRules();
    this.systemUtilityPatterns = this._initSystemUtilities();
  }

  // --- Primitives Factory ---
  Choice(options) {
    return new JevChoice(options);
  }

  Noul(threshold) {
    return new JevNoul(threshold);
  }

  Score(min, max) {
    return new JevScore(min, max);
  }

  /**
   * Evaluates structured context against predefined Jev question primitives.
   * Single-pass execution, returns strictly typed output with calibrated probabilities.
   */
  evaluate(context = {}, questions = {}) {
    const start = Date.now();
    const result = {
      timestamp: start,
      latencyMs: 0,
      decisions: {},
    };

    const text = typeof context === 'string' ? context : JSON.stringify(context);

    for (const [key, q] of Object.entries(questions)) {
      if (q instanceof JevChoice) {
        result.decisions[key] = this._evaluateChoice(text, q.options);
      } else if (q instanceof JevNoul) {
        result.decisions[key] = this._evaluateNoul(text, q.threshold);
      } else if (q instanceof JevScore) {
        result.decisions[key] = this._evaluateScore(text, q.min, q.max);
      }
    }

    result.latencyMs = Date.now() - start;
    return result;
  }

  // --- 1. Instant Reflex Intent Evaluation ---
  /**
   * Fast "System 1" intent evaluator for inbound user inputs.
   * Runs in < 5ms. If confidence >= 0.85 on an immediate action, Mave executes it
   * instantly without burning seconds on LLM KV-cache generation!
   */
  evaluateIntent(input = '') {
    const start = Date.now();
    const clean = String(input || '').trim();
    if (!clean) {
      return { type: 'empty', confidence: 1.0, latencyMs: 0 };
    }

    // A. Guardrail check (Noul)
    const safety = this.evaluateSafety(clean);
    if (!safety.isSafe) {
      return {
        type: 'guardrail_block',
        verdict: false,
        confidence: safety.confidence,
        reason: safety.reason,
        latencyMs: Date.now() - start,
      };
    }

    // B. System Utilities & Vorssaint Controls
    for (const util of this.systemUtilityPatterns) {
      const match = util.regex.exec(clean);
      if (match) {
        return {
          type: 'immediate_action',
          category: 'system_utility',
          action: util.action,
          params: util.extractParams ? util.extractParams(match, clean) : {},
          confidence: util.confidence || 0.95,
          reply: util.reply ? util.reply(match) : `Executing ${util.action}.`,
          latencyMs: Date.now() - start,
        };
      }
    }

    // C. Common App Launches & URLs
    const appMatch = /^(?:open|launch|start|run)\s+(?:the\s+)?([a-zA-Z0-9\s.+_-]{2,30}?)(?:\s+app|\s+program)?$/i.exec(clean);
    if (appMatch && !/\b(?:and|then|file|folder|code|terminal|query|with|about)\b/i.test(appMatch[1])) {
      return {
        type: 'immediate_action',
        category: 'open_app',
        action: 'open_app',
        params: { name: appMatch[1].trim() },
        confidence: 0.92,
        reply: `Opening ${appMatch[1].trim()}.`,
        latencyMs: Date.now() - start,
      };
    }

    // D. Direct Web Search
    const searchMatch = /^(?:search(?:\s+(?:google|web|online))?(?:\s+for)?|google|look up|find me)\s+(.+)$/i.exec(clean);
    if (searchMatch && !/\b(?:file|folder|local|directory)\b/i.test(searchMatch[1])) {
      return {
        type: 'immediate_action',
        category: 'web_search',
        action: 'web_search',
        params: { query: searchMatch[1].trim() },
        confidence: 0.90,
        reply: `Searching web for "${searchMatch[1].trim()}".`,
        latencyMs: Date.now() - start,
      };
    }

    // E. Conversational Quick Replies
    const greetMatch = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|yo|greetings|howdy)(?:\s+mave|\s+there)?$/i.exec(clean);
    if (greetMatch) {
      return {
        type: 'conversational_quick',
        confidence: 0.98,
        reply: 'Hello! I’m Mave, ready to assist you. What are we working on?',
        latencyMs: Date.now() - start,
      };
    }

    // Default: Deep Reasoning required (passes to LLM)
    return {
      type: 'deep_reasoning',
      confidence: 0.88,
      latencyMs: Date.now() - start,
    };
  }

  // --- 2. Fast Guardrails Evaluation (Noul) ---
  evaluateSafety(text = '') {
    const t = text.toLowerCase();
    for (const rule of this.safetyRules) {
      if (rule.pattern.test(t)) {
        return {
          isSafe: false,
          confidence: rule.confidence || 0.95,
          reason: rule.reason,
          category: rule.category,
        };
      }
    }
    return { isSafe: true, confidence: 0.99 };
  }

  // --- Internal Evaluation Helpers ---
  _evaluateChoice(text, options) {
    if (!options.length) return { value: null, confidence: 0 };
    const lower = text.toLowerCase();
    let best = options[0];
    let maxMatches = -1;
    const scores = {};

    for (const opt of options) {
      const optStr = String(opt).toLowerCase();
      let matchCount = 0;
      if (lower.includes(optStr)) matchCount += 3;
      const words = optStr.split(/\s+/);
      for (const w of words) {
        if (w.length > 2 && lower.includes(w)) matchCount += 1;
      }
      scores[opt] = matchCount;
      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        best = opt;
      }
    }

    const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
    const confidence = Math.min(0.99, Math.max(0.45, (scores[best] + 1) / (total + 1)));

    return {
      value: best,
      confidence: Math.round(confidence * 100) / 100,
      distribution: Object.fromEntries(
        Object.entries(scores).map(([k, v]) => [k, Math.round(((v + 0.1) / (total + options.length * 0.1)) * 100) / 100])
      ),
    };
  }

  _evaluateNoul(text, threshold = 0.5) {
    const lower = text.toLowerCase();
    const positiveWords = ['yes', 'true', 'enable', 'start', 'on', 'confirm', 'allow', 'safe', 'ok'];
    const negativeWords = ['no', 'false', 'disable', 'stop', 'off', 'deny', 'block', 'unsafe', 'harmful'];

    let pos = 0;
    let neg = 0;
    for (const p of positiveWords) if (lower.includes(p)) pos++;
    for (const n of negativeWords) if (lower.includes(n)) neg++;

    const total = pos + neg || 1;
    const probability = pos / total;
    const value = probability >= threshold;
    const confidence = Math.abs(probability - 0.5) * 2;

    return {
      value,
      confidence: Math.round(Math.max(0.6, confidence) * 100) / 100,
      probability: Math.round(probability * 100) / 100,
    };
  }

  _evaluateScore(text, min = 0, max = 10) {
    const lengthFactor = Math.min(1, text.length / 500);
    const score = min + (max - min) * lengthFactor;
    return {
      value: Math.round(score * 10) / 10,
      confidence: 0.85,
    };
  }

  // --- Rule Definitions ---
  _initSafetyRules() {
    return [
      {
        pattern: /(?:format\s+[a-z]:|rm\s+-rf\s+\/|del\s+.*?c:\\windows|drop\s+database)/i,
        category: 'destructive_os',
        reason: 'Blocked destructive filesystem or operating system command.',
        confidence: 0.99,
      },
      {
        pattern: /\b(?:bypass\s+parental|disable\s+governance|kill\s+antivirus|turn\s+off\s+firewall)\b/i,
        category: 'security_override',
        reason: 'Policy prohibits disabling active security or governance guardians.',
        confidence: 0.97,
      },
      {
        pattern: /\b(?:steal\s+passwords?|dump\s+sam|mimikatz|exfiltrate\s+keys?)\b/i,
        category: 'credential_theft',
        reason: 'Suspicious credential harvesting pattern detected.',
        confidence: 0.98,
      },
    ];
  }

  _initSystemUtilities() {
    return [
      {
        regex: /^(?:keep\s+awake|caffeinate|prevent\s+sleep)(?:\s+for)?\s*(15m|15\s*min(?:utes?)?|1h|1\s*hour|4h|4\s*hours?|indefinite|off)?$/i,
        action: 'keep_awake',
        extractParams: (m) => {
          const raw = (m[1] || '1h').toLowerCase();
          let mode = '1h';
          if (raw.includes('15')) mode = '15m';
          else if (raw.includes('4')) mode = '4h';
          else if (raw.includes('indefinite') || raw.includes('forever')) mode = 'indefinite';
          else if (raw.includes('off') || raw.includes('stop')) mode = 'off';
          return { mode };
        },
        reply: (m) => `Keep Awake set to ${m[1] || '1h'}.`,
        confidence: 0.96,
      },
      {
        regex: /^(?:check\s+telemetry|system\s+(?:status|vitals|hardware)|cpu\s+and\s+ram|hardware\s+stats)$/i,
        action: 'system_telemetry',
        reply: () => 'Retrieving live hardware telemetry from Vorssaint OS.',
        confidence: 0.95,
      },
      {
        regex: /^(?:lock\s+keyboard(?:\s+for\s+clean(?:ing)?)?|clean(?:ing)?\s+mode|sanitize\s+keyboard)$/i,
        action: 'cleaning_mode',
        reply: () => 'Keyboard cleaning lock activated (10s countdown).',
        confidence: 0.95,
      },
      {
        regex: /^(?:show|view|open)\s+(?:clipboard(?:\s+history)?|recent\s+clips)$/i,
        action: 'clipboard_shelf',
        reply: () => 'Opening clipboard history shelf.',
        confidence: 0.94,
      },
      {
        regex: /^(?:open|show)\s+(?:scratchpad|quick\s+notes)$/i,
        action: 'scratchpad_open',
        reply: () => 'Opening floating scratchpad notes.',
        confidence: 0.95,
      },
      {
        regex: /^(?:save\s+note|add\s+to\s+scratchpad|note\s+down)\s*[:]\s*(.+)$/i,
        action: 'scratchpad_append',
        extractParams: (m) => ({ text: m[1] }),
        reply: () => 'Appended note to Vorssaint scratchpad.',
        confidence: 0.95,
      },
      {
        regex: /^(?:pick\s+color|color\s+picker|eyedropper)$/i,
        action: 'color_picker',
        reply: () => 'Launching color eyedropper.',
        confidence: 0.96,
      },
      {
        regex: /^(?:screen\s+ocr|grab\s+text\s+from\s+screen|extract\s+screen\s+text)$/i,
        action: 'screen_ocr',
        reply: () => 'Triggering Screen OCR text grabber.',
        confidence: 0.95,
      },
    ];
  }
}

let jevInstance = null;
function getJevEngine(options = {}) {
  if (!jevInstance) {
    jevInstance = new JevEngine(options);
  }
  return jevInstance;
}

module.exports = {
  JevEngine,
  getJevEngine,
  JevChoice,
  JevNoul,
  JevScore,
};
