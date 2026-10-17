'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApplianceDiagnostics } = require('../src/main/home/appliance_diagnostics');
const appliancePlugin = require('../src/main/plugins/builtin/appliance_diagnostics');

test('ApplianceDiagnostics diagnoses Bosch E15 leak and Samsung 4E supply errors', () => {
  const diag = new ApplianceDiagnostics();

  const bosch = diag.diagnoseErrorCode('Bosch', 'E15');
  assert.equal(bosch.found, true);
  assert.equal(bosch.appliance, 'Dishwasher');
  assert.equal(bosch.severity, 'HIGH');
  assert.ok(bosch.meaning.includes('Leak Protection'));
  assert.ok(bosch.diySteps.some(s => s.includes('tilt dishwasher')));

  const samsung = diag.diagnoseErrorCode('Samsung', '4E');
  assert.equal(samsung.found, true);
  assert.equal(samsung.appliance, 'Washing Machine');
  assert.ok(samsung.meaning.includes('Water supply failure'));
});

test('ApplianceDiagnostics audits preventative maintenance and tracks overdue tasks', () => {
  const diag = new ApplianceDiagnostics();
  // Fixed simulated date in late October 2026:
  // HVAC filter: last done 2026-07-15 -> due ~2026-10-15 (overdue by late October)
  const schedule = diag.checkMaintenanceSchedule(new Date('2026-10-25T00:00:00Z'));

  assert.equal(schedule.totalTracked, 4);
  assert.ok(schedule.dueCount >= 1);
  assert.ok(schedule.overdueTasks.some(t => t.id === 'hvac_filter'));

  // Log completion
  const logRes = diag.logCompletedMaintenance('hvac_filter', new Date('2026-10-25T00:00:00Z'));
  assert.equal(logRes.success, true);

  const updatedSchedule = diag.checkMaintenanceSchedule(new Date('2026-10-25T00:00:00Z'));
  assert.ok(updatedSchedule.upcomingTasks.some(t => t.id === 'hvac_filter'));
});

test('Appliance Diagnostics builtin plugin tools run properly', async () => {
  const diagTool = appliancePlugin.find(t => t.name === 'home_diagnose_appliance_error');
  const maintTool = appliancePlugin.find(t => t.name === 'home_check_preventative_maintenance');
  const logTool = appliancePlugin.find(t => t.name === 'home_log_maintenance_completed');

  assert.ok(diagTool);
  assert.ok(maintTool);
  assert.ok(logTool);

  const mockCtx = { log: () => {} };
  const diagOut = await diagTool.run({ brand: 'LG', error_code: 'OE' }, mockCtx);
  assert.ok(diagOut.includes('APPLIANCE DIAGNOSTIC REPORT'));
  assert.ok(diagOut.includes('Drain error'));

  const maintOut = await maintTool.run({}, mockCtx);
  assert.ok(maintOut.includes('HOUSEHOLD PREVENTATIVE MAINTENANCE AUDIT'));

  const logOut = await logTool.run({ task_id: 'fridge_water' }, mockCtx);
  assert.ok(logOut.includes('MAINTENANCE LOGGED'));
});
