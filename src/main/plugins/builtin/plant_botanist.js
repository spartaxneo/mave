'use strict';
// Autonomous Plant Botanist & Indoor Garden Intelligence Plugin for Mave.

const { getPlantBotanist } = require('../../botany/plant_botanist');

module.exports = [
  {
    name: 'botany_check_watering_schedule',
    description: 'Check watering schedules and soil moisture levels for household plants (Monstera, Fiddle Leaf Fig, Snake Plant, Herbs) to see which need water today.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const botanist = getPlantBotanist();
      ctx.log('info', 'Auditing plant soil moisture and watering intervals...');

      const sched = botanist.checkWateringSchedule();
      const rows = sched.map((p) => {
        const flag = p.status === 'Needs Water Today' ? '💧 **NEEDS WATER TODAY**' : p.status === 'Water Tomorrow' ? '⏳ Water Tomorrow' : '🟢 Hydrated';
        return `• **${p.name}** [${p.location}]: ${flag} (Soil Moisture: ${p.soilMoisturePct}%, Last Watered: ${p.daysSinceWatered} days ago)`;
      }).join('\n');

      return `🌿 **BOTANICAL WATERING AUDIT & SCHEDULE** (${sched.length} plants):\n\n${rows}`;
    },
  },

  {
    name: 'botany_log_watering',
    description: 'Record that a specific plant was watered today, resetting its hydration schedule and moisture level.',
    input_schema: {
      type: 'object',
      properties: {
        plant_name_or_id: { type: 'string', description: 'Name or ID of the plant (e.g. "Monstera", "Fiddle Leaf Fig", "Snake Plant").' },
      },
      required: ['plant_name_or_id'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const botanist = getPlantBotanist();
      const p = botanist.waterPlant(input.plant_name_or_id);
      ctx.log('info', `Watering logged for ${p.name}.`);

      return `💧 **PLANT WATERED**:
• **Plant**: **${p.name}**
• **Location**: ${p.location}
• **Next Watering Due**: In ${p.wateringIntervalDays} days.
• **Soil Moisture**: Reset to 85% (Optimal).`;
    },
  },

  {
    name: 'botany_diagnose_plant_health',
    description: 'Diagnose plant symptoms (yellow leaves, brown crispy tips, leggy stems, white powdery spots) and get biological botanical guidance.',
    input_schema: {
      type: 'object',
      properties: {
        symptom: {
          type: 'string',
          enum: ['yellow_leaves', 'brown_crispy_tips', 'leggy_stems', 'powdery_mildew'],
          description: 'Observed plant symptom.',
        },
      },
      required: ['symptom'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const botanist = getPlantBotanist();
      const diag = botanist.diagnoseSymptom(input.symptom);

      return `🌱 **BOTANICAL PATHOLOGY DIAGNOSTIC**:
• **Symptom**: **${diag.symptom}**
• **Primary Cause**: ${diag.cause}
• **Severity / Urgency**: \`${diag.urgency.toUpperCase()}\`

💡 **Treatment Protocol**:
${diag.treatment}`;
    },
  },

  {
    name: 'botany_list_plants',
    description: 'List all registered household plants, their species, locations, and care instructions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const botanist = getPlantBotanist();
      const plants = botanist.getPlants();

      const rows = plants.map((p) => `• **${p.name}** (*${p.species}*) [${p.location}]: Every ${p.wateringIntervalDays} days | Light: ${p.lightRequirement}`).join('\n');

      return `🪴 **REGISTERED INDOOR FLORA (${plants.length})**:\n\n${rows}`;
    },
  },
];
