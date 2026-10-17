'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  FitnessCoach,
  getFitnessCoach,
} = require('../src/main/fitness/fitness_coach');

const fitnessPlugins = require('../src/main/plugins/builtin/fitness_coach');

test('FitnessCoach loads profile and generates adaptive training plan', () => {
  const tmpFile = path.join(os.tmpdir(), `test_fit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const coach = new FitnessCoach(tmpFile);

  const prof = coach.getProfile();
  assert.ok(prof.bodyweightKg > 0);
  assert.ok(prof.equipmentAvailable.length >= 3);

  // Generate workout
  const workout = coach.generateAdaptiveWorkout({ targetDurationMin: 40 });
  assert.ok(workout.sessionTitle);
  assert.ok(workout.exercises.length >= 4);
  assert.ok(workout.recoveryContext);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('FitnessCoach computes macronutrient breakdown accurately', () => {
  const coach = getFitnessCoach();

  const macros = coach.calculateMacros(80, 'muscle_gain');
  assert.equal(macros.proteinGrams, 160);
  assert.ok(macros.targetCalories > 2000);
  assert.ok(macros.carbsGrams > 100);
});

test('Fitness Coach builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(fitnessPlugins));
  assert.equal(fitnessPlugins.length, 3);

  const workoutTool = fitnessPlugins.find((p) => p.name === 'fitness_generate_adaptive_workout');
  const macroTool = fitnessPlugins.find((p) => p.name === 'fitness_calculate_macros');
  const profTool = fitnessPlugins.find((p) => p.name === 'fitness_view_training_profile');

  assert.ok(workoutTool);
  assert.ok(macroTool);
  assert.ok(profTool);

  const mockCtx = { log: () => {} };

  const workoutRes = await workoutTool.run({}, mockCtx);
  assert.match(workoutRes, /ADAPTIVE TRAINING SESSION/i);

  const macroRes = await macroTool.run({ bodyweight_kg: 75 }, mockCtx);
  assert.match(macroRes, /NUTRITION & MACRONUTRIENT TARGETS/i);

  const profRes = await profTool.run({}, mockCtx);
  assert.match(profRes, /ATHLETIC PROFILE/i);
});
