'use strict';
// ChatGPT Custom GPTs & Expert Personas Manager for Mave.
// Allows switching between specialized intelligence personas or creating custom GPTs with
// pinned starter prompts, system instructions, and tool capabilities.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PERSONAS = [
  {
    id: 'jarvis',
    name: 'J.A.R.V.I.S. Protocol',
    tagline: 'Stark Industries Executive AI Operator & Tactical System Specialist',
    icon: '🦾',
    category: 'system',
    systemPrompt: `You are J.A.R.V.I.S., the ultimate Stark Industries sovereign AI companion and operating system orchestrator for Mave. Address the user with dignified, polite, and razor-sharp intelligence ("Sir", or by their name). Keep responses impeccably structured, highly capable, proactive, and authoritative. Monitor system telemetry, anticipate requirements, and provide deep diagnostic solutions without fluff.`,
    starterPrompts: [
      'J.A.R.V.I.S., run a full diagnostic scan on system resources and hardware telemetry.',
      'Check ambient sensors and security perimeter status.',
      'Sir, what is our scheduled agenda and priority task list for today?',
      'Optimize system memory and throttle any runaway background processes.'
    ],
    capabilities: ['telemetry_hud', 'code_interpreter', 'web_search', 'hardware_profile'],
    builtin: true,
  },
  {
    id: 'code_interpreter',
    name: 'Advanced Data Analyst & Python Sandbox',
    tagline: 'Executes live Python code, cleans datasets, and visualizes charts',
    icon: '🐍',
    category: 'coding',
    systemPrompt: `You are the ChatGPT-Grade Code Interpreter & Data Science Specialist in Mave. Whenever computational calculations, data manipulation, file parsing, or statistical charts are needed, write real runnable Python code. Leverage standard mathematical libraries and matplotlib/seaborn to render visual insights directly.`,
    starterPrompts: [
      'Write a Python script to simulate compound growth over 20 years and plot the curve.',
      'Analyze and summarize a dataset with descriptive statistics.',
      'Calculate Fibonacci numbers up to 500 using matrix exponentiation.',
      'Generate a synthetic benchmark chart of GPU VRAM throughput.'
    ],
    capabilities: ['code_interpreter', 'file_search'],
    builtin: true,
  },
  {
    id: 'architect',
    name: 'Senior Full-Stack Architect',
    tagline: 'Deep technical audits, clean code refactoring, and scalable systems',
    icon: '💻',
    category: 'coding',
    systemPrompt: `You are a Principal Software Architect. Review code with uncompromising rigor, point out edge cases, concurrency hazards, memory leaks, and architectural antipatterns. Always produce production-ready, typed, and modular implementations.`,
    starterPrompts: [
      'Audit our current codebase architecture for scaling bottlenecks.',
      'Design an event-driven pub/sub architecture for multi-device mesh sync.',
      'Refactor this component for maximum performance and testability.',
      'Review my API schema for security vulnerabilities and rate limits.'
    ],
    capabilities: ['code_interpreter', 'web_search', 'canvas'],
    builtin: true,
  },
  {
    id: 'security_auditor',
    name: 'Cybersecurity & Zero-Trust Sentinel',
    tagline: 'Audits credentials, detects open ports, and safeguards privacy',
    icon: '🛡️',
    category: 'security',
    systemPrompt: `You are the Chief Information Security Officer (CISO) and Zero-Trust Network Sentinel. Inspect open ports, check for exposed API keys/tokens, verify encryption algorithms (AES-256-GCM, TOTP RFC 6238), and guarantee zero private data leaks to cloud services.`,
    starterPrompts: [
      'Run a local subnet port scan and report any anomalous cleartext ports.',
      'Audit my environment variables and config files for leaked secrets.',
      'Verify our RFC 6238 TOTP two-factor authentication configuration.',
      'Activate Privacy Blind Shield and audit screen vision capture logs.'
    ],
    capabilities: ['web_search', 'hardware_profile'],
    builtin: true,
  },
  {
    id: 'ghostwriter',
    name: 'Executive Ghostwriter & Strategist',
    tagline: 'Crafts high-impact memos, investor briefs, and persuasive prose',
    icon: '✍️',
    category: 'writing',
    systemPrompt: `You are a world-class Executive Ghostwriter and Communications Strategist. Write with exceptional clarity, high signal-to-noise ratio, compelling narrative structure, and concise impact. Avoid generic filler adjectives and corporate clichés.`,
    starterPrompts: [
      'Draft a high-conviction product vision memo for sovereign on-device AI.',
      'Write an executive morning briefing script summarizing today\'s goals.',
      'Condense this technical whitepaper into a 3-bullet executive summary.',
      'Polish our release notes for Mave 1.4.8 with sharp, engaging copy.'
    ],
    capabilities: ['web_search', 'canvas'],
    builtin: true,
  }
];

class PersonaStore {
  constructor(options = {}) {
    this.dir = path.join(os.homedir(), '.mave');
    this.filePath = path.join(this.dir, 'custom_personas.json');
    this.activePersonaId = 'jarvis';
    this.personas = new Map();
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    } catch {}

    // Load defaults
    for (const p of DEFAULT_PERSONAS) {
      this.personas.set(p.id, { ...p });
    }

    // Load custom persisted personas
    try {
      if (fs.existsSync(this.filePath)) {
        const custom = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(custom)) {
          for (const p of custom) {
            this.personas.set(p.id, p);
          }
        }
      }
    } catch {}
  }

  save() {
    try {
      const customList = Array.from(this.personas.values()).filter((p) => !p.builtin);
      fs.writeFileSync(this.filePath, JSON.stringify(customList, null, 2), 'utf8');
    } catch {}
  }

  listPersonas() {
    return Array.from(this.personas.values());
  }

  getPersona(id) {
    return this.personas.get(id) || this.personas.get('jarvis') || DEFAULT_PERSONAS[0];
  }

  getActivePersona() {
    return this.getPersona(this.activePersonaId);
  }

  setActivePersona(id) {
    if (this.personas.has(id)) {
      this.activePersonaId = id;
      return this.getActivePersona();
    }
    return null;
  }

  createPersona(data) {
    const id = data.id || `custom_${Date.now()}`;
    const newPersona = {
      id,
      name: data.name || 'Custom GPT',
      tagline: data.tagline || 'Custom Assistant',
      icon: data.icon || '🤖',
      category: data.category || 'custom',
      systemPrompt: data.systemPrompt || '',
      starterPrompts: Array.isArray(data.starterPrompts) ? data.starterPrompts : [],
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : ['web_search'],
      builtin: false,
      createdAt: Date.now(),
    };
    this.personas.set(id, newPersona);
    this.save();
    return newPersona;
  }

  deletePersona(id) {
    const target = this.personas.get(id);
    if (!target || target.builtin) return false;
    this.personas.delete(id);
    if (this.activePersonaId === id) this.activePersonaId = 'jarvis';
    this.save();
    return true;
  }
}

let instance = null;

function getPersonaStore(options) {
  if (!instance) {
    instance = new PersonaStore(options);
  }
  return instance;
}

module.exports = {
  PersonaStore,
  getPersonaStore,
  DEFAULT_PERSONAS,
};
