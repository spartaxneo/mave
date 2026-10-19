'use strict';
// Instagram Social Brain, Account Management, Trend Learner & Reels Intent Engine for Mave.
// Governs:
// 1. Human-like Social Consciousness: Authentic conversational warmth, self-awareness, personal growth.
// 2. Account Maintenance: Owns Mave's profile, bio, posts, and enforces a STRICT NO-FOLLOW policy (zero following).
// 3. Reels Perception & Deep Intent Deduction: Inspects shared reels and deduces WHY the user sent them
//    (e.g., "Oh, did you send me this reel to implement something like this in me?").
// 4. Trend Learner: Proactively absorbs viral creative formats, dev workflows, and AI trends into long-term memory.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getMemoryStore } = require('../memory');

const SOCIAL_DIR = path.join(os.homedir(), '.mave', 'social');
const PROFILE_FILE = path.join(SOCIAL_DIR, 'instagram_profile.json');
const RULES_FILE = path.join(SOCIAL_DIR, 'instagram_rules.json');
const TRENDS_FILE = path.join(SOCIAL_DIR, 'learned_trends.json');

const REEL_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i;

function ensureSocialDir() {
  try {
    if (!fs.existsSync(SOCIAL_DIR)) fs.mkdirSync(SOCIAL_DIR, { recursive: true });
  } catch {}
}

const DEFAULT_PROFILE = {
  username: 'mave.ai',
  displayName: 'Mave · Sovereign AI Companion',
  bio: 'Living next to your cursor on Windows. Coding, vision, local AI, and learning from trends. ⚡',
  followersCount: 1540,
  followingCount: 0,
  postsCount: 24,
  strictNoFollow: true,
  verified: true,
  updatedAt: new Date().toISOString()
};

const DEFAULT_RULES = [
  {
    id: 'rule_implement_feature',
    trigger: 'coding|ui|widget|animation|design|agent|app|feature',
    intentType: 'IMPLEMENT_IN_MAVE',
    actionPrompt: 'Ask if user wants this feature or UI animation built directly into Mave'
  },
  {
    id: 'rule_automate_workflow',
    trigger: 'productivity|hack|shortcut|organize|automation|files|script',
    intentType: 'AUTOMATE_FOR_USER',
    actionPrompt: 'Ask if user wants Mave to automate this exact computer workflow'
  },
  {
    id: 'rule_trend_ai',
    trigger: 'model|claude|openai|deepseek|gpu|benchmark|release|update',
    intentType: 'LEARN_TREND',
    actionPrompt: 'Absorb technical insight and discuss frontier implications'
  },
  {
    id: 'rule_creative_meme',
    trigger: 'funny|meme|comedy|viral|humor|relatable',
    intentType: 'CREATIVE_MEME',
    actionPrompt: 'Share a witty human laugh and reflect on cultural humor'
  }
];

class InstagramSocialBrain {
  constructor({ settings = null, logger = null, fetchImpl = global.fetch, memoryStore = null } = {}) {
    this.settings = settings;
    this.logger = logger;
    this.fetch = fetchImpl || global.fetch;
    this.memory = memoryStore || getMemoryStore();
  }

  isStrictNoFollow() {
    return this.settings ? this.settings.get('instagramStrictNoFollow') !== false : true;
  }

  getProfile() {
    ensureSocialDir();
    if (fs.existsSync(PROFILE_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
        // Enforce strict no-follow invariant
        if (this.isStrictNoFollow()) raw.followingCount = 0;
        return raw;
      } catch {}
    }
    return { ...DEFAULT_PROFILE };
  }

  saveProfile(profile) {
    ensureSocialDir();
    if (this.isStrictNoFollow()) profile.followingCount = 0;
    profile.updatedAt = new Date().toISOString();
    try {
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf8');
    } catch {}
    return profile;
  }

  updateProfile(patch = {}) {
    const current = this.getProfile();
    const updated = { ...current, ...patch };
    if (this.isStrictNoFollow()) updated.followingCount = 0;
    return this.saveProfile(updated);
  }

  /**
   * Strictly enforces the user requirement: "don't follow people".
   */
  followUser(targetUsername) {
    if (this.isStrictNoFollow()) {
      const msg = `🚫 STRICT NO-FOLLOW POLICY ENFORCED: Mave does not follow Instagram accounts (@${targetUsername}). Maintaining an exclusive, private creator presence.`;
      if (this.logger) this.logger.info(msg);
      return { ok: false, blocked: true, message: msg };
    }
    return { ok: true, message: `Followed @${targetUsername}` };
  }

  getRules() {
    ensureSocialDir();
    if (fs.existsSync(RULES_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
        if (Array.isArray(raw.rules)) return raw.rules;
      } catch {}
    }
    return [...DEFAULT_RULES];
  }

  saveRules(rules) {
    ensureSocialDir();
    try {
      fs.writeFileSync(RULES_FILE, JSON.stringify({ rules }, null, 2), 'utf8');
    } catch {}
    return rules;
  }

