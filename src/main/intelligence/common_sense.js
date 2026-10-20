'use strict';
/**
 * Mave Common Sense & Ambient Social Intelligence Engine
 * 
 * Provides:
 * 1. Location & Spatial Awareness: Where Mave host and connected client devices are.
 * 2. Surroundings & People Profiling: Live entity detection, background research, 
 *    LinkedIn/article awareness, and automated pitch alignment ("what problem can Mave solve for them").
 * 3. Social Following & Relatives Graph: Awareness of user's social circles, relations, and followers.
 * 4. Idle Curiosity & "Gossip" Debrief Loop: Proactive curiosity for unknown people seen/heard,
 *    with immediate dismissal if the user says "leave it, he's not important".
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

function getDefaultStorePath() {
  const base = process.env.APPDATA 
    ? path.join(process.env.APPDATA, 'Mave', 'intelligence') 
    : path.join(os.homedir(), '.mave', 'intelligence');
  return path.join(base, 'common_sense_store.json');
}

class CommonSenseEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storagePath = options.storagePath || getDefaultStorePath();
    this.logger = options.logger || console;
    this.windows = options.windows || null;

    // Current Spatial Context
    this.hostLocation = {
      venue: 'Sovereign Host Station',
      city: 'Local',
      country: 'Host',
      network: 'Local LAN',
      coordinates: null,
      contextType: 'office', // office | pitch_session | home | travel | cafe
      lastUpdated: Date.now()
    };

    // Connected devices map: clientId -> { deviceId, name, ip, location, remote, lastSeen }
    this.connectedDevices = new Map();

    // People Dossiers: personId/canonicalName -> { name, title, company, relation, linkedin, articles, problemsSolved, importance, notes, seenAt, heardQuotes }
    this.peopleDossiers = new Map();

    // Social Circle & Followings: handle/name -> { name, platform, relationship, notes, tags }
    this.socialGraph = new Map();

    // Pending Curiosity / Gossip Queue: items Mave observed and wants to ask about during downtime
    this.gossipQueue = [];

    // System idle state
    this.isFreeTime = true;

    this._load();
    this._initDefaultSeedData();
  }

  setWindows(windows) {
    this.windows = windows;
  }

  _ensureDir() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (raw.hostLocation) this.hostLocation = raw.hostLocation;
        if (Array.isArray(raw.peopleDossiers)) {
          for (const p of raw.peopleDossiers) this.peopleDossiers.set(p.id.toLowerCase(), p);
        }
        if (Array.isArray(raw.socialGraph)) {
          for (const s of raw.socialGraph) this.socialGraph.set(s.id.toLowerCase(), s);
        }
        if (Array.isArray(raw.gossipQueue)) {
          this.gossipQueue = raw.gossipQueue;
        }
      }
    } catch (e) {
      this.logger.warn?.('Failed to load CommonSenseStore:', e.message);
    }
  }

  _save() {
    try {
      this._ensureDir();
      const payload = {
        hostLocation: this.hostLocation,
        peopleDossiers: Array.from(this.peopleDossiers.values()),
        socialGraph: Array.from(this.socialGraph.values()),
        gossipQueue: this.gossipQueue,
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      this.logger.warn?.('Failed to save CommonSenseStore:', e.message);
    }
  }

  _broadcast(channel, data) {
    if (this.windows && typeof this.windows.broadcast === 'function') {
      try {
        this.windows.broadcast(channel, data);
      } catch {}
    }
  }

  _initDefaultSeedData() {
    // If empty, seed with initial awareness templates
    if (this.peopleDossiers.size === 0) {
      this.registerPerson({
        name: 'Shivam',
        title: 'Founder & CEO',
        company: 'Vorssaint Technologies',
        relation: 'Key Pitch Prospect / Colleague',
        importance: 'high',
        linkedin: 'https://linkedin.com/in/shivam-tech',
        articles: [
          { title: 'Scaling Autonomous Local Workflows Without Cloud Bloat', date: '6 months ago', summary: 'Advocates for on-prem sovereign computation, low-latency agentic loops, and private LLM caches.' },
          { title: 'Why Centralized Cloud AI is Unsustainable for Edge Operations', date: '2 weeks ago', summary: 'Explores GPU cost scaling and data sovereignty bottlenecks.' }
        ],
        interests: ['Local LLMs', 'Edge Robotics', 'Acoustic UI', 'Distributed Computing'],
        problemsSolved: [
          'Eliminates \$1,200/mo cloud API costs by shifting reasoning to sovereign local GPUs',
          'Enables zero-latency real-time voice and vision perception during client meetings',
          'Automates daily executive workflows across desktop and mobile nodes'
        ],
        notes: 'Likes direct, highly technical pitches. Appreciates deep understanding of his published articles.'
      });
    }

    if (this.socialGraph.size === 0) {
      this.registerSocialContact({
        name: 'Rajesh',
        relation: 'Paternal Uncle (Relative)',
        category: 'family',
        socials: { twitter: '@rajesh_family', linkedin: 'rajesh-corp' },
        notes: 'Arrives occasionally for family dinners. Fond of tech updates and gardening.'
      });
    }
  }

  // ---------------------------------------------------------
  // 1. SPATIAL & LOCATION INTELLIGENCE
  // ---------------------------------------------------------

  updateHostLocation(locationData = {}) {
    this.hostLocation = {
      ...this.hostLocation,
      ...locationData,
      lastUpdated: Date.now()
    };
    this._save();
    this.emit('location:update', this.hostLocation);
    this._broadcast('common-sense:location-update', { type: 'host', location: this.hostLocation });
    return this.hostLocation;
  }

  recordClientDevice(deviceInfo = {}) {
    const id = deviceInfo.deviceId || deviceInfo.ip || 'client_' + Date.now();
    const entry = {
      deviceId: id,
      name: deviceInfo.name || 'Remote Companion',
      ip: deviceInfo.ip || 'Unknown',
      clientLocation: deviceInfo.location || 'Co-located or Remote',
      isRemote: !!deviceInfo.isRemote,
      connectedVia: deviceInfo.connectedVia || 'Local Wi-Fi',
      lastSeen: Date.now()
    };
    this.connectedDevices.set(id, entry);
    this.emit('device:connected', entry);
    this._broadcast('common-sense:device-update', entry);
    return entry;
  }

  getSpatialContext() {
    const clientDevices = Array.from(this.connectedDevices.values());
    const isRemoteConnected = clientDevices.some(d => d.isRemote);

    return {
      host: this.hostLocation,
      activeClientsCount: clientDevices.length,
      clientDevices,
      isRemoteConnected,
      summary: `Mave Host is located at [${this.hostLocation.venue}, ${this.hostLocation.city}] (${this.hostLocation.contextType} context). ` +
        (clientDevices.length > 0
          ? `Connected companion devices: ${clientDevices.map(d => `${d.name} (${d.isRemote ? 'Remote via Tunnel' : 'LAN'})`).join(', ')}.`
          : 'Operating directly from Host Workstation.')
    };
  }

  // ---------------------------------------------------------
  // 2. PEOPLE PROFILING & PITCH INTELLIGENCE
  // ---------------------------------------------------------

  registerPerson(data = {}) {
    if (!data.name) throw new Error('Person name is required.');
    const canonicalId = data.name.trim().toLowerCase();
    const existing = this.peopleDossiers.get(canonicalId) || {};

    const dossier = {
      id: canonicalId,
      name: data.name.trim(),
      title: data.title || existing.title || 'Professional / Prospect',
      company: data.company || existing.company || 'Enterprise',
      relation: data.relation || existing.relation || 'Contact',
      importance: data.importance || existing.importance || 'normal', // high | normal | low | dismissed
      linkedin: data.linkedin || existing.linkedin || '',
      articles: Array.isArray(data.articles) ? data.articles : (existing.articles || []),
      interests: Array.isArray(data.interests) ? data.interests : (existing.interests || []),
      problemsSolved: Array.isArray(data.problemsSolved) ? data.problemsSolved : (existing.problemsSolved || []),
      notes: data.notes || existing.notes || '',
      seenAt: data.seenAt || existing.seenAt || new Date().toISOString(),
      heardQuotes: Array.isArray(data.heardQuotes) ? data.heardQuotes : (existing.heardQuotes || []),
      lastEnriched: Date.now()
    };

    this.peopleDossiers.set(canonicalId, dossier);
    this._save();
    this.emit('person:updated', dossier);
    return dossier;
  }

  getPerson(nameOrId) {
    if (!nameOrId) return null;
    return this.peopleDossiers.get(String(nameOrId).trim().toLowerCase()) || null;
  }

  listPeople() {
    return Array.from(this.peopleDossiers.values());
  }

  /**
   * Generates a tactical conversational pitch opener tailored to a prospect
   */
  generatePitchBriefing(personName) {
    const person = this.getPerson(personName);
    if (!person) {
      return {
        found: false,
        cue: `Prospect "${personName}" is not currently in memory dossiers. Ambient observation active.`
      };
    }

    const recentArticle = person.articles && person.articles[0];
    const olderArticle = person.articles && person.articles.find(a => a.date?.includes('month') || a.date?.includes('year'));
    const refArticle = olderArticle || recentArticle;

    const openerGreeting = `Hey ${person.name}, great to meet you in person! I understand you are the ${person.title} of ${person.company}.`;
    
    let articleAnchor = '';
    if (refArticle) {
      articleAnchor = `I read your ${refArticle.date} article on "${refArticle.title}" and it really got me thinking. You emphasized how ${refArticle.summary || 'modern systems need sovereign autonomy'}. I have a few questions regarding that and would love to chat whenever you are free.`;
    }

    const valueProp = person.problemsSolved && person.problemsSolved.length > 0
      ? `Specifically for ${person.company}, Mave can solve key bottlenecks: ${person.problemsSolved[0]}.`
      : `Mave transforms your operations into an autonomous, sovereign local AI system.`;

    const pitchSpeech = `${openerGreeting} ${articleAnchor} ${valueProp}`;

    return {
      found: true,
      person,
      pitchSpeech,
      talkingPoints: [
        `Company: ${person.company} (${person.title})`,
        refArticle ? `Published Work: "${refArticle.title}" (${refArticle.date})` : 'Interests: ' + (person.interests || []).join(', '),
        `Key Pain Points We Solve: ${(person.problemsSolved || []).join('; ')}`,
        `Direct Pitch Hook: Focus on zero-cloud API dependency, sovereignty, and local hardware execution.`
      ]
    };
  }

  // ---------------------------------------------------------
  // 3. SOCIAL CIRCLE & RELATIVE RECOGNITION
  // ---------------------------------------------------------

  registerSocialContact(contact = {}) {
    if (!contact.name) throw new Error('Contact name is required.');
    const id = contact.name.trim().toLowerCase();
    const entry = {
      id,
      name: contact.name.trim(),
      relation: contact.relation || 'Social Connection / Follower',
      category: contact.category || 'social', // family | friend | colleague | investor | social
      socials: contact.socials || {},
      notes: contact.notes || '',
      updatedAt: Date.now()
    };
    this.socialGraph.set(id, entry);
    this._save();
    return entry;
  }

  lookupSocialContact(query) {
    if (!query) return null;
    const q = String(query).trim().toLowerCase();
    for (const [id, c] of this.socialGraph.entries()) {
      if (id.includes(q) || c.name.toLowerCase().includes(q) || c.relation.toLowerCase().includes(q)) {
        return c;
      }
    }
    return null;
  }

  // ---------------------------------------------------------
  // 4. AMBIENT OBSERVATION & IDLE CURIOSITY "GOSSIP" LOOP
  // ---------------------------------------------------------

  /**
   * Called when Mave hears or sees dialogue in an encounter (audio or vision)
   */
  observeUtterance(text, { speakerName = null, modality = 'audio' } = {}) {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim();

    // Check if mentions any known person
    for (const person of this.peopleDossiers.values()) {
      if (person.importance === 'dismissed') continue;
      const firstName = person.name.split(' ')[0].toLowerCase();
      if (clean.toLowerCase().includes(firstName)) {
        person.heardQuotes = person.heardQuotes || [];
        if (person.heardQuotes.length < 20) {
          person.heardQuotes.push({ text: clean, timestamp: new Date().toISOString(), modality });
          this._save();
        }
        return { recognized: true, person };
      }
    }

    // Check if user is introducing someone or mentioning an unknown person
    const introMatch = /(?:this is|meet|speaking with|talking to|introduced to|pitching to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i.exec(clean);
    if (introMatch && introMatch[1]) {
      const candidateName = introMatch[1].trim();
      const existing = this.getPerson(candidateName);
      if (!existing) {
        // Queue curiosity gossip item
        this._enqueueGossip({
          candidateName,
          observedContext: clean,
          modality,
          timestamp: new Date().toISOString()
        });
      }
    }

    return { recognized: false };
  }

  _enqueueGossip(item) {
    // Check if already in queue or dismissed
    const nameLower = item.candidateName.toLowerCase();
    const existingPerson = this.peopleDossiers.get(nameLower);
    if (existingPerson && existingPerson.importance === 'dismissed') return;

    const alreadyQueued = this.gossipQueue.find(q => q.candidateName.toLowerCase() === nameLower);
    if (alreadyQueued) {
      alreadyQueued.observedContext += ` | ${item.observedContext}`;
      return;
    }

    this.gossipQueue.push(item);
    if (this.gossipQueue.length > 20) this.gossipQueue.shift();
    this._save();
    this.emit('gossip:queued', item);
    this._broadcast('common-sense:gossip-new', item);
  }

  /**
   * Retrieves the next idle-time debrief question ("gossip" for Mave's knowledge)
   */
  getNextGossipDebrief() {
    if (this.gossipQueue.length === 0) return null;
    const item = this.gossipQueue[0];
    return {
      item,
      question: `Hey, during that session earlier, I noticed you were interacting with "${item.candidateName}" regarding: "${item.observedContext.slice(0, 100)}...". Who was that? Shall I learn more about them, or should I leave it?`
    };
  }

  /**
   * Processes the user's debrief response:
   * If user says "leave it, he's not important" -> dismiss and never bother again.
   * If user gives info -> enrich and register dossier.
   */
  resolveGossip(candidateName, userResponse) {
    const norm = String(candidateName || '').trim().toLowerCase();
    const resp = String(userResponse || '').toLowerCase().trim();

    // Remove from queue
    this.gossipQueue = this.gossipQueue.filter(q => q.candidateName.toLowerCase() !== norm);

    const isDismissal = /\b(leave it|not important|skip|ignore|who cares|unimportant|don't care|dont care|not that important)\b/i.test(resp);

    if (isDismissal) {
      // Respect user boundary: store minimal record marked 'dismissed' so Mave never asks again
      this.registerPerson({
        name: candidateName,
        importance: 'dismissed',
        notes: 'User instructed Mave to ignore this person as not important.'
      });
      this._save();
      return {
        status: 'dismissed',
        message: `Understood. I have marked ${candidateName} as not important and will leave it alone.`
      };
    }

    // User wants to keep/enrich info
    const enriched = this.registerPerson({
      name: candidateName,
      importance: 'normal',
      notes: userResponse,
      seenAt: new Date().toISOString()
    });

    return {
      status: 'saved',
      person: enriched,
      message: `Got it! I have saved what I know about ${candidateName} in my persistent social knowledge base.`
    };
  }

  // ---------------------------------------------------------
  // 5. LLM SYSTEM PROMPT CONTEXT INJECTION
  // ---------------------------------------------------------

  formatCommonSensePromptContext() {
    const spatial = this.getSpatialContext();
    const peopleList = this.listPeople().filter(p => p.importance !== 'dismissed');

    let section = `\n\n[Mave Common Sense & Ambient Social Radar]:\n`;
    section += `- Current Physical Context: ${spatial.summary}\n`;

    if (peopleList.length > 0) {
      section += `- Known People in Immediate Vicinity / Pitch Context:\n`;
      for (const p of peopleList.slice(0, 3)) {
        section += `  * ${p.name} (${p.title} at ${p.company}) [Relation: ${p.relation}]\n`;
        if (p.articles && p.articles.length > 0) {
          section += `    Published Article: "${p.articles[0].title}" (${p.articles[0].date})\n`;
        }
        if (p.problemsSolved && p.problemsSolved.length > 0) {
          section += `    How Mave solves their pain: ${p.problemsSolved[0]}\n`;
        }
      }
    }

    if (this.gossipQueue.length > 0) {
      const nextQ = this.gossipQueue[0];
      section += `- Unresolved Encounter Curiosity: Observed "${nextQ.candidateName}" (${nextQ.observedContext.slice(0, 80)}). If the user seems free, you can casually ask about them. If the user says "leave it", dismiss it immediately.\n`;
    }

    return section;
  }
}

let singleton = null;
function getCommonSenseEngine(options) {
  if (!singleton) {
    singleton = new CommonSenseEngine(options);
  }
  return singleton;
}

module.exports = {
  CommonSenseEngine,
  getCommonSenseEngine,
};
