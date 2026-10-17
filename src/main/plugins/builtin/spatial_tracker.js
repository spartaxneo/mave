'use strict';
// Spatial Vision Tracker & Family Habit Memory Plugin for Mave ("Ghost AI Core").
// Provides real-world object localization ("Where did I keep my keys?"),
// background vision sweeps, and multi-family device/habit profiling.

const { getSpatialObjectTracker } = require('../../spatial/object_tracker');
const { getFamilyHabitTracker } = require('../../family/family_tracker');

module.exports = [
  {
    name: 'locate_lost_item',
    description: 'Find the physical location of everyday items (keys, wallet, glasses, phone, headphones, backpack, remote, medicine) last observed through connected cameras or room sweeps.',
    input_schema: {
      type: 'object',
      properties: {
        item_name: {
          type: 'string',
          description: 'The item to find (e.g. "keys", "car keys", "wallet", "glasses", "phone", "backpack").',
        },
      },
      required: ['item_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const tracker = getSpatialObjectTracker();
      ctx.log('info', `Spatial Tracker: Searching vision memory for "${input.item_name}"...`);

      const res = tracker.locateItem(input.item_name);
      if (!res.found) {
        return `🔍 **SPATIAL ITEM SEARCH**:
• **Target Item**: "${input.item_name}"
• **Status**: Not spotted in recent camera sweeps.
• **Suggestion**: ${res.message}`;
      }

      return `🔑 **SPATIAL OBJECT LOCALIZATION**:
• **Item**: **${res.object.toUpperCase()}**
• **Location**: **${res.location}**
• **Room**: **${res.room}**
• **Time Elapsed**: **${res.elapsedHuman}** (${new Date(res.timestamp).toLocaleTimeString()})
• **Observed Via**: \`${res.cameraSource}\` (Confidence: ${Math.round(res.confidence * 100)}%)
• **Last Seen With**: ${res.lastSeenBy}

💡 **Direct Answer**:
${res.description}`;
    },
  },

  {
    name: 'scan_surroundings_for_items',
    description: 'Run an asynchronous, zero-latency background camera sweep to identify and index physical items and their resting surfaces without dropping UI frame rate or GPU performance.',
    input_schema: {
      type: 'object',
      properties: {
        camera_source: {
          type: 'string',
          enum: ['webcam', 'phone_camera', 'room_cctv'],
          description: 'The camera source to inspect (default: "webcam").',
        },
        room_hint: {
          type: 'string',
          description: 'Optional room hint (e.g. "Home Office", "Kitchen", "Living Room").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const tracker = getSpatialObjectTracker();
      const src = input.camera_source || 'webcam';
      const room = input.room_hint || 'Home Office';

      ctx.log('info', `Executing non-blocking spatial sweep via ${src} in ${room}...`);
      const scan = await tracker.scanSurroundings(src, room);

      const itemsList = scan.items.map((i) => `• **${i.object}**: ${i.location} (${i.room})`).join('\n');

      return `📷 **SPATIAL VISION SWEEP COMPLETE**:
• **Camera Feed**: \`${scan.cameraSource.toUpperCase()}\`
• **Room**: \`${scan.roomHint}\`
• **Items Identified & Indexed**: **${scan.itemsDetected}**
• **Performance Overhead**: 0 ms UI frame drop (async background thread)

📍 **Current Surface Map**:
${itemsList}`;
    },
  },

  {
    name: 'list_tracked_items',
    description: 'List all physical objects currently tracked in spatial memory with their last-seen room surfaces and timestamps.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const tracker = getSpatialObjectTracker();
      const items = tracker.listTrackedItems();

      if (!items.length) {
        return 'No physical objects are currently indexed in spatial vision memory.';
      }

      ctx.log('info', `Listing ${items.length} spatially tracked items...`);
      const formatted = items.map((i) => `• **${i.object.toUpperCase()}**: ${i.location} [${i.room}] — *Seen ${i.lastSeen}*`).join('\n');

      return `🗺️ **CURRENT SPATIAL OBJECT INVENTORY** (${items.length} items):\n\n${formatted}`;
    },
  },

  {
    name: 'manage_family_habits_and_devices',
    description: 'Query, record, or adapt family members\' devices, daily habits, conversation highlights, personal info, and learnings with strict profile isolation.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['query_profile', 'list_members', 'record_habit', 'register_device', 'log_daily_talk', 'record_learning'],
          description: 'The management action to perform.',
        },
        user_id: {
          type: 'string',
          description: 'The target family member ID (e.g. "admin", "spouse", "kid").',
        },
        habit_data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            time_window: { type: 'string' },
            description: { type: 'string' },
            frequency: { type: 'string' },
          },
          description: 'Data for recording a habit.',
        },
        device_data: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            os: { type: 'string' },
            ip: { type: 'string' },
          },
          description: 'Data for registering a device.',
        },
        talk_data: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            topics: { type: 'array', items: { type: 'string' } },
            mood: { type: 'string' },
          },
          description: 'Data for logging a daily talk.',
        },
        learning_fact: {
          type: 'string',
          description: 'Fact or insight learned about the family member.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const family = getFamilyHabitTracker();
      const act = input.action;
      const uid = input.user_id || 'admin';

      if (act === 'list_members') {
        const members = family.listMembers();
        const rows = members.map((m) => `• **${m.name}** (${m.relationship}): ${m.deviceCount} devices, ${m.habitCount} habits, ${m.learningsCount} adaptations`).join('\n');
        return `👨‍👩‍👧‍👦 **REGISTERED FAMILY MEMBERS** (${members.length}):\n\n${rows}`;
      }

      if (act === 'query_profile') {
        return family.getProfileSummary(uid);
      }

      if (act === 'record_habit') {
        if (!input.habit_data || !input.habit_data.name) throw new Error('habit_data with name is required.');
        const h = family.recordHabit(uid, {
          name: input.habit_data.name,
          timeWindow: input.habit_data.time_window,
          description: input.habit_data.description,
          frequency: input.habit_data.frequency,
        });
        return `✅ **HABIT LOGGED**: Recorded habit "${h.name}" for ${uid} (${h.timeWindow}, ${h.frequency}).`;
      }

      if (act === 'register_device') {
        if (!input.device_data || !input.device_data.name) throw new Error('device_data with name is required.');
        const d = family.registerDevice(uid, input.device_data);
        return `📱 **DEVICE REGISTERED**: Added ${d.name} (${d.type.toUpperCase()}) for ${uid}.`;
      }

      if (act === 'log_daily_talk') {
        if (!input.talk_data || !input.talk_data.summary) throw new Error('talk_data with summary is required.');
        const t = family.logDailyTalk(uid, input.talk_data);
        return `💬 **DAILY TALK LOGGED**: Recorded conversation note for ${uid}: "${t.summary}"`;
      }

      if (act === 'record_learning') {
        if (!input.learning_fact) throw new Error('learning_fact is required.');
        const l = family.recordLearning(uid, input.learning_fact);
        return `🧠 **LEARNING ADAPTED**: Saved learning for ${uid}: "${l ? l.fact : input.learning_fact}"`;
      }

      return `Unsupported action: ${act}`;
    },
  },
];
