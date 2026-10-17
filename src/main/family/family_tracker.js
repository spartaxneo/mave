'use strict';
// Family Habit Tracker, Multi-Device Manager & Adaptive Learning Engine for Mave.
// Stores all family members' connected devices, daily conversations/talks, habits,
// personal information, and continuous learnings with strict profile isolation.
// Employs in-memory caching and debounced disk persistence for <1ms zero-latency access
// without blocking UI frame rates or local AI inference.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultFamilyFilePath() {
  const base = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(base, 'family', 'family_profiles.json');
}

const DEFAULT_MEMBERS = [
  {
    id: 'admin',
    name: 'Parent (Owner)',
    relationship: 'Self / Parent',
    role: 'admin',
    birthday: '1988-08-15',
    info: {
      occupation: 'Lead Systems Architect & Tech Lead',
      dietary: 'Vegetarian, prefers oat milk in espresso',
      hobbies: ['AI development', 'Robotics', 'Acoustics', 'Running'],
    },
    devices: [
      { id: 'dev_pc_1', name: 'Primary Workstation PC', type: 'pc', os: 'Windows 11 Pro', ip: '192.168.1.100', lastActive: Date.now() },
      { id: 'dev_iphone_1', name: 'Personal iPhone 15 Pro', type: 'phone', os: 'iOS 18', ip: '192.168.1.105', lastActive: Date.now() - 5 * 60 * 1000 },
    ],
    habits: [
      { id: 'h1', name: 'Morning Espresso', timeWindow: '07:00 - 08:30', description: 'Double espresso with oat milk before starting work', frequency: 'Daily' },
      { id: 'h2', name: 'Deep Focus Coding', timeWindow: '09:00 - 13:00', description: 'Requires zero interruption, dark mode, terminal open', frequency: 'Weekdays' },
      { id: 'h3', name: 'Evening Walk & Wind-Down', timeWindow: '19:30 - 20:30', description: '30-minute walk, reviews day accomplishments', frequency: 'Daily' },
    ],
    dailyTalks: [
      {
        id: 'talk_1',
        timestamp: Date.now() - 3 * 3600 * 1000,
        summary: 'Discussed architectural scaling for local AI inference and GPU VRAM optimization.',
        topics: ['architecture', 'GPU', 'performance'],
        mood: 'focused',
      },
    ],
    learnings: [
      { id: 'l1', fact: 'Prefers ultra-concise technical responses with zero fluff.', learnedAt: Date.now() - 86400 * 1000 },
      { id: 'l2', fact: 'Uses keyboard shortcuts extensively; prefers CLI commands over mouse navigation.', learnedAt: Date.now() - 43200 * 1000 },
    ],
  },
  {
    id: 'spouse',
    name: 'Sarah (Partner)',
    relationship: 'Spouse',
    role: 'standard',
    birthday: '1990-04-22',
    info: {
      occupation: 'Product Designer',
      dietary: 'Gluten-free, matcha green tea',
      hobbies: ['Interior design', 'Gardening', 'Yoga', 'Photography'],
    },
    devices: [
      { id: 'dev_mac_1', name: 'MacBook Air M2', type: 'laptop', os: 'macOS Sonoma', ip: '192.168.1.108', lastActive: Date.now() - 30 * 60 * 1000 },
      { id: 'dev_phone_2', name: 'Pixel 8 Phone', type: 'phone', os: 'Android 15', ip: '192.168.1.112', lastActive: Date.now() - 15 * 60 * 1000 },
    ],
    habits: [
      { id: 'h4', name: 'Morning Yoga', timeWindow: '06:30 - 07:15', description: '20-minute vinyasa flow with ambient calming music', frequency: 'Daily' },
      { id: 'h5', name: 'Plant Care Check', timeWindow: '16:00 - 16:30', description: 'Inspects Monstera and indoor balcony plants for watering', frequency: 'Every 2 days' },
    ],
    dailyTalks: [
      {
        id: 'talk_2',
        timestamp: Date.now() - 6 * 3600 * 1000,
        summary: 'Asked about weekly weather forecast and optimal plant watering schedule.',
        topics: ['plants', 'weather', 'calendar'],
        mood: 'pleasant',
      },
    ],
    learnings: [
      { id: 'l3', fact: 'Appreciates warm, aesthetic visual summaries and polite morning greetings.', learnedAt: Date.now() - 86400 * 2000 },
    ],
  },
  {
    id: 'kid',
    name: 'Alex (Kid)',
    relationship: 'Child',
    role: 'safe_kid',
    birthday: '2016-09-10',
    info: {
      grade: '5th Grade Elementary',
      favoriteSubjects: ['Robotics', 'Space Science', 'Math Puzzles'],
      allergies: 'Mild peanut sensitivity',
    },
    devices: [
      { id: 'dev_ipad_1', name: 'Alex School iPad', type: 'tablet', os: 'iPadOS 17', ip: '192.168.1.120', lastActive: Date.now() - 45 * 60 * 1000 },
    ],
    habits: [
      { id: 'h6', name: 'After-School Homework', timeWindow: '16:00 - 17:30', description: 'Completes math assignments and science reading', frequency: 'Weekdays' },
      { id: 'h7', name: 'Bedtime Reading & Curfew', timeWindow: '20:30 - 21:00', description: 'Bedtime story with Mave companion, devices off at 9 PM', frequency: 'Daily' },
    ],
    dailyTalks: [
      {
        id: 'talk_3',
        timestamp: Date.now() - 2 * 3600 * 1000,
        summary: 'Asked how gravity works around black holes and worked through two fraction problems.',
        topics: ['astronomy', 'fractions', 'homework'],
        mood: 'curious',
      },
    ],
    learnings: [
      { id: 'l4', fact: 'Learns best when math problems are explained using pizza or spaceship analogies.', learnedAt: Date.now() - 86400 * 1000 },
      { id: 'l5', fact: 'Loves hearing space facts at bedtime.', learnedAt: Date.now() - 43200 * 1000 },
    ],
  },
];

