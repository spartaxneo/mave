'use strict';
// Autonomous Adaptive Cognitive Neuro-Acoustic Soundscape Plugin for Mave.

const { getSoundscapeGenerator } = require('../../audio/soundscape_generator');

module.exports = [
  {
    name: 'soundscape_generate_focus_audio',
    description: 'Generates a customized cognitive neuro-acoustic soundscape profile utilizing binaural beat entrainment and colored ambient noise.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['ALPHA', 'BETA', 'THETA', 'DELTA', 'GAMMA'],
          description: 'Cognitive state: ALPHA (flow), BETA (deep coding), THETA (creativity), DELTA (sleep), GAMMA (synthesis).',
        },
        duration_minutes: { type: 'number', description: 'Duration of focus soundscape session in minutes.' },
        ambient_texture: {
          type: 'string',
          enum: ['BROWN_NOISE', 'PINK_NOISE', 'WHITE_NOISE', 'RAIN_COASTAL'],
          description: 'Background ambient noise texture.',
        },
        heart_rate_bpm: { type: 'number', description: 'Optional live pulse from smartwatch for biofeedback down-regulation.' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const gen = getSoundscapeGenerator();
      ctx.log('info', `Synthesizing cognitive acoustic soundscape: mode ${input.mode}`);

      const profile = gen.generateSoundscapeProfile({
        mode: input.mode,
        durationMinutes: input.duration_minutes || 45,
        ambientLayer: input.ambient_texture || 'BROWN_NOISE',
        heartRateBpm: input.heart_rate_bpm,
      });

      const bio = profile.biofeedbackAdjustment 
        ? `\n💓 **Biofeedback Adjustment**: ${profile.biofeedbackAdjustment.recommendation}`
        : '';

      return `🎧 **COGNITIVE ACOUSTIC SOUNDSCAPE GENERATED**:
• **Target State**: **${profile.cognitiveTarget}** (\`${profile.mode}\`)
• **Binaural Differential**: Left: \`${profile.frequencies.leftChannelHz} Hz\` | Right: \`${profile.frequencies.rightChannelHz} Hz\` (**Δ ${profile.frequencies.binauralBeatHz} Hz**)
• **Ambient Texture**: \`${profile.acousticLayer.textureName}\` (${profile.acousticLayer.spectralSlope})
• **Session Duration**: **${profile.durationMinutes} minutes**${bio}
ℹ️ *${profile.headphoneRequirement}*`;
    },
  },
];
