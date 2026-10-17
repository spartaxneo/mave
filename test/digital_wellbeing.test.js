'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DigitalWellbeingGuardian } = require('../src/main/safety/digital_wellbeing');
const wellbeingPlugin = require('../src/main/plugins/builtin/digital_wellbeing');

test('DigitalWellbeingGuardian tracks continuous screen time and triggers ocular and posture alerts', () => {
  const guardian = new DigitalWellbeingGuardian();
  
  // Under 20 min - no alert
  guardian.recordActivity(15);
  let status = guardian.checkErgonomicAlerts();
  assert.equal(status.needsBreak, false);

  // At 25 min - 20-20-20 ocular rest alert
  guardian.recordActivity(10);
  status = guardian.checkErgonomicAlerts();
  assert.equal(status.needsBreak, true);
  assert.ok(status.alerts.some(a => a.type === 'OCULAR_REST_20_20_20'));

  // At 60 min - posture and hamstring stretch alert
  guardian.recordActivity(35);
  status = guardian.checkErgonomicAlerts();
  assert.ok(status.alerts.some(a => a.type === 'POSTURE_AND_STRETCH'));

  // Take a break
  const breakResult = guardian.takeBreak();
  assert.equal(breakResult.success, true);
  assert.equal(breakResult.recoveredMinutes, 60);
  assert.equal(guardian.continuousWorkMinutes, 0);
});

test('DigitalWellbeingGuardian assesses circadian blue-light risk for night-time work', () => {
  const guardian = new DigitalWellbeingGuardian();

  // Test during evening (e.g. 21:00 / 9 PM)
  const eveningDate = new Date('2026-10-17T21:30:00');
  const eveningRisk = guardian.evaluateCircadianRisk(eveningDate, 23);
  assert.equal(eveningRisk.riskLevel, 'MODERATE');
  assert.ok(eveningRisk.recommendations.includes('Night Light'));

  // Test late night (e.g. 23:45 / 11:45 PM)
  const lateDate = new Date('2026-10-17T23:45:00');
  const lateRisk = guardian.evaluateCircadianRisk(lateDate, 23);
  assert.equal(lateRisk.riskLevel, 'HIGH');
  assert.ok(lateRisk.recommendations.includes('2700K'));
});

test('DigitalWellbeingGuardian manages focus sessions and scores flow', () => {
  const guardian = new DigitalWellbeingGuardian();

  const session = guardian.startFocusSession('Refactor Core Engine', 30);
  assert.equal(session.taskGoal, 'Refactor Core Engine');
  assert.equal(session.active, true);

  guardian.recordBlockedDistraction();
  const summary = guardian.completeFocusSession();
  assert.equal(summary.taskGoal, 'Refactor Core Engine');
  assert.equal(summary.distractionsShielded, 1);
  assert.equal(summary.focusQuality, 'STRONG');
});

test('Digital Wellbeing builtin plugin tools run properly', async () => {
  const checkTool = wellbeingPlugin.find(t => t.name === 'wellbeing_check_ergonomic_status');
  const focusTool = wellbeingPlugin.find(t => t.name === 'wellbeing_start_focus_session');

  assert.ok(checkTool);
  assert.ok(focusTool);

  const mockCtx = { log: () => {} };
  const checkOut = await checkTool.run({ active_minutes: 55 }, mockCtx);
  assert.ok(checkOut.includes('DIGITAL ERGONOMIC ALERT'));

  const focusOut = await focusTool.run({ task_goal: 'Sprint Review', duration_minutes: 25 }, mockCtx);
  assert.ok(focusOut.includes('DEEP WORK FOCUS SESSION ACTIVATED'));
});
