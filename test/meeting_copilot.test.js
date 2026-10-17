'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MeetingCopilot } = require('../src/main/meeting/meeting_copilot');
const meetingCopilotPlugin = require('../src/main/plugins/builtin/meeting_copilot');

test('MeetingCopilot sets agenda and warns on pacing delay or significant overrun', () => {
  const copilot = new MeetingCopilot();
  copilot.setAgenda([
    { title: 'Introductions & Financials', minutes: 15 },
    { title: 'Core Architecture', minutes: 25 },
    { title: 'Roadmap Alignment', minutes: 20 }
  ], 60);

  // Topic 0 at 10 mins (within 15m) -> ON_TRACK
  let pacing = copilot.checkPacing(0, 10);
  assert.equal(pacing.pacingStatus, 'ON_TRACK');

  // Topic 0 at 18 mins (+3m) -> SLIGHT_DELAY
  pacing = copilot.checkPacing(0, 18);
  assert.equal(pacing.pacingStatus, 'SLIGHT_DELAY');

  // Topic 0 at 25 mins (+10m) -> SIGNIFICANT_OVERRUN
  pacing = copilot.checkPacing(0, 25);
  assert.equal(pacing.pacingStatus, 'SIGNIFICANT_OVERRUN');
  assert.ok(pacing.whisperCue.includes('Over schedule'));
});

test('MeetingCopilot detects contradictory statements and generates discreet whisper alerts', () => {
  const copilot = new MeetingCopilot();
  copilot.loadReferenceFacts([
    {
      key: 'licensing_fee',
      keywords: 'licensing, royalty, fee, patent',
      contradictionPattern: '15%|20%',
      fact: 'Contractually capped at 8% per master agreement section 4.2',
      source: 'Master Agreement 2025'
    }
  ]);

  // Spoken claim stating 20%
  const check = copilot.factCheckUtterance('They are asking for a 20% licensing royalty on sales.');
  assert.equal(check.flagged, true);
  assert.equal(check.discrepancyCount, 1);
  assert.ok(check.whisper.includes('capped at 8%'));
  assert.ok(check.whisper.includes('Master Agreement 2025'));

  // Normal statement with no contradiction
  const cleanCheck = copilot.factCheckUtterance('We will review the user onboarding telemetry tomorrow.');
  assert.equal(cleanCheck.flagged, false);
});

test('MeetingCopilot extracts live commitments and task owners from speech snippets', () => {
  const copilot = new MeetingCopilot();
  const transcript = [
    { speaker: 'Marcus', text: 'Marcus will deploy the Kubernetes manifests by 3 PM.' },
    { speaker: 'Sarah', text: 'Sarah agreed to draft the marketing announcement.' },
    { speaker: 'Alex', text: 'I think that sounds like a great plan.' }
  ];

  const result = copilot.extractLiveCommitments(transcript);
  assert.equal(result.totalFound, 2);
  assert.equal(result.commitments[0].owner, 'Marcus');
  assert.ok(result.commitments[0].task.includes('Kubernetes'));
  assert.equal(result.commitments[1].owner, 'Sarah');
  assert.ok(result.commitments[1].task.includes('marketing'));
});

test('Meeting Copilot builtin plugin tools run properly', async () => {
  const agendaTool = meetingCopilotPlugin.find(t => t.name === 'meeting_set_agenda_pacing');
  const pacingTool = meetingCopilotPlugin.find(t => t.name === 'meeting_check_live_pacing');
  const factTool = meetingCopilotPlugin.find(t => t.name === 'meeting_whisper_fact_check');

  assert.ok(agendaTool);
  assert.ok(pacingTool);
  assert.ok(factTool);

  const mockCtx = { log: () => {} };
  await agendaTool.run({
    agenda_topics: [{ title: 'Q3 Earnings', minutes: 20 }, { title: 'Q4 Targets', minutes: 20 }],
    total_minutes: 40
  }, mockCtx);

  const pacingOut = await pacingTool.run({ current_topic_index: 0, elapsed_minutes: 12 }, mockCtx);
  assert.ok(pacingOut.includes('LIVE PACING STATUS'));

  const factOut = await factTool.run({ spoken_statement: 'Our Q3 budget was only $40k' }, mockCtx);
  assert.ok(factOut.includes('WHISPER FACT CHECK'));
});
