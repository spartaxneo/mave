'use strict';
// Ambient Acoustic Scene & Safety Audio Intelligence Plugin for Mave.

const { getAcousticSceneAnalyzer } = require('../../acoustic/acoustic_scene_analyzer');

module.exports = [
  {
    name: 'acoustic_classify_sound_event',
    description: 'Classify and log an environmental acoustic safety event (smoke alarm, glass break, doorbell chime, baby crying, water dripping, dog barking).',
    input_schema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          enum: ['smoke_alarm', 'glass_break', 'doorbell_ring', 'baby_crying', 'water_leak', 'dog_barking'],
          description: 'The classified audio signature event.',
        },
        room: { type: 'string', description: 'Room location where sound occurred (e.g. "Kitchen", "Living Room", "Nursery").' },
        confidence: { type: 'number', description: 'Confidence score (0.0 to 1.0).' },
      },
      required: ['event_type'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const analyzer = getAcousticSceneAnalyzer();
      ctx.log('info', `Acoustic Intelligence: Processing event ${input.event_type} in ${input.room || 'Living Area'}...`);

      const evt = analyzer.classifyAcousticEvent({
        eventType: input.event_type,
        room: input.room || 'Living Area',
        confidence: input.confidence,
      });

      return `🔊 **ACOUSTIC EVENT RECORDED**:
• **Event**: **${evt.label}**
• **Severity**: \`${evt.severity.toUpperCase()}\`
• **Room**: **${evt.room}**
• **Confidence**: ${Math.round(evt.confidence * 100)}%
• **Alert**: ${evt.alertMessage}
• **Action Protocol**: ${evt.actionRequired}`;
    },
  },

  {
    name: 'acoustic_get_safety_status',
    description: 'Audit the household acoustic environment for active smoke alarms, intrusion sounds, or water leaks.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const analyzer = getAcousticSceneAnalyzer();
      const status = analyzer.getActiveSafetyStatus();

      return `🛡️ **HOUSEHOLD ACOUSTIC SAFETY AUDIT**:
• **Status**: \`${status.status.toUpperCase()}\`
• **Active Critical Signals**: **${status.activeAlerts}**
• **Assessment**: ${status.message}`;
    },
  },

  {
    name: 'acoustic_list_recent_events',
    description: 'List recent environmental acoustic events detected by ambient microphone nodes.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of events to list (default: 10).' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const analyzer = getAcousticSceneAnalyzer();
      const list = analyzer.getRecentEvents(Number(input.limit) || 10);

      if (!list.length) {
        return '🎧 **ACOUSTIC EVENT LOG**: No acoustic safety events recorded recently.';
      }

      const rows = list.map((e) => `• [${new Date(e.timestamp).toLocaleTimeString()}] **${e.label}** in ${e.room} (\`${e.severity}\`, ${Math.round(e.confidence * 100)}%)`).join('\n');

      return `🎧 **RECENT ACOUSTIC EVENTS (${list.length})**:\n\n${rows}`;
    },
  },
];
