'use strict';

/**
 * HeyGem & Duix-Avatar Digital Human Video Synthesis Plugin
 * 
 * Inspired by suifeng9203/HeyGem.ai & Duix-Avatar:
 * Generates photorealistic AI talking avatars, high-precision viseme lip-sync,
 * procedural micro-expressions, and live interactive avatar streams.
 */

const { getAvatarProducer } = require('../../avatar/avatar_producer');
const { getLipSyncEngine } = require('../../avatar/lip_sync_engine');

module.exports = [
  {
    name: 'heygem_create_avatar_video',
    description: 'Generate a photorealistic digital human video of an AI avatar speaking a custom script with synchronized lip motion and micro-expressions.',
    input_schema: {
      type: 'object',
      properties: {
        script_text: {
          type: 'string',
          description: 'Spoken dialogue or monologue for the digital human.'
        },
        avatar_id: {
          type: 'string',
          description: 'Avatar persona ID (alex-tech, elena-educator, marcus-executive, aria-companion, or custom ID).'
        },
        resolution: {
          type: 'string',
          enum: ['720p', '1080p', '4k'],
          description: 'Target video resolution (default: 1080p).'
        }
      },
      required: ['script_text'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const producer = getAvatarProducer();
      ctx.log?.('info', `Producing digital human avatar video with ${input.avatar_id || 'alex-tech'}...`);

      const result = await producer.produceAvatarVideo({
        avatarId: input.avatar_id || 'alex-tech',
        scriptText: input.script_text,
        resolution: input.resolution || '1080p'
      });

      return `👤 **DIGITAL HUMAN VIDEO GENERATED (HeyGem / Duix Architecture)**:
• **Avatar Persona**: **${result.avatar.name}** (${result.avatar.title})
• **Speech Duration**: **${result.durationSec}s** (${result.totalFrames} frames @ 30 FPS)
• **Acoustic Visemes**: **${result.visemeKeyframeCount} keyframes** with coarticulation smoothing
• **Interactive Player**: \`${result.htmlPreviewPath}\`
• **View Asset**: [Open Video Preview](file:///${result.htmlPreviewPath.replace(/\\/g, '/')})

🎬 **Production FFmpeg Command**:
\`\`\`powershell
${result.ffmpegRenderCommand}
\`\`\``;
    }
  },

  {
    name: 'heygem_preview_realtime_avatar',
    description: 'Launch real-time interactive digital human preview stream responding to live conversation and voice.',
    input_schema: {
      type: 'object',
      properties: {
        avatar_id: {
          type: 'string',
          description: 'Avatar ID to preview (default: alex-tech).'
        },
        message: {
          type: 'string',
          description: 'Spoken preview line for the avatar.'
        }
      },
      additionalProperties: false
    },
    async run(input, ctx) {
      const producer = getAvatarProducer();
      const avatar = producer.getAvatar(input.avatar_id || 'alex-tech');
      const text = input.message || 'I am your visual AI companion, powered by Mave and HeyGem offline synthesis.';

      const result = await producer.produceAvatarVideo({
        avatarId: avatar.id,
        scriptText: text
      });

      return `🎥 **REAL-TIME AVATAR STREAM READY**:
• **Active Avatar**: **${avatar.name}** (\`${avatar.id}\`)
• **Theme Color**: \`${avatar.themeColor}\` | **Style**: \`${avatar.style}\`
• **Interactive Live HUD**: \`${result.htmlPreviewPath}\`
• Stream is active for realtime voice synthesis and live conversational reactions!`;
    }
  },

  {
    name: 'heygem_clone_custom_avatar',
    description: 'Clone a custom digital human avatar from video or webcam footage to create your personal digital twin.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the custom avatar (e.g. "My Digital Twin", "Professor Dave").'
        },
        source_media: {
          type: 'string',
          description: 'Path to source portrait video or image (.mp4, .png, .jpg).'
        },
        description: {
          type: 'string',
          description: 'Short description or title of the avatar persona.'
        },
        gender: {
          type: 'string',
          enum: ['male', 'female', 'neutral'],
          description: 'Gender archetype for vocal resonance.'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const producer = getAvatarProducer();
      ctx.log?.('info', `Cloning custom digital human avatar for "${input.name}"...`);

      const clone = producer.cloneAvatar({
        name: input.name,
        sourceMedia: input.source_media,
        description: input.description,
        gender: input.gender || 'neutral'
      });

      return `✨ **CUSTOM DIGITAL HUMAN AVATAR CLONED**:
• **Name**: **${clone.name}**
• **Avatar ID**: \`${clone.id}\`
• **Reference Media**: \`${clone.sourceMedia}\`
• **Style**: \`${clone.style}\`
• **Status**: Registered in Mave Avatar Catalog. Ready for video generation!`;
    }
  },

  {
    name: 'heygem_list_avatars',
    description: 'List all built-in and cloned digital human avatars available in Mave.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async run(input, ctx) {
      const producer = getAvatarProducer();
      const avatars = producer.listAvatars();

      const items = avatars.map(a =>
        `• **${a.name}** (\`${a.id}\`)${a.isCustom ? ' *(Custom Cloned)*' : ''}\n  - **Title**: ${a.title}\n  - **Style**: ${a.style} | **Gender**: ${a.gender}\n  - **Voice Binding**: \`${a.voiceId || 'default'}\` | **Studio**: \`${a.background}\``
      ).join('\n\n');

      return `👤 **MAVE DIGITAL HUMAN AVATAR CATALOG**:

${items}

💡 *Use \`heygem_create_avatar_video\` to render videos or \`heygem_clone_custom_avatar\` to clone your own likeness.*`;
    }
  },

  {
    name: 'heygem_synthesize_lip_sync',
    description: 'Synthesize high-precision MPEG-4/FACS viseme timeline and coarticulation curves for any speech script.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text script to decompose into visemes.'
        },
        duration_seconds: {
          type: 'number',
          description: 'Optional target speech duration in seconds.'
        }
      },
      required: ['text'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const engine = getLipSyncEngine();
      const timeline = engine.generateVisemeTimeline({
        text: input.text,
        durationSec: input.duration_seconds
      });

      const sampleFrames = timeline.keyframes.slice(0, 5).map(k =>
        `  - \`T=${k.timeSec.toFixed(2)}s\`: **${k.viseme.toUpperCase()}** (openness: ${k.openness}, width: ${k.width}${k.word ? `, word: "${k.word}"` : ''})`
      ).join('\n');

      return `👄 **ACOUSTIC LIP-SYNC & COARTICULATION SYNTHESIS**:
• **Script**: "${input.text}"
• **Total Duration**: **${timeline.totalDurationSec}s** (${timeline.wordCount} words)
• **Keyframe Count**: **${timeline.keyframeCount} viseme states**
• **Sample Coarticulated Keyframes**:
${sampleFrames}
  - *(...and ${timeline.keyframeCount - 5} more frames)*

Coarticulation filter applied: 3-point temporal Gaussian kernel for organic mouth transitions.`;
    }
  }
];
