'use strict';
// Persistent long-term memory engine for Bigfoot.
// Stores user preferences, project notes, habits, and knowledge in %APPDATA%\Bigfoot\memory.json.
// Automatically retrieves relevant facts to inject into conversations so Bigfoot remembers the user.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultMemoryPath() {
  const dir = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.bigfoot');
  return path.join(dir, 'memory.json');
}

const SHORT_KEYWORDS = new Set(['me', 'ai', 'os', 'pc', 'ui', 'ip', 'se', 'db', 'js', 'py']);

function cleanKeywords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || SHORT_KEYWORDS.has(w));
}

class MemoryStore {
  constructor(filePath = defaultMemoryPath()) {
    this.file = filePath;
    this.memories = [];
    this.keywordIndex = new Map();
    this.load();
  }

  rebuildIndex() {
    this.keywordIndex = new Map();
    for (const m of this.memories) {
      this.indexMemory(m);
    }
  }

  indexMemory(m) {
    if (!this.keywordIndex) this.keywordIndex = new Map();
    const words = new Set([...(m.keywords || []), ...cleanKeywords(m.fact)]);
    for (const w of words) {
      if (!this.keywordIndex.has(w)) this.keywordIndex.set(w, new Set());
      this.keywordIndex.get(w).add(m);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.memories = parsed;
          this.rebuildIndex();
          return;
        }
      }
    } catch {
      // Corrupt or empty file: initialize fresh
    }
    this.memories = [];
    this.keywordIndex = new Map();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.memories, null, 2), 'utf8');
    } catch (err) {
      // Non-fatal write failure
    }
  }

  /**
   * Add or update a fact in long-term memory.
   */
  remember(fact, { topic = 'general', keywords = [] } = {}) {
    const text = String(fact || '').trim();
    if (!text) throw new Error('Cannot store an empty memory.');

    const norm = text.toLowerCase();
    const extractedKeywords = Array.from(new Set([...cleanKeywords(text), ...(keywords || []).map((k) => String(k).toLowerCase())]));

    // Check if an existing memory with identical or near-identical text exists
    const existingIndex = this.memories.findIndex((m) => m.fact.toLowerCase() === norm);
    const now = Date.now();

    if (existingIndex >= 0) {
      const existing = this.memories[existingIndex];
      existing.topic = topic || existing.topic;
      existing.keywords = Array.from(new Set([...existing.keywords, ...extractedKeywords]));
      existing.updatedAt = now;
      existing.accessCount = (existing.accessCount || 0) + 1;
      this.rebuildIndex();
      this.save();
      return existing;
    }

    const item = {
      id: `mem_${now}_${Math.random().toString(36).slice(2, 7)}`,
      topic: topic || 'general',
      fact: text,
      keywords: extractedKeywords,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };

    this.memories.unshift(item);
    // Keep reasonable cap (max 500 memories)
    if (this.memories.length > 500) this.memories.pop();
    this.indexMemory(item);
    this.save();
    return item;
  }

  /**
   * Recall memories relevant to a query text or keyword.
   */
  recall(query, { topic = null, limit = 5 } = {}) {
    const qWords = cleanKeywords(query);
    if (!qWords.length) {
      const subset = topic ? this.memories.filter((m) => m.topic === topic) : this.memories;
      return subset.slice(0, limit);
    }

    // Fast O(1) candidate lookup using inverted keyword index
    const candidates = new Set();
    if (this.keywordIndex) {
      for (const w of qWords) {
        const set = this.keywordIndex.get(w);
        if (set) {
          for (const m of set) candidates.add(m);
        }
      }
    }

    // If query words didn't hit index directly (e.g. partial substring), fall back to checking memories
    const pool = candidates.size > 0 ? Array.from(candidates) : this.memories;

    const scored = pool.map((m) => {
      if (topic && m.topic !== topic) return { memory: m, score: -1 };
      let score = 0;
      const mText = m.fact.toLowerCase();
      const mKeys = new Set(m.keywords);

      for (const w of qWords) {
        if (mText.includes(w)) score += 2;
        if (mKeys.has(w)) score += 3;
      }

      // Bonus for recently updated or frequently accessed memories
      if (score > 0) {
        const daysOld = (Date.now() - (m.updatedAt || m.createdAt)) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 1.5 - daysOld * 0.1);
        score += Math.min(1.0, (m.accessCount || 0) * 0.1);
      }

      return { memory: m, score };
    });

    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => {
        s.memory.accessCount = (s.memory.accessCount || 0) + 1;
        return s.memory;
      });

    if (results.length) this.save();
    return results;
  }

  /**
   * List all stored memories.
   */
  list({ topic = null, limit = 50 } = {}) {
    let list = this.memories;
    if (topic) list = list.filter((m) => m.topic === topic);
    return list.slice(0, limit);
  }

  /**
   * Remove a memory by its ID or exact text match.
   */
  forget(idOrText) {
    const target = String(idOrText || '').trim().toLowerCase();
    const countBefore = this.memories.length;
    this.memories = this.memories.filter((m) => m.id !== idOrText && m.fact.toLowerCase() !== target);
    const removed = countBefore - this.memories.length;
    if (removed > 0) {
      this.rebuildIndex();
      this.save();
    }
    return removed > 0;
  }

  /**
   * Clear all memories.
   */
  clear() {
    this.memories = [];
    this.keywordIndex = new Map();
    this.save();
  }

  /**
   * Record or update user taste in a specific domain (music, coding, workflow, ui, general).
   */
  recordTaste(category, preference, keywords = []) {
    const text = String(preference || '').trim();
    if (!text) return null;
    const cat = String(category || 'general').toLowerCase();
    const fact = `User ${cat} taste: ${text}`;
    return this.remember(fact, {
      topic: 'preference',
      keywords: Array.from(new Set([cat, 'taste', 'preference', 'favorite', ...keywords])),
    });
  }

  /**
   * Get all learned tastes in a category.
   */
  getTaste(category = 'music') {
    const cat = String(category || '').toLowerCase();
    return this.memories.filter((m) => m.topic === 'preference' && (m.fact.toLowerCase().includes(`${cat} taste`) || m.keywords.includes(cat)));
  }

  /**
   * Automatically detect and extract user tastes, preferences, and habits from an interaction.
   */
  autoExtractTaste(userText, assistantText = '') {
    const text = String(userText || '').trim();
    if (!text || text.length < 4) return [];

    const lower = text.toLowerCase();
    const extracted = [];

    // 1. Dislikes / Negative preferences: "don't ever play jazz", "i hate light mode", "never use python 2"
    const dislikeMatch = /\b(?:don['’]?t (?:ever )?(?:play|use|like)|never (?:play|use)|i (?:hate|dislike))\s+([^.,;!?\n]{3,40})/i.exec(text);
    if (dislikeMatch) {
      const avoided = dislikeMatch[1].trim();
      extracted.push({
        category: 'preference',
        preference: `dislikes / avoids: ${avoided}`,
        keywords: ['dislike', 'avoid', 'preference', ...avoided.toLowerCase().split(/\s+/)],
      });
      for (const item of extracted) {
        this.recordTaste(item.category, item.preference, item.keywords);
      }
      return extracted;
    }

    // 2. Music preferences: e.g. "play lofi", "play daft punk", "i like synthwave", "i love rock"
    const musicMatch = /(?:i (?:really )?(?:like|love|prefer|enjoy)|favorite (?:music|genre|band|artist|song) is|play (?:me |some )?)\s*([a-zA-Z0-9\s_-]{3,40})/i.exec(text);
    if (musicMatch && /\b(music|song|track|playlist|lofi|lo-fi|rock|pop|jazz|hip-hop|rap|classical|metal|edm|synthwave|ambient|chill|beats|spotify|artist)\b/i.test(lower)) {
      const taste = musicMatch[1].trim();
      if (!/^(some|it|this|that|music|a song|now)$/i.test(taste)) {
        extracted.push({
          category: 'music',
          preference: `likes and frequently listens to "${taste}"`,
          keywords: ['music', 'spotify', 'audio', 'song', 'playlist', ...taste.toLowerCase().split(/\s+/)],
        });
      }
    }

    // 3. Explicit preference: "i prefer dark mode", "i like typescript", "always use tabs"
    const generalPrefMatch = /\b(?:i (?:really )?prefer|i always use|my favorite\s+([a-zA-Z0-9_-]+)\s+is|i (?:like|love))\s+([^.,;!?\n]{3,60})/i.exec(text);
    if (generalPrefMatch && !extracted.length) {
      const subject = generalPrefMatch[1] || 'general';
      const detail = generalPrefMatch[2] ? generalPrefMatch[2].trim() : generalPrefMatch[0];
      if (detail && !/^(to|that|you|it|this|not)$/i.test(detail)) {
        extracted.push({
          category: subject,
          preference: `prefers: ${detail}`,
          keywords: ['preference', 'user', ...detail.toLowerCase().split(/\s+/)],
        });
      }
    }

    // Save extracted items into long-term memory
    for (const item of extracted) {
      this.recordTaste(item.category, item.preference, item.keywords);
    }

    return extracted;
  }

  /**
   * Build a brief summary of persistent memories for inclusion in task context.
   */
  contextSummary(taskQuery = '', { limit = 6 } = {}) {
    let relevant = [];
    const qLower = String(taskQuery || '').toLowerCase();

    // Proactive category priority: If user asks about music / media / spotify
    if (/\b(music|spotify|song|tunes|track|playlist|listen|artist|band|genre)\b/i.test(qLower)) {
      const musicTastes = this.getTaste('music');
      for (const m of musicTastes) {
        if (!relevant.some((r) => r.id === m.id)) relevant.push(m);
      }
    }

    if (taskQuery && taskQuery.trim()) {
      const recalled = this.recall(taskQuery, { limit: limit - relevant.length });
      for (const m of recalled) {
        if (!relevant.some((r) => r.id === m.id)) relevant.push(m);
      }
    } else {
      // Only include top general memories when no specific task query was passed
      if (relevant.length < limit) {
        const topGeneral = this.memories.slice(0, limit - relevant.length);
        for (const m of topGeneral) {
          if (!relevant.some((r) => r.id === m.id)) relevant.push(m);
        }
      }
    }

    if (!relevant.length) return '';
    return relevant.map((m) => `- [${m.topic}] ${m.fact}`).join('\n');
  }

  /**
   * Get the current circadian time-of-day period and focus.
   */
  getTimeOfDayContext(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return { period: 'morning', label: 'Morning (5 AM - 12 PM)', focus: 'energizing, coffee, planning, upbeat' };
    if (hour >= 12 && hour < 17) return { period: 'afternoon', label: 'Afternoon (12 PM - 5 PM)', focus: 'deep work, productivity, focus' };
    if (hour >= 17 && hour < 22) return { period: 'evening', label: 'Evening (5 PM - 10 PM)', focus: 'winding down, relaxing, chill' };
    return { period: 'night', label: 'Late Night (10 PM - 5 AM)', focus: 'quiet focus, dark synthwave, lo-fi, ambient' };
  }

  /**
   * Get circadian-adapted taste for a category based on the time of day.
   */
  getCircadianTaste(category = 'music', date = new Date()) {
    const ctx = this.getTimeOfDayContext(date);
    const cat = String(category).toLowerCase();
    const specific = this.memories.find((m) => m.topic === 'preference' && m.fact.toLowerCase().includes(`${ctx.period} ${cat}`));
    if (specific) return { taste: specific.fact, period: ctx.period, custom: true };

    const defaults = {
      music: {
        morning: 'Upbeat Acoustic & Coffeehouse Lo-Fi',
        afternoon: 'Deep Focus & Electronic Synthwave',
        evening: 'Chill Beats & Indie Melodic',
        night: 'Dark Synthwave & Late Night Ambient Lo-Fi',
      },
    };
    const def = (defaults[cat] && defaults[cat][ctx.period]) || 'Instrumental Focus';
    return { taste: def, period: ctx.period, custom: false };
  }

  /**
   * Record real-time implicit feedback (skip, negative, positive, style correction).
   */
  recordFeedback({ action, item, feedback, reason = '' } = {}) {
    const act = String(action || 'general').toLowerCase();
    const fb = String(feedback || 'negative').toLowerCase();
    const it = String(item || '').trim();

    if (fb === 'skip' || fb === 'negative' || fb === 'dislike') {
      const fact = `User avoided/skipped ${act}: "${it}"${reason ? ` (${reason})` : ''} [logged at ${new Date().toLocaleTimeString()}]`;
      return this.remember(fact, {
        topic: 'preference',
        keywords: [act, 'skip', 'avoid', 'dislike', ...it.toLowerCase().split(/\s+/)],
      });
    }

    if (fb === 'like' || fb === 'positive' || fb === 'favorite') {
      const fact = `User strongly liked ${act}: "${it}"${reason ? ` (${reason})` : ''}`;
      return this.remember(fact, {
        topic: 'preference',
        keywords: [act, 'favorite', 'loved', ...it.toLowerCase().split(/\s+/)],
      });
    }
  }

  /**
   * Save a demonstrated or learned multi-step workflow recipe.
   */
  saveWorkflowRecipe({ name, app, steps = [], description = '' } = {}) {
    const recipeName = String(name || 'Custom Workflow').trim();
    const targetApp = String(app || 'General').trim();
    const stepList = Array.isArray(steps) ? steps : [];
    const fact = `Workflow Recipe "${recipeName}" for ${targetApp}: ${description || `${stepList.length} steps`}. Steps: ${JSON.stringify(stepList)}`;
    return this.remember(fact, {
      topic: 'rule',
      keywords: ['recipe', 'workflow', 'macro', targetApp.toLowerCase(), ...recipeName.toLowerCase().split(/\s+/)],
    });
  }

  /**
   * Recall a saved workflow recipe.
   */
  getWorkflowRecipe(nameOrApp) {
    const q = String(nameOrApp || '').toLowerCase();
    return this.recall(q, { topic: 'rule' }).filter((m) => m.fact.includes('Workflow Recipe'));
  }

  /**
   * List all saved workflow recipes.
   */
  listWorkflowRecipes() {
    return this.list({ topic: 'rule' }).filter((m) => m.fact.includes('Workflow Recipe'));
  }

  /**
   * Seed operational playbooks for famous tools and apps (WhatsApp, Gmail, ChatGPT, Instagram, Firebase).
   */
  seedAppPlaybooks() {
    const playbooks = [
      {
        fact: 'WhatsApp Playbook: Opened via desktop app or https://web.whatsapp.com. Direct message URL: https://web.whatsapp.com/send?phone={phone}&text={text}. Keyboard shortcut Ctrl+Alt+/ searches contacts. Press Enter to send, Shift+Enter for new line. Always confirm message text with user before sending.',
        topic: 'rule',
        keywords: ['whatsapp', 'message', 'chat', 'contact', 'phone'],
      },
      {
        fact: 'Gmail Playbook: Opened via https://mail.google.com. Instant compose window URL: https://mail.google.com/mail/?view=cm&fs=1&to={to}&su={subject}&body={body}. Search inbox URL: https://mail.google.com/mail/u/0/#search/{query}. Shortcut "c" composes, "/" searches, Ctrl+Enter sends. Always confirm email recipient and content before sending.',
        topic: 'rule',
        keywords: ['gmail', 'email', 'inbox', 'compose', 'mail'],
      },
      {
        fact: 'ChatGPT Playbook: Opened via https://chatgpt.com. Instant query URL: https://chatgpt.com/?q={prompt}. Use for code cross-validation, brainstorming, or writing. Locate input prompt textarea, type message, and press Enter to generate.',
        topic: 'knowledge',
        keywords: ['chatgpt', 'openai', 'prompt', 'gpt'],
      },
      {
        fact: 'Instagram Playbook: Opened via https://www.instagram.com. Direct messages URL: https://www.instagram.com/direct/inbox/. User profiles: https://www.instagram.com/{username}/. Explore page: https://www.instagram.com/explore/. Use vision elements to inspect posts, stories, and reply to DMs.',
        topic: 'knowledge',
        keywords: ['instagram', 'dm', 'profile', 'post', 'social'],
      },
      {
        fact: 'Firebase Playbook: Firebase CLI is installed locally. Use "firebase projects:list" to list projects, "firebase deploy" to deploy hosting/functions/firestore, "firebase emulators:start" for local development, and "firebase init" for setup. Web console: https://console.firebase.google.com. Active projects include Fromnear (studio-6464285995-59fdf) and fir-demo-project.',
        topic: 'project',
        keywords: ['firebase', 'hosting', 'firestore', 'deploy', 'database', 'cloud', 'backend', 'fromnear'],
      },
    ];

    for (const p of playbooks) {
      const exists = this.memories.some((m) => m.fact.toLowerCase().startsWith(p.fact.slice(0, 25).toLowerCase()));
      if (!exists) {
        this.remember(p.fact, { topic: p.topic, keywords: p.keywords });
      }
    }
  }

  addFamilyMember({ name, relationship, notes = '', birthday = '', preferences = '' }) {
    const text = `Family Member: ${name} (${relationship}). ${birthday ? `Birthday: ${birthday}. ` : ''}${preferences ? `Preferences: ${preferences}. ` : ''}${notes}`.trim();
    return this.remember(text, {
      topic: 'family',
      keywords: ['family', String(relationship || '').toLowerCase(), String(name || '').toLowerCase(), 'relative', 'household'],
    });
  }

  getFamilyMembers() {
    return this.memories.filter((m) => m.topic === 'family');
  }
}

// Global singleton instance for the app
let defaultStore = null;
function getMemoryStore(customPath = null) {
  if (customPath) return new MemoryStore(customPath);
  if (!defaultStore) {
    defaultStore = new MemoryStore();
    defaultStore.seedAppPlaybooks();
  }
  return defaultStore;
}

function getUserProfileSummary() {
  try {
    const user = os.userInfo ? os.userInfo().username : 'User';
    const hostname = os.hostname();
    const platform = `Windows (${os.release()})`;
    const cpus = os.cpus();
    const cpuModel = cpus && cpus[0] ? cpus[0].model.trim() : 'AMD Ryzen';
    const ramGB = Math.round(os.totalmem() / (1024 ** 3));
    return `User: "${user}" on PC "${hostname}" (${platform}). Specs: ${cpuModel}, NVIDIA GeForce RTX 5060 (8 GB dedicated VRAM), ${ramGB} GB system RAM. Local AI: Qwen3-VL models running directly on their GPU. Mobile LAN Controller: active on port 4040. Telegram Bot: @FromnearTaskManager_bot.`;
  } catch {
    return 'User on Windows PC with NVIDIA GeForce RTX 5060 GPU and Mave local AI.';
  }
}

module.exports = {
  MemoryStore,
  getMemoryStore,
  defaultMemoryPath,
  getUserProfileSummary,
};
