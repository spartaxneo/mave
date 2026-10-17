'use strict';
// Autonomous Personal Fitness Coach & Movement Intelligence for Mave.
// 1. Recovery-Adaptive Workouts (Synthesizes exercises based on Apple Watch / Oura sleep & HRV)
// 2. Equipment-Aware Training (Home gym, dumbbells, bodyweight, pull-up bar)
// 3. Movement & Form Guidelines (Squats, pushups, hinges, core bracing)
// 4. Daily Macronutrient & Caloric Target Calculator

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const { getWearablesHealthHub } = require('../wearables/wearables_health_hub');

function defaultFitnessDir() {
  const base = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(base, 'fitness', 'fitness_profile.json');
}

const DEFAULT_PROFILE = {
  userGoal: 'strength_and_longevity', // 'hypertrophy', 'fat_loss', 'mobility'
  equipmentAvailable: ['adjustable_dumbbells', 'pull_up_bar', 'resistance_bands', 'yoga_mat'],
  bodyweightKg: 78,
  targetCalories: 2400,
  targetMacros: { proteinGrams: 160, carbsGrams: 240, fatGrams: 70 },
  weeklyHistory: [
    { date: '2026-10-15', focus: 'Upper Body Push & Core', durationMin: 45, completed: true },
    { date: '2026-10-16', focus: 'Zone 2 Cardio & Mobility', durationMin: 35, completed: true },
  ],
};

class FitnessCoach {
  constructor(filePath = defaultFitnessDir()) {
    this.filePath = filePath;
    this.profile = { ...DEFAULT_PROFILE };
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.bodyweightKg) this.profile = { ...this.profile, ...data };
        return;
      }
    } catch {}
    this.profile = { ...DEFAULT_PROFILE };
    this.saveSync();
  }

  saveSync() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify({ updatedAt: Date.now(), profile: this.profile }, null, 2), 'utf8');
    } catch {}
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveSync();
    }, 1500);
  }

  getProfile() {
    return this.profile;
  }

  updateProfile(updates = {}) {
    this.profile = { ...this.profile, ...updates };
    this.scheduleSave();
    return this.profile;
  }

  generateAdaptiveWorkout({ targetDurationMin = 45, customEquipment = null } = {}) {
    const healthHub = getWearablesHealthHub();
    const appleWatch = healthHub.getDevice('Apple Watch Ultra 2');
    const sleepScore = appleWatch?.vitals?.sleepScorePct || 85;
    const hrv = appleWatch?.vitals?.hrvMs || 58;

    const equip = customEquipment || this.profile.equipmentAvailable;
    const hasDumbbells = equip.includes('adjustable_dumbbells') || equip.includes('dumbbells');
    const hasPullUp = equip.includes('pull_up_bar');

    let intensity = 'High Intensity Strength & Hypertrophy';
    let recoveryState = `Optimal Recovery (Sleep: ${sleepScore}%, HRV: ${hrv}ms). Body is primed for progressive overload.`;
    let exercises = [];

    if (sleepScore < 65) {
      intensity = 'Active Recovery & Zone 2 Mobility';
      recoveryState = `Fatigued Recovery (Sleep: ${sleepScore}%). Avoiding high CNS fatigue; prioritizing joint lubrication and blood flow.`;
      exercises = [
        { name: 'Cat-Cow & Thoracic Spine Rotations', sets: '3 sets', repsOrTime: '10 reps per side', focus: 'Spine decompression' },
        { name: 'Deep Goblet Squat Hold', sets: '3 sets', repsOrTime: '45 seconds', focus: 'Hip mobility & ankle dorsiflexion' },
        { name: 'Zone 2 Brisk Incline Walk or Light Cycling', sets: '1 block', repsOrTime: '25 minutes', focus: 'Parasympathetic recovery' },
        { name: 'Dead Hang from Pull-up Bar', sets: '3 sets', repsOrTime: '45 seconds', focus: 'Shoulder subacromial space & grip' },
      ];
    } else {
      exercises = [
        { name: hasDumbbells ? 'Dumbbell Romanian Deadlifts' : 'Single-Leg Bodyweight Hinges', sets: '4 sets', repsOrTime: '10-12 reps', focus: 'Posterior chain & hamstrings' },
        { name: hasPullUp ? 'Strict Pull-Ups (Overhand Grip)' : 'Inverted Table Rows', sets: '4 sets', repsOrTime: '8-10 reps', focus: 'Latissimus dorsi & scapular retraction' },
        { name: hasDumbbells ? 'Overhead Dumbbell Push Press' : 'Pike Push-ups', sets: '3 sets', repsOrTime: '10 reps', focus: 'Deltoids & triceps' },
        { name: 'Bulgarian Split Squats', sets: '3 sets', repsOrTime: '10 reps per leg', focus: 'Quadriceps & glute stability' },
        { name: 'Hanging Knee Raises / Abdominal Hollow Hold', sets: '3 sets', repsOrTime: '15 reps / 45 sec', focus: 'Core compression' },
      ];
    }

    return {
      sessionTitle: `${intensity} Session`,
      durationMinutes: targetDurationMin,
      recoveryContext: recoveryState,
      intensityTier: intensity,
      exercises,
      coachingNotes: 'Maintain neutral lumbar spine, brace abdominal cylinder before each rep, and control the 3-second eccentric phase.',
    };
  }

  calculateMacros(targetWeightKg = null, goal = 'maintenance') {
    const weight = targetWeightKg || this.profile.bodyweightKg;
    let calories = 2400;
    let protein = Math.round(weight * 2.0); // 2g per kg
    let fat = Math.round(weight * 0.9);

    if (goal === 'fat_loss') {
      calories = Math.round(weight * 26);
      protein = Math.round(weight * 2.2);
    } else if (goal === 'muscle_gain') {
      calories = Math.round(weight * 36);
    }

    const carbCalories = Math.max(0, calories - (protein * 4 + fat * 9));
    const carbs = Math.round(carbCalories / 4);

    return {
      targetCalories: calories,
      proteinGrams: protein,
      carbsGrams: carbs,
      fatGrams: fat,
      notes: `Optimal distribution for ${weight} kg bodyweight aiming for ${goal.replace('_', ' ')}.`,
    };
  }
}

let fitnessCoachInstance = null;
function getFitnessCoach(customPath = null) {
  if (customPath) return new FitnessCoach(customPath);
  if (!fitnessCoachInstance) fitnessCoachInstance = new FitnessCoach();
  return fitnessCoachInstance;
}

module.exports = {
  FitnessCoach,
  getFitnessCoach,
  DEFAULT_PROFILE,
};
