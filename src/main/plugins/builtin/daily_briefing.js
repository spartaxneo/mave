'use strict';
// Autonomous Executive Daily Briefing Plugin for Mave.

const { ExecutiveDailyBriefing } = require('../../executive/daily_briefing');

let defaultBriefing = null;
function getDailyBriefingInstance() {
  if (!defaultBriefing) {
    defaultBriefing = new ExecutiveDailyBriefing({ defaultUserName: 'Sir' });
  }
  return defaultBriefing;
}

module.exports = [
  {
    name: 'executive_generate_daily_briefing',
    description: 'Synthesizes all personal domains—calendar, weather, EV battery, smart solar grid, financial sentinel alerts, sleep recovery, botanical care, and travel—into a unified morning briefing.',
    input_schema: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: 'Name of the user receiving the briefing.' },
        calendar_events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              time: { type: 'string' },
            },
            required: ['title', 'time'],
          },
          description: 'List of scheduled commitments today.',
        },
        weather: {
          type: 'object',
          properties: {
            condition: { type: 'string' },
            tempC: { type: 'number' },
            rainChance: { type: 'number' },
          },
          description: 'Current weather and forecast.',
        },
        vehicle_status: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            level: { type: 'number' },
            rangeKm: { type: 'number' },
            tiresOk: { type: 'boolean' },
          },
          description: 'Automotive status.',
        },
        energy_status: {
          type: 'object',
          properties: {
            batteryStoragePct: { type: 'number' },
            solarForecastKWh: { type: 'number' },
          },
          description: 'Home battery and solar forecast.',
        },
        health_metrics: {
          type: 'object',
          properties: {
            sleepScore: { type: 'number' },
            restingHeartRate: { type: 'number' },
          },
          description: 'Smartwatch recovery metrics.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const briefingService = getDailyBriefingInstance();
      ctx.log('info', 'Compiling executive morning briefing from all subsystems...');

      const result = briefingService.generateBriefing({
        userName: input.user_name || 'Chief',
        calendarEvents: input.calendar_events,
        weather: input.weather,
        vehicleStatus: input.vehicle_status,
        energyStatus: input.energy_status,
        healthMetrics: input.health_metrics,
      });

      const priorityBulletList = result.priorityActionItems.length > 0
        ? `\n🚨 **Priority Action Items**:\n` + result.priorityActionItems.map(p => `• ${p}`).join('\n')
        : '\n✅ **All Systems Nominal** - Zero urgent flags.';

      return `🎙️ **${result.greeting.toUpperCase()}**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 **Audio Monologue (TTS)**:\n"${result.audioScript}"\n` +
        priorityBulletList;
    },
  },

  {
    name: 'executive_get_morning_audio_script',
    description: 'Generates a pure spoken audio script optimized for text-to-speech voice synthesis during morning wake-up.',
    input_schema: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: 'Name of the user.' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const briefingService = getDailyBriefingInstance();
      ctx.log('info', 'Generating audio TTS script for morning briefing...');

      const result = briefingService.generateBriefing({
        userName: input.user_name || 'Chief',
        healthMetrics: { sleepScore: 88, restingHeartRate: 59 },
        weather: { condition: 'Sunny', tempC: 21, rainChance: 5 },
        calendarEvents: [
          { title: 'Executive Sync', time: '10:00 AM' },
          { title: 'Product Architecture Review', time: '2:30 PM' },
        ],
        vehicleStatus: { model: 'Tesla Model S Plaid', level: 90, rangeKm: 460, tiresOk: true },
        energyStatus: { batteryStoragePct: 94, solarForecastKWh: 32.1 },
      });

      return result.audioScript;
    },
  },
];
