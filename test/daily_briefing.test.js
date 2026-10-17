'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ExecutiveDailyBriefing } = require('../src/main/executive/daily_briefing');
const dailyBriefingPlugin = require('../src/main/plugins/builtin/daily_briefing');

test('ExecutiveDailyBriefing aggregates multi-domain telemetry into executive summary and audio monologue', () => {
  const briefing = new ExecutiveDailyBriefing({ defaultUserName: 'Alex' });
  const result = briefing.generateBriefing({
    userName: 'Alex',
    healthMetrics: { sleepScore: 89, restingHeartRate: 58 },
    weather: { condition: 'Partly Cloudy', tempC: 20, rainChance: 10, uvIndex: 5 },
    calendarEvents: [
      { title: 'Board Meeting', time: '09:00 AM' },
      { title: 'Engineering Review', time: '01:30 PM' }
    ],
    vehicleStatus: { model: 'Rivian R1T', level: 85, rangeKm: 420, tiresOk: true },
    energyStatus: { batteryStoragePct: 92, solarForecastKWh: 28.4, gridExportActive: true },
    financialAlerts: [],
    botanicalReminders: [{ species: 'Monstera Deliciosa' }]
  });

  assert.equal(result.success, true);
  assert.ok(result.greeting.includes('Alex'));
  assert.ok(result.audioScript.includes('sleep recovery score is 89'));
  assert.ok(result.audioScript.includes('Board Meeting at 09:00 AM'));
  assert.ok(/solar forecast is outstanding/i.test(result.audioScript));
  assert.equal(result.priorityActionItems.length, 1);
  assert.ok(result.priorityActionItems[0].includes('Monstera Deliciosa'));
});

test('ExecutiveDailyBriefing flags anomalies in tire pressure, low sleep, and weather in action items', () => {
  const briefing = new ExecutiveDailyBriefing();
  const result = briefing.generateBriefing({
    userName: 'Sarah',
    healthMetrics: { sleepScore: 54 },
    weather: { condition: 'Thunderstorms', tempC: 16, rainChance: 85 },
    vehicleStatus: { model: 'BMW i4', level: 18, tiresOk: false },
    financialAlerts: [{ severity: 'CRITICAL', title: 'Unusual recurring debit flagged: $450' }]
  });

  assert.equal(result.success, true);
  assert.ok(result.priorityActionItems.some(item => item.includes('Tire pressure anomaly')));
  assert.ok(result.priorityActionItems.some(item => item.includes('restorative rest')));
  assert.ok(result.priorityActionItems.some(item => item.includes('umbrella')));
  assert.ok(result.priorityActionItems.some(item => item.includes('Unusual recurring debit flagged')));
});

test('Daily Briefing builtin plugin tools run properly', async () => {
  const generateTool = dailyBriefingPlugin.find(t => t.name === 'executive_generate_daily_briefing');
  const audioTool = dailyBriefingPlugin.find(t => t.name === 'executive_get_morning_audio_script');

  assert.ok(generateTool);
  assert.ok(audioTool);

  const mockCtx = { log: () => {} };
  const genOutput = await generateTool.run({
    user_name: 'Commander',
    calendar_events: [{ title: 'Launch Meeting', time: '10:00 AM' }],
    health_metrics: { sleepScore: 95 }
  }, mockCtx);

  assert.ok(genOutput.includes('COMMANDER'));
  assert.ok(genOutput.includes('Audio Monologue (TTS)'));

  const audioOutput = await audioTool.run({ user_name: 'Commander' }, mockCtx);
  assert.ok(typeof audioOutput === 'string');
  assert.ok(audioOutput.includes('Commander'));
  assert.ok(audioOutput.includes('All subsystems are nominal'));
});