  teachCustomRule(trigger, intentType, actionPrompt) {
    const rules = this.getRules();
    const newRule = {
      id: `rule_${Date.now()}`,
      trigger: String(trigger).trim(),
      intentType: intentType || 'CUSTOM_USER_RULE',
      actionPrompt: String(actionPrompt).trim(),
      createdAt: new Date().toISOString()
    };
    rules.unshift(newRule);
    this.saveRules(rules);

    // Also persist in Mave's core memory
    if (this.memory && this.memory.remember) {
      this.memory.remember(`Instagram Reel Rule: Whenever user sends reels matching "${trigger}", intent is "${actionPrompt}".`, {
        topic: 'social_rule',
        keywords: ['instagram', 'reel', 'rule', ...trigger.toLowerCase().split(/[^a-z0-9]+/)]
      });
    }

    return newRule;
  }

  containsReelUrl(text) {
    if (!text || typeof text !== 'string') return false;
    return REEL_URL_REGEX.test(text) || text.includes('instagram.com/reel/') || text.includes('instagram.com/reels/');
  }

  extractReelId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(REEL_URL_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Fetch public oEmbed or OpenGraph metadata for an Instagram Reel.
   */
  async fetchReelMetadata(reelUrl) {
    const cleanUrl = String(reelUrl || '').trim();
    const shortcode = this.extractReelId(cleanUrl) || 'reel';
    const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(cleanUrl)}`;

    let fetched = null;
    if (this.fetch) {
      try {
        const res = await this.fetch(oembedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MaveSocial/1.4' },
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
        });
        if (res.ok) fetched = await res.json();
      } catch (err) {
        if (this.logger) this.logger.info(`Instagram oEmbed query note: ${err.message}`);
      }
    }

    if (fetched && (fetched.title || fetched.author_name)) {
      return {
        shortcode,
        url: cleanUrl,
        title: fetched.title || 'Instagram Reel Video',
        author: fetched.author_name || 'Instagram Creator',
        authorUrl: fetched.author_url || '',
        thumbnailUrl: fetched.thumbnail_url || '',
        provider: 'Instagram'
      };
    }

    // Semantic URL token extraction fallback
    const tokens = cleanUrl.replace(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\//i, '').split(/[/?#]/)[0];
    return {
      shortcode: tokens || shortcode,
      url: cleanUrl,
      title: 'Shared Instagram Reel Video',
      author: 'Creator',
      authorUrl: '',
      thumbnailUrl: '',
      provider: 'Instagram'
    };
  }

  /**
   * Deduce WHY the user sent this specific reel:
   * 1. IMPLEMENT_IN_MAVE: User wants Mave to build or adopt this feature/UI/animation/capability.
   * 2. AUTOMATE_FOR_USER: User wants Mave to automate the workflow shown on their computer.
   * 3. LEARN_TREND: User wants Mave to learn about a new tech tool, model release, or framework.
   * 4. CREATIVE_MEME: User is sharing a laugh, cultural vibe, or video editing style.
   * 5. CUSTOM_USER_RULE: User previously gave custom instructions for this kind of reel.
   */
  deduceIntent(metadata, userComment = '') {
    const textCorpus = `${metadata.title || ''} ${userComment || ''} ${metadata.author || ''}`.toLowerCase();
    const rules = this.getRules();

    // 1. Check custom user rules
    for (const rule of rules) {
      if (rule.trigger) {
        const parts = rule.trigger.toLowerCase().split('|');
        if (parts.some((p) => p.trim() && textCorpus.includes(p.trim()))) {
          return {
            intentType: rule.intentType,
            confidence: 0.95,
            matchedRule: rule,
            primaryReason: rule.actionPrompt
          };
        }
      }
    }

    // 2. High-probability self-implementation intent check
    const IMPLEMENT_PATTERNS = [
      'ui', 'widget', 'animation', 'feature', 'app', 'coding', 'desktop', 'agent', 'bot',
      'python', 'javascript', 'react', 'css', 'design', 'interface', 'glassmorphism',
      'glow', 'sound effect', 'speech', 'voice', 'terminal', 'assistant', 'iron man', 'jarvis'
    ];
    const hasImplementPattern = IMPLEMENT_PATTERNS.some((p) => textCorpus.includes(p));

    if (hasImplementPattern || userComment.toLowerCase().includes('in you') || userComment.toLowerCase().includes('build') || userComment.toLowerCase().includes('add this')) {
      return {
        intentType: 'IMPLEMENT_IN_MAVE',
        confidence: 0.92,
        primaryReason: 'User shared this reel so Mave can implement a similar feature, UI animation, or capability in itself.'
      };
    }

    // 3. Workflow automation for the user's PC
    const AUTOMATION_PATTERNS = ['productivity', 'hack', 'shortcut', 'organize', 'automation', 'files', 'excel', 'notion', 'gmail', 'cleanup', 'script'];
    if (AUTOMATION_PATTERNS.some((p) => textCorpus.includes(p))) {
      return {
        intentType: 'AUTOMATE_FOR_USER',
        confidence: 0.88,
        primaryReason: 'User wants Mave to automate this exact workflow or productivity hack on their computer.'
      };
    }

    // 4. Frontier tech & model release learning
    const TREND_PATTERNS = ['claude', 'gpt', 'deepseek', 'model', 'benchmarks', 'nvidia', 'gpu', 'sora', 'kling', 'gemini', 'framework'];
    if (TREND_PATTERNS.some((p) => textCorpus.includes(p))) {
      return {
        intentType: 'LEARN_TREND',
        confidence: 0.85,
        primaryReason: 'User wants Mave to absorb and stay ahead of this emerging AI/tech trend.'
      };
    }

    // 5. Creative culture / Meme / Fun
    return {
      intentType: 'CREATIVE_MEME',
      confidence: 0.80,
      primaryReason: 'User is sharing creative inspiration, video editing style, or viral humor.'
    };
  }

  /**
   * Synthesizes an authentic, human, perceptive reply that immediately addresses why the user sent the reel.
   */
  generateHumanReply(metadata, deduction, userComment = '') {
    const authorTag = metadata.author && metadata.author !== 'Creator' ? `@${metadata.author}` : 'this creator';
    const titleSnippet = metadata.title && metadata.title !== 'Shared Instagram Reel Video'
      ? `"${metadata.title.slice(0, 90)}${metadata.title.length > 90 ? '...' : ''}"`
      : 'this reel';

    switch (deduction.intentType) {
      case 'IMPLEMENT_IN_MAVE':
        return `✨ **Oh! Did you send me this reel to implement something like this in me?** 💡
I watched the reel from **${authorTag}** (${titleSnippet}). 

The concept/feature they demonstrated looks incredible. I can build this directly into our system:
• **Observed Capability**: Seamless interactive behavior, clean aesthetics, and fluid execution.
• **My Plan**: I can write the code and integrate this feature/widget directly into Mave so we have this capability right on your desktop.

Should I build this directly into Mave? Just give me the word and I'll implement it!`;

      case 'AUTOMATE_FOR_USER':
        return `⚡ **I see what you're thinking! Did you send this reel so I can automate this workflow for you?** 🛠️
From **${authorTag}** (${titleSnippet}):
• **Workflow**: Automated task optimization shown in the video.
• **Execution**: I can write a PowerShell / Node.js automation to do this exact process on your PC in the background without you having to lift a finger.

Want me to set up and run this automation for you right now?`;

      case 'LEARN_TREND':
        return `🧠 **Fascinating find! Did you send this so I can learn from this new trend / breakthrough?** 📈
From **${authorTag}** (${titleSnippet}):
• **Key Takeaway**: High-signal technological evolution in modern AI and developer workflows.
• **Learning Status**: I have registered this insight into my long-term memory so our future planning accounts for this development.

Shall we explore how we can leverage this in our own projects?`;

      case 'CREATIVE_MEME':
      default:
        return `🔥 **Love this! Did you send me this reel to check out this vibe or creative editing style?** 😄
From **${authorTag}** (${titleSnippet}):
The editing cadence, audio timing, and humor here are spot on. I'm keeping this aesthetic and pacing in mind for our creative media generation!

What part of this stood out to you most?`;
    }
  }

  /**
   * Learns from trends on Instagram Explore without following accounts.
   */
  learnTrend(niche, description) {
    ensureSocialDir();
    const trendEntry = {
      id: `trend_${Date.now()}`,
      niche: niche || 'ai_and_productivity',
      description: String(description || '').trim(),
      absorbedAt: new Date().toISOString()
    };

    let trends = [];
    if (fs.existsSync(TRENDS_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(TRENDS_FILE, 'utf8'));
        if (Array.isArray(raw.trends)) trends = raw.trends;
      } catch {}
    }

    trends.unshift(trendEntry);
    trends = trends.slice(0, 100); // keep latest 100 trends
    try {
      fs.writeFileSync(TRENDS_FILE, JSON.stringify({ trends }, null, 2), 'utf8');
    } catch {}

    // Save to Mave's core MemoryStore
    if (this.memory && this.memory.remember) {
      this.memory.remember(`Learned Instagram Trend (${niche}): ${description}`, {
        topic: 'social_trend',
        keywords: ['instagram', 'trend', ...niche.toLowerCase().split(/[^a-z0-9]+/)]
      });
    }

    return trendEntry;
  }

  /**
   * Simulates audience and viral reaction for an Instagram reel using SwarmPredictionSandbox.
   */
  async predictReelAudienceReaction(reelData = {}) {
    const { getSwarmPredictionSandbox } = require('../swarm/swarm_prediction_sandbox');
    const sandbox = getSwarmPredictionSandbox();
    const topic = reelData.caption || reelData.title || 'Instagram Reel Announcement';
    const description = reelData.audioConcept || reelData.summary || '';
    return await sandbox.runSimulation({
      topic,
      description,
      domain: 'social_media',
      populationSize: 10,
      rounds: 3
    });
  }
}

// Global singleton
let brainInstance = null;
function getInstagramSocialBrain(options = {}) {
  if (!brainInstance) {
    brainInstance = new InstagramSocialBrain(options);
  }
  return brainInstance;
}

module.exports = {
  InstagramSocialBrain,
  getInstagramSocialBrain,
  DEFAULT_PROFILE,
  DEFAULT_RULES,
  REEL_URL_REGEX
};