class FamilyHabitTracker {
  constructor(filePath = defaultFamilyFilePath()) {
    this.filePath = filePath;
    this.members = new Map();
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.members)) {
          for (const m of data.members) {
            if (m && m.id) this.members.set(m.id, m);
          }
          return;
        }
      }
    } catch {}

    // Initialize defaults
    for (const m of DEFAULT_MEMBERS) {
      this.members.set(m.id, JSON.parse(JSON.stringify(m)));
    }
    this.saveSync();
  }

  saveSync() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload = {
        updatedAt: Date.now(),
        members: [...this.members.values()],
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {}
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSync();
    }, 1500);
  }

  getMember(userId) {
    const id = String(userId || 'admin').toLowerCase().trim();
    return this.members.get(id) || null;
  }

  listMembers() {
    return [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      relationship: m.relationship,
      role: m.role,
      deviceCount: (m.devices || []).length,
      habitCount: (m.habits || []).length,
      talksCount: (m.dailyTalks || []).length,
      learningsCount: (m.learnings || []).length,
    }));
  }

  addMember({ id, name, relationship, role = 'standard', info = {} }) {
    if (!name) throw new Error('Member name is required.');
    const memberId = (id || name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')).trim();
    if (this.members.has(memberId)) throw new Error(`Member with ID "${memberId}" already exists.`);

    const newMember = {
      id: memberId,
      name: String(name).trim(),
      relationship: String(relationship || 'Family Member').trim(),
      role: String(role).trim(),
      info: { ...info },
      devices: [],
      habits: [],
      dailyTalks: [],
      learnings: [],
    };

    this.members.set(memberId, newMember);
    this.scheduleSave();
    return newMember;
  }

  /**
   * Register or update a device for a family member.
   */
  registerDevice(userId, { name, type = 'phone', os = 'Unknown', ip = 'LAN' }) {
    const member = this.getMember(userId);
    if (!member) throw new Error(`Family member "${userId}" not found.`);

    if (!member.devices) member.devices = [];
    const deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const dev = {
      id: deviceId,
      name: String(name).trim(),
      type: String(type).toLowerCase(),
      os: String(os),
      ip: String(ip),
      lastActive: Date.now(),
    };

    member.devices.push(dev);
    this.scheduleSave();
    return dev;
  }

  /**
   * Log a daily talk / conversation interaction.
   */
  logDailyTalk(userId, { summary, topics = [], mood = 'neutral' }) {
    const member = this.getMember(userId);
    if (!member) return null;

    if (!member.dailyTalks) member.dailyTalks = [];
    const talk = {
      id: `talk_${Date.now()}`,
      timestamp: Date.now(),
      summary: String(summary || '').trim(),
      topics: Array.isArray(topics) ? topics : [String(topics)],
      mood: String(mood),
    };

    member.dailyTalks.unshift(talk);
    if (member.dailyTalks.length > 100) member.dailyTalks.pop();

    this.scheduleSave();
    return talk;
  }

  /**
   * Record a habit or routine for a family member.
   */
  recordHabit(userId, { name, timeWindow, description, frequency = 'Daily' }) {
    const member = this.getMember(userId);
    if (!member) throw new Error(`Family member "${userId}" not found.`);

    if (!member.habits) member.habits = [];
    const existingIndex = member.habits.findIndex((h) => h.name.toLowerCase() === String(name).toLowerCase().trim());

    if (existingIndex >= 0) {
      member.habits[existingIndex] = {
        ...member.habits[existingIndex],
        timeWindow: timeWindow || member.habits[existingIndex].timeWindow,
        description: description || member.habits[existingIndex].description,
        frequency: frequency || member.habits[existingIndex].frequency,
      };
      this.scheduleSave();
      return member.habits[existingIndex];
    }

    const habit = {
      id: `h_${Date.now()}`,
      name: String(name).trim(),
      timeWindow: String(timeWindow || 'Unspecified'),
      description: String(description || ''),
      frequency: String(frequency || 'Daily'),
    };

    member.habits.push(habit);
    this.scheduleSave();
    return habit;
  }

  /**
   * Add a continuous learning or adaptation note.
   */
  recordLearning(userId, factText) {
    const member = this.getMember(userId);
    if (!member) return null;

    if (!member.learnings) member.learnings = [];
    const clean = String(factText || '').trim();
    if (!clean) return null;

    const exists = member.learnings.some((l) => l.fact.toLowerCase() === clean.toLowerCase());
    if (exists) return null;

    const learning = {
      id: `l_${Date.now()}`,
      fact: clean,
      learnedAt: Date.now(),
    };

    member.learnings.push(learning);
    if (member.learnings.length > 50) member.learnings.shift();

    this.scheduleSave();
    return learning;
  }

  /**
   * Continuous learning & adaptive extraction from conversational interactions.
   * Runs in microseconds without impacting latency.
   */
  adaptFromInteraction(userId, userMessage, assistantReply = '') {
    const member = this.getMember(userId);
    if (!member) return [];

    const text = String(userMessage || '').trim();
    if (!text || text.length < 5) return [];

    const lower = text.toLowerCase();
    const adaptations = [];

    // Habit patterns: "I always drink ... in the morning", "I wake up at ...", "I study ... at 4pm"
    const habitMatch = /(?:i always|every (?:morning|day|afternoon|evening)|i usually)\s+([a-zA-Z0-9\s_-]{5,50})/i.exec(text);
    if (habitMatch) {
      const routine = habitMatch[1].trim();
      const habit = this.recordHabit(member.id, {
        name: routine.slice(0, 30),
        timeWindow: 'Learned Daily Routine',
        description: `User routine: "${routine}"`,
        frequency: 'Daily',
      });
      adaptations.push(`Habit adapted: ${habit.name}`);
    }

    // Learning patterns: "explain like ...", "don't show me ...", "i prefer ..."
    const learningMatch = /\b(?:i prefer|explain (?:it )?like|always (?:show|format)|never use)\s+([^.,;!?\n]{4,60})/i.exec(text);
    if (learningMatch) {
      const insight = learningMatch[0].trim();
      this.recordLearning(member.id, insight);
      adaptations.push(`Learned: ${insight}`);
    }

    // Daily talk logging
    if (text.length > 15) {
      this.logDailyTalk(member.id, {
        summary: text.slice(0, 100),
        topics: text.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 4),
        mood: /frustrat|error|bug|broken/i.test(lower) ? 'problem_solving' : /thank|great|love|awesome/i.test(lower) ? 'happy' : 'neutral',
      });
    }

    return adaptations;
  }

  /**
   * Build a detailed profile report for context injection or direct user query.
   */
  getProfileSummary(userId) {
    const member = this.getMember(userId);
    if (!member) return `No profile found for "${userId}".`;

    const devices = (member.devices || []).map((d) => `  - ${d.name} (${d.type.toUpperCase()}, ${d.os})`).join('\n') || '  - None registered';
    const habits = (member.habits || []).map((h) => `  - **${h.name}** [${h.timeWindow}]: ${h.description} (${h.frequency})`).join('\n') || '  - No habits logged yet';
    const talks = (member.dailyTalks || []).slice(0, 3).map((t) => `  - [${new Date(t.timestamp).toLocaleTimeString()}] ${t.summary}`).join('\n') || '  - No recent talks';
    const learnings = (member.learnings || []).slice(0, 4).map((l) => `  - ${l.fact}`).join('\n') || '  - Adapting continuously';

    return `👤 **FAMILY MEMBER PROFILE: ${member.name.toUpperCase()}** (${member.relationship})
• **Role / Tier**: \`${member.role}\`
• **Personal Info**: ${JSON.stringify(member.info || {})}

📱 **Connected Devices**:
${devices}

⏰ **Daily Habits & Routines**:
${habits}

💬 **Recent Daily Talks**:
${talks}

🧠 **Learnings & Continuous Adaptations**:
${learnings}`;
  }
}

let familyTrackerInstance = null;
function getFamilyHabitTracker(customPath = null) {
  if (customPath) return new FamilyHabitTracker(customPath);
  if (!familyTrackerInstance) familyTrackerInstance = new FamilyHabitTracker();
  return familyTrackerInstance;
}

module.exports = {
  FamilyHabitTracker,
  getFamilyHabitTracker,
};
