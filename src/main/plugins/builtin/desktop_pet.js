'use strict';
// Desktop Pet Companion Plugin ("Codex Pets") for Bigfoot.
// Provides an always-on-screen animated pixel-art desktop pet that tracks agent
// lifecycle states in real time (idle, thinking, working, success, error, listening).
// Supports pet interactions, leveling up, custom hatching, and species switching.

const { getPetEngine, DEFAULT_SPECIES } = require('../../pet/pet_engine');

module.exports = [
  {
    name: 'toggle_desktop_pet',
    description: 'Toggle or show/hide the floating always-on-screen desktop pet companion on your monitors.',
    input_schema: {
      type: 'object',
      properties: {
        visible: {
          type: 'boolean',
          description: 'True to show the pet, false to hide it.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getPetEngine();
      if (input.visible !== undefined) {
        engine.state.enabled = input.visible;
      } else {
        engine.state.enabled = !engine.state.enabled;
      }
      engine.saveState();

      const pet = engine.activePet;
      ctx.log('info', `Desktop pet companion ${engine.state.enabled ? 'activated' : 'hidden'}: ${pet.name} (${pet.species})`);

      return `🐾 **DESKTOP PET COMPANION ${engine.state.enabled ? 'ON SCREEN' : 'HIDDEN'}**:
• **Active Companion**: **${pet.name}** the ${pet.species.replace('_', ' ')}
• **Current State**: *${pet.state}* (Happiness: ${pet.happiness}%)
• **Interaction**: Click the pet on your screen to pet, or hover to feed snacks!`;
    },
  },
  {
    name: 'set_pet_species',
    description: 'Switch the active pet companion species (cyber_fox, mini_robot, pixel_cat, baby_dragon, shiba_inu, ghost).',
    input_schema: {
      type: 'object',
      properties: {
        species: {
          type: 'string',
          enum: ['cyber_fox', 'mini_robot', 'pixel_cat', 'baby_dragon', 'shiba_inu', 'ghost'],
          description: 'The species of pet to switch to.',
        },
        name: {
          type: 'string',
          description: 'Optional custom name for this companion.',
        },
      },
      required: ['species'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getPetEngine();
      const pet = engine.setSpecies(input.species, input.name);
      ctx.log('info', `Switched active pet to ${pet.name} (${pet.species})`);

      return `✨ **PET COMPANION SWITCHED**:
• **Species**: **${pet.species.replace('_', ' ')}**
• **Name**: **${pet.name}**
• **Personality**: *${pet.personality}*
• **Status**: Active and roaming your desktop.`;
    },
  },
  {
    name: 'hatch_custom_pet',
    description: 'Hatch a brand-new personalized desktop companion with custom name, personality, and color palette.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the new companion.',
        },
        species: {
          type: 'string',
          enum: ['cyber_fox', 'mini_robot', 'pixel_cat', 'baby_dragon', 'shiba_inu', 'ghost'],
          description: 'Base species of the companion.',
        },
        personality: {
          type: 'string',
          description: 'Personality description (e.g. "Hyper-focused coding partner", "Playful explorer").',
        },
        color: {
          type: 'string',
          description: 'Theme accent hex color (e.g. "#6366F1", "#10B981").',
        },
      },
      required: ['name', 'species'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getPetEngine();
      const pet = engine.hatchPet(input.name, input.species, input.personality, input.color);
      ctx.log('info', `Hatched new companion: ${pet.name} (${pet.species})`);

      return `🐣 **NEW DESKTOP PET HATCHED!**:
• **Name**: **${pet.name}**
• **Species**: ${pet.species.replace('_', ' ')}
• **Personality**: *${pet.personality}*
• **Level**: 1 (Happiness: 100%)
• **Initial Thought**: "${pet.speechBubble}"`;
    },
  },
  {
    name: 'interact_with_pet',
    description: 'Interact with your on-screen pet companion by feeding snacks, petting, or playing to level up happiness.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['feed', 'pet', 'play'],
          description: 'Type of interaction.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const engine = getPetEngine();
      const res = engine.interact(input.action);
      ctx.log('info', `Interacted with ${res.pet.name} (${input.action})`);

      return `🐾 **PET INTERACTION**:
${res.message}
• **Happiness**: ${res.pet.happiness}%
• **Hunger**: ${res.pet.hunger}%
• **Level**: ${res.pet.level} ⭐`;
    },
  },
  {
    name: 'get_pet_status',
    description: 'Check the current status, level, happiness, and active animation state of your desktop pet.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(_input, ctx) {
      const engine = getPetEngine();
      const st = engine.getStatus();

      return `🐾 **DESKTOP PET STATUS** (${st.emoji} **${st.name}**):
• **Species**: ${st.species.replace('_', ' ')}
• **Personality**: *${st.personality}*
• **Level**: ${st.level} ⭐
• **Happiness**: ${st.happiness}%
• **Hunger**: ${st.hunger}%
• **Agent State**: \`${st.state}\`
• **Speech Bubble**: "${st.speechBubble || 'Ready to assist!'}"
• **Total Pets Hatched**: ${st.totalHatched}`;
    },
  },
];
