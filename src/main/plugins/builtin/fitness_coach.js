'use strict';
// Autonomous Personal Fitness Coach & Movement Intelligence Plugin for Mave.

const { getFitnessCoach } = require('../../fitness/fitness_coach');

module.exports = [
  {
    name: 'fitness_generate_adaptive_workout',
    description: 'Generate an adaptive daily workout tailored to your available equipment and current physiological recovery score from smartwatches (sleep & HRV).',
    input_schema: {
      type: 'object',
      properties: {
        target_duration_minutes: { type: 'number', description: 'Desired workout session length in minutes (default: 45).' },
        equipment: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional equipment override (e.g. ["dumbbells", "pull_up_bar", "bodyweight"]).',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const coach = getFitnessCoach();
      ctx.log('info', 'Analyzing physiological recovery and generating tailored workout...');

      const plan = coach.generateAdaptiveWorkout({
        targetDurationMin: input.target_duration_minutes || 45,
        customEquipment: input.equipment,
      });

      const exerciseRows = plan.exercises.map((e, idx) =>
        `**${idx + 1}. ${e.name}**\n  • Volume: ${e.sets} × ${e.repsOrTime} | *Focus: ${e.focus}*`
      ).join('\n\n');

      return `🏋️ **ADAPTIVE TRAINING SESSION: ${plan.sessionTitle.toUpperCase()}**:
• **Duration**: **${plan.durationMinutes} minutes**
• **Recovery Telemetry**: ${plan.recoveryContext}

📋 **Prescribed Movements**:
${exerciseRows}

💡 **Form & Biomechanical Guidance**:
${plan.coachingNotes}`;
    },
  },

  {
    name: 'fitness_calculate_macros',
    description: 'Calculate optimal daily caloric intake and macronutrient targets (protein, carbs, fats) based on bodyweight and fitness goal.',
    input_schema: {
      type: 'object',
      properties: {
        bodyweight_kg: { type: 'number', description: 'Body weight in kilograms.' },
        goal: {
          type: 'string',
          enum: ['maintenance', 'fat_loss', 'muscle_gain'],
          description: 'Fitness objective (default: "maintenance").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const coach = getFitnessCoach();
      const macros = coach.calculateMacros(input.bodyweight_kg, input.goal || 'maintenance');

      return `🥗 **NUTRITION & MACRONUTRIENT TARGETS**:
• **Target Daily Energy**: **${macros.targetCalories} kcal**
• **Protein**: **${macros.proteinGrams}g** (${macros.proteinGrams * 4} kcal)
• **Carbohydrates**: **${macros.carbsGrams}g** (${macros.carbsGrams * 4} kcal)
• **Healthy Fats**: **${macros.fatGrams}g** (${macros.fatGrams * 9} kcal)

📌 **Notes**: ${macros.notes}`;
    },
  },

  {
    name: 'fitness_view_training_profile',
    description: 'View current fitness profile, registered home gym equipment, and weekly workout completion history.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const coach = getFitnessCoach();
      const prof = coach.getProfile();

      const equip = prof.equipmentAvailable.map((e) => `• ${e.replace(/_/g, ' ')}`).join('\n');
      const hist = (prof.weeklyHistory || []).map((h) => `• [${h.date}] **${h.focus}** (${h.durationMin} min, Completed: ${h.completed ? '✅' : 'No'})`).join('\n');

      return `🏃 **ATHLETIC PROFILE & EQUIPMENT**:
• **Primary Objective**: \`${prof.userGoal}\`
• **Bodyweight**: **${prof.bodyweightKg} kg**

🏋️ **Registered Training Equipment**:
${equip}

📅 **Recent Training History**:
${hist}`;
    },
  },
];
